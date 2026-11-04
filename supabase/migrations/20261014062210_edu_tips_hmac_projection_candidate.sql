begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Local candidate only. No keys, existing-ID conversion or automatic rekey.
create table edu_tips_private.hmac_settings (
 id integer primary key check(id=1), enabled boolean not null default false,
 profile text not null default 'edu.hmac.v1-draft.1' check(profile='edu.hmac.v1-draft.1'),
 record_key_version text not null default 'rk1' check(record_key_version ~ '^rk[1-9][0-9]{0,2}$'),
 record_key_fingerprint text check(record_key_fingerprint ~ '^[0-9a-f]{64}$')
);
insert into edu_tips_private.hmac_settings(id) values(1);
create table edu_tips_private.hmac_intents (
 pending_id uuid primary key references edu_tips_private.pending_identities(id),
 member_id uuid references public.profiles(id) on delete set null, customer_id text not null, consent_epoch text not null,
 profile text not null, record_key_version text not null, record_key_fingerprint text not null
);
create unique index edu_tips_hmac_intent_target on edu_tips_private.hmac_intents(member_id,customer_id,consent_epoch);
create table edu_tips_private.hmac_subjects (
 subject_id uuid primary key references edu_tips_private.subjects(id),
 profile text not null check(profile='edu.hmac.v1-draft.1'), record_key_version text not null, record_key_fingerprint text not null,
 bound_at timestamptz not null default clock_timestamp()
);
create table edu_tips_private.hmac_refs (
 subject_id uuid not null references edu_tips_private.hmac_subjects(subject_id),
 kind text not null check(kind in ('order','payment','refund','event','row')), source_key text not null,
 opaque text not null check(opaque ~ '^[A-Za-z0-9_-]{43}$'),
 primary key(subject_id,kind,source_key)
);
-- Same immutable source record may belong to a new *authorized* generation;
-- ownership is per subject, never a global alias/cross-brand customer merge.
create table edu_tips_private.hmac_jobs (
 subject_id uuid primary key references edu_tips_private.hmac_subjects(subject_id),
 revision bigint not null default 1 check(revision>0), applied_revision bigint not null default 0,
 next_attempt_at timestamptz not null default clock_timestamp(), attempts integer not null default 0,
 lease_token uuid, lease_until timestamptz, cancelled_at timestamptz,
 attention boolean not null default false, check((lease_token is null)=(lease_until is null))
);
create index edu_tips_hmac_jobs_due on edu_tips_private.hmac_jobs(next_attempt_at,subject_id) where cancelled_at is null and revision>applied_revision;
do $$declare n text;begin
 foreach n in array array['hmac_settings','hmac_intents','hmac_subjects','hmac_refs','hmac_jobs'] loop
 execute format('alter table edu_tips_private.%I enable row level security',n);
 execute format('revoke all on edu_tips_private.%I from public,anon,authenticated,service_role',n);
 execute format('grant select on edu_tips_private.%I to service_role',n);
 end loop;
end$$;
create function edu_tips_private.guard_hmac_pin() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='hmac_settings' then
 if (new.profile,new.record_key_version,new.record_key_fingerprint) is distinct from (old.profile,old.record_key_version,old.record_key_fingerprint)
 and exists(select 1 from edu_tips_private.hmac_subjects) then raise exception 'TIPS_HMAC_MIGRATION_REQUIRED';end if;
 if (new.enabled,new.profile,new.record_key_version,new.record_key_fingerprint) is distinct from (old.enabled,old.profile,old.record_key_version,old.record_key_fingerprint) then
 -- Profile activation/stop never continues the old consumer cursor silently.
 -- Owner must separately re-enable serving and reconcile a fresh snapshot.
 update edu_tips_private.feed_state set serving_enabled=false,generation=generation+1 where singleton;
 end if;
 elsif tg_table_name='hmac_subjects' then
 if new is distinct from old then raise exception 'TIPS_HMAC_IMMUTABLE';end if;
 else
 if (new.subject_id,new.kind,new.source_key,new.opaque) is distinct from (old.subject_id,old.kind,old.source_key,old.opaque) then raise exception 'TIPS_HMAC_IMMUTABLE';end if;
 end if;return new;
end$$;
create trigger edu_tips_hmac_settings_guard before update on edu_tips_private.hmac_settings for each row execute function edu_tips_private.guard_hmac_pin();
create trigger edu_tips_hmac_subject_guard before update on edu_tips_private.hmac_subjects for each row execute function edu_tips_private.guard_hmac_pin();
create trigger edu_tips_hmac_ref_guard before update on edu_tips_private.hmac_refs for each row execute function edu_tips_private.guard_hmac_pin();
-- Keep the exact installed projector (catalog case, TTL guards, safeupdates).
-- Replace the original function in place so callers retain the original OID.
do $$begin
 execute replace(pg_get_functiondef('edu_tips_private.capture_member(uuid)'::regprocedure),
 'FUNCTION edu_tips_private.capture_member(', 'FUNCTION edu_tips_private.capture_legacy_candidate(');
end$$;
revoke all on function edu_tips_private.capture_legacy_candidate(uuid) from public,anon,authenticated,service_role;
create function edu_tips_private.queue_hmac_projection(s uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from edu_tips_private.feed_state where capture_enabled)
 or not edu_tips_private.subject_allowed(s) then return;end if;
 insert into edu_tips_private.hmac_jobs(subject_id) values(s)
 on conflict(subject_id) do update set revision=edu_tips_private.hmac_jobs.revision+1,next_attempt_at=clock_timestamp(),lease_token=null,lease_until=null,attention=false where edu_tips_private.hmac_jobs.cancelled_at is null;
 insert into edu_tips_private.feed_quarantine(member_id,error_code)
 select member_id,'source_inconsistent' from edu_tips_private.subjects where id=s
 on conflict(member_id) do update set recorded_at=clock_timestamp();
end$$;
create or replace function edu_tips_private.capture_member(p_member uuid) returns void language plpgsql security invoker set search_path='' as $$
declare s edu_tips_private.subjects; i edu_tips_private.hmac_intents;
begin
 select * into s from edu_tips_private.subjects where member_id=p_member and retired_at is null;
 if not found then return;end if;
 select * into i from edu_tips_private.hmac_intents where member_id=p_member and customer_id=s.customer_id and consent_epoch=s.consent_epoch;
 if found and not exists(select 1 from edu_tips_private.hmac_subjects where subject_id=s.id) then
 insert into edu_tips_private.hmac_subjects(subject_id,profile,record_key_version,record_key_fingerprint) values(s.id,i.profile,i.record_key_version,i.record_key_fingerprint);
 end if;
 if exists(select 1 from edu_tips_private.hmac_subjects where subject_id=s.id) then
 perform edu_tips_private.queue_hmac_projection(s.id);return;
 end if;
 perform edu_tips_private.capture_legacy_candidate(p_member);
end$$;
create or replace function edu_tips_private.opaque_ref(s uuid,k text,v text) returns text language plpgsql security invoker set search_path='' as $$
declare o text;
begin
 if exists(select 1 from edu_tips_private.hmac_subjects where subject_id=s) then
 select opaque into o from edu_tips_private.hmac_refs where subject_id=s and kind=k and source_key=v;
 if o is null then raise exception 'TIPS_HMAC_REFS_PENDING';end if;return o;
 end if;
 insert into edu_tips_private.opaque_refs(subject_id,kind,source_key) values(s,k,v) on conflict do nothing;
 select opaque into o from edu_tips_private.opaque_refs where subject_id=s and kind=k and source_key=v;return o;
end$$;
create function edu_tips_private.hmac_prior_cleared(p_member uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select not exists(select 1 from edu_tips_private.subjects s join edu_tips_private.erasure_outbox q on q.subject_id=s.id
 where s.member_id=p_member and (q.completed_at is null
 or not exists(select 1 from edu_tips_private.erasure_deliveries where request_id=q.request_id)
 or exists(select 1 from edu_tips_private.erasure_deliveries d join edu_tips_private.erasure_consumers c on c.id=d.consumer_id where d.request_id=q.request_id and (d.completed_at is null or c.acked_ordinal<d.ordinal))))
$$;
create function public.edu_tips_prepare_hmac_identity_candidate(p_member uuid,p_version text,p_revision uuid,p_epoch text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg edu_tips_private.hmac_settings; r jsonb;
begin
 select * into cfg from edu_tips_private.hmac_settings where id=1 for share;
 if not cfg.enabled or cfg.record_key_fingerprint is null then return jsonb_build_object('error','disabled');end if;
 if not edu_tips_private.hmac_prior_cleared(p_member) then return jsonb_build_object('error','erasure_pending');end if;
 r:=public.edu_tips_prepare_identity_candidate(p_member,p_version,p_revision,p_epoch);
 if r->>'state'='registered' and not exists(select 1 from edu_tips_private.subjects s join edu_tips_private.hmac_subjects b on b.subject_id=s.id where s.member_id=p_member and s.retired_at is null and b.profile=cfg.profile and b.record_key_version=cfg.record_key_version and b.record_key_fingerprint=cfg.record_key_fingerprint) then
 return jsonb_build_object('error','identity_migration_required');end if;
 return r;
end$$;
create function public.edu_tips_finish_hmac_identity_candidate(p_member uuid,p_pending uuid,p_epoch text,p_customer text,p_version text,p_revision uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg edu_tips_private.hmac_settings; s edu_tips_private.subjects; r jsonb;
begin
 select * into cfg from edu_tips_private.hmac_settings where id=1 for share;
 if not cfg.enabled or cfg.record_key_fingerprint is null or not(select identity_enabled from edu_tips_private.control_settings where id=1) then return jsonb_build_object('error','disabled');end if;
 perform 1 from public.profiles where id=p_member for update;
 if not edu_tips_private.hmac_prior_cleared(p_member) then return jsonb_build_object('error','erasure_pending');end if;
 select * into s from edu_tips_private.subjects where member_id=p_member and retired_at is null;
 if found then
 if s.customer_id is distinct from p_customer or s.consent_epoch is distinct from p_epoch
 or not exists(select 1 from edu_tips_private.hmac_subjects where subject_id=s.id and profile=cfg.profile and record_key_version=cfg.record_key_version and record_key_fingerprint=cfg.record_key_fingerprint) then return jsonb_build_object('error','identity_migration_required');end if;
 return jsonb_build_object('customer_id',s.customer_id,'consent_epoch',s.consent_epoch);
 end if;
 -- Bind only an exact live pending registration, not any existing random subject.
 if not exists(select 1 from edu_tips_private.pending_identities where id=p_pending and member_id=p_member and consent_epoch=p_epoch and wording_version=p_version and consent_revision=p_revision and retired_at is null) then return jsonb_build_object('error','not_eligible');end if;
 insert into edu_tips_private.hmac_intents values(p_pending,p_member,p_customer,p_epoch,cfg.profile,cfg.record_key_version,cfg.record_key_fingerprint)
 on conflict(pending_id) do nothing;
 if not exists(select 1 from edu_tips_private.hmac_intents where pending_id=p_pending and member_id=p_member and customer_id=p_customer and consent_epoch=p_epoch and profile=cfg.profile and record_key_version=cfg.record_key_version and record_key_fingerprint=cfg.record_key_fingerprint) then raise exception 'TIPS_HMAC_IMMUTABLE';end if;
 r:=public.edu_tips_finish_identity_candidate(p_member,p_pending,p_epoch,p_customer,p_version,p_revision);
 if r ? 'error' then return r;end if;
 select * into s from edu_tips_private.subjects where member_id=p_member and retired_at is null;
 if not found or exists(select 1 from edu_tips_private.opaque_refs where subject_id=s.id)
 or exists(select 1 from edu_tips_private.feed_facts where subject_id=s.id) then raise exception 'TIPS_HMAC_MIGRATION_REQUIRED';end if;
 insert into edu_tips_private.hmac_subjects(subject_id,profile,record_key_version,record_key_fingerprint) values(s.id,cfg.profile,cfg.record_key_version,cfg.record_key_fingerprint) on conflict do nothing;
 perform edu_tips_private.queue_hmac_projection(s.id);
 return r;
end$$;
create function edu_tips_private.hmac_needed_refs(p_subject uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 with subject as(select * from edu_tips_private.subjects where id=p_subject),
 paid as(select pay.id,pay.order_id from public.payments pay join public.edu_analytics_orders o on o.id=pay.order_id join subject s on s.member_id=o.user_id
 where o.status in ('paid','partially_refunded','refunded') and pay.status in ('done','partial_cancelled','cancelled') and pay.approved_amount>0),
 keys as(
 select 'order' kind,order_id::text source_key from paid union select 'payment',id::text from paid
 union select 'event','payment:'||id from paid
 union select 'refund',r.id::text from public.refunds r join paid p on p.id=r.payment_id where r.status='done'
 union select 'event','refund:'||r.id from public.refunds r join paid p on p.id=r.payment_id where r.status='done'
 union select 'row','learning:'||e.cohort_id||':'||d.date_kst from edu_tips_private.learning_days d
 join public.enrollments e on e.id=d.enrollment_id join subject s on s.member_id=e.user_id
 join public.order_items oi on oi.id=e.order_item_id join public.edu_analytics_orders o on o.id=oi.order_id
 where e.source='purchase' and o.status in ('paid','partially_refunded','refunded')
 and d.date_kst>=((statement_timestamp()-interval '2160 hours') at time zone 'Asia/Seoul')::date
 and (d.date_kst::timestamp at time zone 'Asia/Seoul')>=greatest(s.created_at,(select capture_since from edu_tips_private.feed_state)))
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'source_key',source_key) order by kind,source_key),'[]'::jsonb) from keys
$$;
create function public.edu_tips_claim_hmac_projection_candidate(p_limit integer default 4) returns jsonb language plpgsql security definer set search_path='' as $$
declare j record; refs jsonb; result jsonb:='[]';
begin
 if p_limit is null or p_limit not between 1 and 4 then raise exception 'TIPS_HMAC_INVALID';end if;
 if not exists(select 1 from edu_tips_private.hmac_settings where id=1 and enabled)
 or not exists(select 1 from edu_tips_private.feed_state where capture_enabled) then return result;end if;
 for j in select jobs.subject_id,s.member_id,jobs.revision,b.profile,b.record_key_version,b.record_key_fingerprint from edu_tips_private.hmac_jobs jobs
 join edu_tips_private.hmac_subjects b using(subject_id) join edu_tips_private.subjects s on s.id=jobs.subject_id
 join edu_tips_private.hmac_settings cfg on cfg.id=1 and cfg.profile=b.profile and cfg.record_key_version=b.record_key_version and cfg.record_key_fingerprint=b.record_key_fingerprint
 where jobs.cancelled_at is null and jobs.revision>jobs.applied_revision and jobs.next_attempt_at<=clock_timestamp()
 and (jobs.lease_until is null or jobs.lease_until<=clock_timestamp()) and edu_tips_private.subject_allowed(s.id)
 order by jobs.next_attempt_at,jobs.subject_id for update of jobs skip locked limit p_limit loop
 refs:=edu_tips_private.hmac_needed_refs(j.subject_id);
 if jsonb_array_length(refs)>2000 then
 update edu_tips_private.hmac_jobs set attention=true,next_attempt_at=clock_timestamp()+interval '5 minutes' where subject_id=j.subject_id;continue;
 end if;
 update edu_tips_private.hmac_jobs set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 where subject_id=j.subject_id;
 result:=result||jsonb_build_array(jsonb_build_object('subject',j.subject_id,'member',j.member_id,'revision',j.revision,'profile',j.profile,'record_key_version',j.record_key_version,'record_key_fingerprint',j.record_key_fingerprint,'lease',(select lease_token from edu_tips_private.hmac_jobs where subject_id=j.subject_id),'refs',refs));
 end loop;return result;
end$$;
create function public.edu_tips_apply_hmac_projection_candidate(p_subject uuid,p_revision bigint,p_lease uuid,p_profile text,p_record_key_version text,p_refs jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare s edu_tips_private.subjects; j edu_tips_private.hmac_jobs; expected jsonb; incoming jsonb; x jsonb;
begin
 if jsonb_typeof(p_refs) is distinct from 'array' or jsonb_array_length(p_refs)>2000 then raise exception 'TIPS_HMAC_INVALID';end if;
 select * into s from edu_tips_private.subjects where id=p_subject for update;
 if not found or not edu_tips_private.subject_allowed(s.id) then return false;end if;
 select * into j from edu_tips_private.hmac_jobs where subject_id=p_subject for update;
 if not found or j.cancelled_at is not null or j.revision is distinct from p_revision or j.lease_token is distinct from p_lease or j.lease_until<=clock_timestamp() then return false;end if;
 if not exists(select 1 from edu_tips_private.hmac_subjects b join edu_tips_private.hmac_settings cfg on cfg.id=1 and cfg.enabled and cfg.profile=b.profile and cfg.record_key_version=b.record_key_version and cfg.record_key_fingerprint=b.record_key_fingerprint where b.subject_id=p_subject and b.profile=p_profile and b.record_key_version=p_record_key_version)
 or not exists(select 1 from edu_tips_private.feed_state where capture_enabled) then return false;end if;
 for x in select value from jsonb_array_elements(p_refs) loop
 if jsonb_typeof(x) is distinct from 'object' or (select count(*) from jsonb_object_keys(x))<>3 or not(x ?& array['kind','source_key','opaque'])
 or jsonb_typeof(x->'kind') is distinct from 'string' or jsonb_typeof(x->'source_key') is distinct from 'string' or jsonb_typeof(x->'opaque') is distinct from 'string'
 or x->>'opaque' !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'TIPS_HMAC_INVALID';end if;
 end loop;
 if (select count(distinct (value->>'kind',value->>'source_key')) from jsonb_array_elements(p_refs))<>jsonb_array_length(p_refs) then raise exception 'TIPS_HMAC_INVALID';end if;
 expected:=edu_tips_private.hmac_needed_refs(p_subject);
 select coalesce(jsonb_agg(jsonb_build_object('kind',value->>'kind','source_key',value->>'source_key') order by value->>'kind',value->>'source_key'),'[]'::jsonb) into incoming from jsonb_array_elements(p_refs);
 if incoming is distinct from expected then return false;end if;
 for x in select value from jsonb_array_elements(p_refs) loop
 insert into edu_tips_private.hmac_refs(subject_id,kind,source_key,opaque) values(p_subject,x->>'kind',x->>'source_key',x->>'opaque') on conflict do nothing;
 if not exists(select 1 from edu_tips_private.hmac_refs where subject_id=p_subject and kind=x->>'kind' and source_key=x->>'source_key' and opaque=x->>'opaque') then raise exception 'TIPS_HMAC_IMMUTABLE';end if;
 end loop;
 perform edu_tips_private.capture_legacy_candidate(s.member_id);
 if exists(select 1 from edu_tips_private.feed_quarantine where member_id=s.member_id)
 or not exists(select 1 from edu_tips_private.projection_subjects where subject_id=s.id) then raise exception 'TIPS_HMAC_SOURCE_PENDING';end if;
 update edu_tips_private.hmac_jobs set applied_revision=p_revision,lease_token=null,lease_until=null,attention=false where subject_id=p_subject and revision=p_revision and lease_token=p_lease;
 return found;
end$$;
create function public.edu_tips_defer_hmac_projection_candidate(p_subject uuid,p_revision bigint,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update edu_tips_private.hmac_jobs set lease_token=null,lease_until=null,attention=attempts>=3,next_attempt_at=clock_timestamp()+make_interval(secs=>least(300,5*power(2,least(attempts-1,6)))::integer)
 where subject_id=p_subject and revision=p_revision and lease_token=p_lease and lease_until>clock_timestamp() and cancelled_at is null;
 return found;
end$$;
create function edu_tips_private.cancel_hmac_projection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.retired_at is not null then update edu_tips_private.hmac_jobs set cancelled_at=clock_timestamp(),lease_token=null,lease_until=null where subject_id=new.id;end if;return null;
end$$;
create trigger edu_tips_hmac_retire after update of retired_at on edu_tips_private.subjects for each row execute function edu_tips_private.cancel_hmac_projection();
create function public.edu_tips_source_status_candidate() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
 'registration_pending',(select count(*) from edu_tips_private.identity_jobs where completed_at is null and cancelled_at is null),
 'registration_attention',(select count(*) from edu_tips_private.identity_jobs where completed_at is null and cancelled_at is null and attention),
 'projection_pending',(select count(*) from edu_tips_private.hmac_jobs where cancelled_at is null and revision>applied_revision),
 'projection_attention',(select count(*) from edu_tips_private.hmac_jobs where cancelled_at is null and revision>applied_revision and attention),
 'withdrawal_pending',(select count(*) from edu_tips_private.control_deliveries where confirmed_at is null),
 'withdrawal_attention',(select count(*) from edu_tips_private.control_deliveries where confirmed_at is null and attention),
 'unclassified',(select count(*) from edu_tips_private.erasure_outbox q where completed_at is null and not exists(select 1 from edu_tips_private.control_authorities a where a.request_id=q.request_id)),
 'identity_enabled',(select identity_enabled from edu_tips_private.control_settings where id=1),
 'publisher_enabled',(select enabled from edu_tips_private.hmac_settings where id=1),
 'withdrawal_enabled',(select capture_enabled and sending_enabled from edu_tips_private.control_settings where id=1))
$$;
revoke all on function edu_tips_private.guard_hmac_pin(),edu_tips_private.queue_hmac_projection(uuid),edu_tips_private.hmac_needed_refs(uuid),edu_tips_private.hmac_prior_cleared(uuid),edu_tips_private.cancel_hmac_projection() from public,anon,authenticated,service_role;
revoke all on function public.edu_tips_prepare_hmac_identity_candidate(uuid,text,uuid,text),public.edu_tips_finish_hmac_identity_candidate(uuid,uuid,text,text,text,uuid),public.edu_tips_claim_hmac_projection_candidate(integer),public.edu_tips_apply_hmac_projection_candidate(uuid,bigint,uuid,text,text,jsonb),public.edu_tips_defer_hmac_projection_candidate(uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.edu_tips_prepare_hmac_identity_candidate(uuid,text,uuid,text),public.edu_tips_finish_hmac_identity_candidate(uuid,uuid,text,text,text,uuid),public.edu_tips_claim_hmac_projection_candidate(integer),public.edu_tips_apply_hmac_projection_candidate(uuid,bigint,uuid,text,text,jsonb),public.edu_tips_defer_hmac_projection_candidate(uuid,bigint,uuid) to service_role;
revoke all on function public.edu_tips_source_status_candidate() from public,anon,authenticated;
grant execute on function public.edu_tips_source_status_candidate() to service_role;
commit;
