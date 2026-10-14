begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- No activation, keys or existing-member backfill. Uses existing identity_enabled=false.
create table edu_tips_private.identity_jobs (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 wording_version text not null references public.edu_personalization_terms(version),
 revision uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 attempt_count integer not null default 0 check(attempt_count>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_token uuid,
 lease_until timestamptz,
 completed_at timestamptz,
 cancelled_at timestamptz,
 attention boolean not null default false,
 last_error_code text check(last_error_code in ('unavailable','blocked','disabled','migration_required')),
 check((lease_token is null)=(lease_until is null))
);
create index edu_tips_identity_jobs_due on edu_tips_private.identity_jobs(next_attempt_at,member_id) where completed_at is null and cancelled_at is null;
alter table edu_tips_private.identity_jobs enable row level security;
revoke all on edu_tips_private.identity_jobs from public,anon,authenticated,service_role;
grant select on edu_tips_private.identity_jobs to service_role;
create function edu_tips_private.identity_choice_job() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then update edu_tips_private.identity_jobs set cancelled_at=clock_timestamp(),lease_token=null,lease_until=null where member_id=old.member_id;return old;end if;
 if not new.analysis or not new.overseas then
 update edu_tips_private.identity_jobs set cancelled_at=clock_timestamp(),lease_token=null,lease_until=null where member_id=new.member_id;
 return new;
 end if;
 if not(select identity_enabled from edu_tips_private.control_settings where id=1) then return new;end if;
 if not exists(select 1 from public.profiles p join public.edu_personalization_terms t on t.version=new.wording_version where p.id=new.member_id and p.status='active' and p.role not in ('admin','staff') and not p.is_internal and p.deleted_at is null and t.is_current and t.approved_at<=clock_timestamp() and t.effective_at<=clock_timestamp()) then return new;end if;
 insert into edu_tips_private.identity_jobs(member_id,wording_version,revision) values(new.member_id,new.wording_version,new.revision)
 on conflict(member_id) do update set wording_version=excluded.wording_version,revision=excluded.revision,updated_at=clock_timestamp(),next_attempt_at=clock_timestamp(),attempt_count=0,lease_token=null,lease_until=null,completed_at=null,cancelled_at=null,attention=false,last_error_code=null
 where edu_tips_private.identity_jobs.revision is distinct from excluded.revision;
 return new;
end$$;
create trigger edu_tips_identity_choice_job after insert or update or delete on public.edu_personalization_preferences for each row execute function edu_tips_private.identity_choice_job();
create function edu_tips_private.identity_member_cancel() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then update edu_tips_private.identity_jobs set cancelled_at=clock_timestamp(),lease_token=null,lease_until=null where member_id=old.id;return old;end if;
 if new.status is distinct from 'active' or new.role in ('admin','staff') or new.role is null or new.is_internal or new.deleted_at is not null then update edu_tips_private.identity_jobs set cancelled_at=clock_timestamp(),lease_token=null,lease_until=null where member_id=new.id;end if;
 return new;
end$$;
create trigger edu_tips_identity_member_cancel before update of status,role,is_internal,deleted_at or delete on public.profiles for each row execute function edu_tips_private.identity_member_cancel();
create function public.edu_tips_claim_identity_jobs_candidate(p_member uuid default null,p_limit integer default 4) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if p_limit is null or p_limit<1 or p_limit>20 then raise exception 'TIPS_IDENTITY_JOB_INVALID';end if;
 if not(select identity_enabled from edu_tips_private.control_settings where id=1) then return '[]'::jsonb;end if;
 with due as(select j.member_id from edu_tips_private.identity_jobs j
 join public.profiles p on p.id=j.member_id join public.edu_personalization_preferences pref on pref.member_id=j.member_id join public.edu_personalization_terms t on t.version=pref.wording_version
 where j.completed_at is null and j.cancelled_at is null and j.next_attempt_at<=clock_timestamp() and (j.lease_until is null or j.lease_until<=clock_timestamp()) and (p_member is null or j.member_id=p_member)
 and p.status='active' and p.role not in ('admin','staff') and not p.is_internal and p.deleted_at is null and pref.analysis and pref.overseas and pref.wording_version=j.wording_version and pref.revision=j.revision and t.is_current and t.approved_at<=clock_timestamp() and t.effective_at<=clock_timestamp()
 order by j.next_attempt_at,j.member_id for update of j skip locked limit p_limit),
 claimed as(update edu_tips_private.identity_jobs j set attempt_count=j.attempt_count+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds' from due where j.member_id=due.member_id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('member',member_id,'version',wording_version,'revision',revision,'lease',lease_token,'attempt',attempt_count)),'[]'::jsonb) into r from claimed;
 return r;
end$$;
create function public.edu_tips_finish_identity_job_candidate(p_member uuid,p_revision uuid,p_lease uuid,p_code text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_code is null or p_code not in ('done','unavailable','blocked','disabled','migration_required') then raise exception 'TIPS_IDENTITY_JOB_INVALID';end if;
 perform 1 from edu_tips_private.identity_jobs where member_id=p_member and revision=p_revision and lease_token=p_lease and lease_until>clock_timestamp() and cancelled_at is null and completed_at is null for update;
 if not found then return false;end if;
 if p_code='done' and not exists(select 1 from edu_tips_private.subjects s join public.edu_personalization_preferences pref on pref.member_id=s.member_id join public.profiles p on p.id=s.member_id join public.edu_personalization_terms t on t.version=s.wording_version
 where s.member_id=p_member and s.retired_at is null and pref.revision=p_revision and pref.analysis and pref.overseas and pref.wording_version=s.wording_version and p.status='active' and p.role not in ('admin','staff') and not p.is_internal and p.deleted_at is null and t.is_current and t.approved_at<=clock_timestamp() and t.effective_at<=clock_timestamp()
 and not exists(select 1 from edu_tips_private.subjects x join edu_tips_private.erasure_outbox q on q.subject_id=x.id where x.member_id=p_member and q.completed_at is null)) then raise exception 'TIPS_IDENTITY_JOB_INVALID';end if;

 update edu_tips_private.identity_jobs set completed_at=case when p_code='done' then clock_timestamp() else null end,
 next_attempt_at=clock_timestamp()+make_interval(secs=>case when p_code in ('blocked','migration_required') then 300 else least(300,5*power(2,least(attempt_count-1,6))) end::integer),attention=p_code in ('blocked','migration_required'),last_error_code=case when p_code='done' then null else p_code end,lease_token=null,lease_until=null
 where member_id=p_member and revision=p_revision and lease_token=p_lease and lease_until>clock_timestamp() and cancelled_at is null and completed_at is null;
 return found;
end$$;
create function public.edu_tips_identity_job_status_candidate() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('pending',count(*) filter(where completed_at is null and cancelled_at is null), 'attention',count(*) filter(where completed_at is null and cancelled_at is null and attention), 'completed',count(*) filter(where completed_at is not null),'enabled',coalesce((select identity_enabled from edu_tips_private.control_settings where id=1),false)) from edu_tips_private.identity_jobs
$$;
revoke all on function edu_tips_private.identity_choice_job(),edu_tips_private.identity_member_cancel() from public,anon,authenticated,service_role;
revoke all on function public.edu_tips_claim_identity_jobs_candidate(uuid,integer),public.edu_tips_finish_identity_job_candidate(uuid,uuid,uuid,text),public.edu_tips_identity_job_status_candidate() from public,anon,authenticated;
grant execute on function public.edu_tips_claim_identity_jobs_candidate(uuid,integer),public.edu_tips_finish_identity_job_candidate(uuid,uuid,uuid,text),public.edu_tips_identity_job_status_candidate() to service_role;
commit;
