-- DEV test scope: explicit allowlist plus reserved synthetic-only email.
-- Does not enable collection, register anyone, or grant any public access.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$begin
 if exists(select 1 from edu_tips_private.cohort_refresh_settings where enabled)
    or exists(select 1 from edu_tips_private.cohort_refresh_jobs)
    or exists(select 1 from edu_tips_private.cohort_refresh_events) then
  raise exception 'TIPS_SYNTHETIC_SCOPE_REQUIRES_EMPTY_DISABLED_QUEUE';
 end if;
end$$;

create table edu_tips_private.cohort_synthetic_allowlist (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 expected_email text not null unique check(expected_email ~ '^edu-live-[a-z0-9-]+@example[.]invalid$')
);
alter table edu_tips_private.cohort_synthetic_allowlist enable row level security;
revoke all on edu_tips_private.cohort_synthetic_allowlist from public,anon,authenticated,service_role;

create function edu_tips_private.cohort_synthetic_allowed(p_member uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from edu_tips_private.cohort_synthetic_allowlist a
  join public.profiles p on p.id=a.member_id and p.email=a.expected_email
  where a.member_id=p_member and p.email ~ '^edu-live-[a-z0-9-]+@example[.]invalid$'
   and not exists(select 1 from edu_tips_private.subjects s join edu_tips_private.hmac_subjects h on h.subject_id=s.id
    where s.member_id=p_member and s.retired_at is null))
$$;
revoke all on function edu_tips_private.cohort_synthetic_allowed(uuid) from public,anon,authenticated,service_role;

-- Reject mismatched identities at registration and keep scope immutable while running.
create function edu_tips_private.validate_cohort_synthetic_allowlist()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from edu_tips_private.cohort_refresh_settings where enabled) then
  raise exception 'TIPS_SYNTHETIC_SCOPE_LOCKED';
 end if;
 if tg_op<>'DELETE' and not exists(select 1 from public.profiles p where p.id=new.member_id and p.email=new.expected_email) then
  raise exception 'TIPS_SYNTHETIC_SCOPE_IDENTITY_MISMATCH';
 end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
revoke all on function edu_tips_private.validate_cohort_synthetic_allowlist() from public,anon,authenticated,service_role;
create trigger edu_tips_cohort_synthetic_allowlist_guard before insert or update or delete
 on edu_tips_private.cohort_synthetic_allowlist for each row execute function edu_tips_private.validate_cohort_synthetic_allowlist();

-- Preserve the installed implementation and fail closed if it has changed.
do $$
declare d text; old text; replacement text;
begin
 d:=pg_get_functiondef('edu_tips_private.learning_current_state(uuid,uuid)'::regprocedure);
 old:=$x$where e.user_id=p_member and e.cohort_id=p_cohort and e.source='purchase'$x$;
 if strpos(d,old)=0 then raise exception 'TIPS_SYNTHETIC_PROJECTOR_VERSION';end if;
 execute replace(d,old,old||' and edu_tips_private.cohort_synthetic_allowed(p_member)');

 d:=pg_get_functiondef('public.edu_tips_refresh_cohort_feed_candidate(integer)'::regprocedure);
 old:=$x$where e.source='purchase'
   on conflict(cohort_id) do nothing;$x$;
 if strpos(d,old)=0 then raise exception 'TIPS_SYNTHETIC_SEED_VERSION';end if;
 d:=replace(d,old,$x$where e.source='purchase' and edu_tips_private.cohort_synthetic_allowed(s.member_id)
   on conflict(cohort_id) do nothing;$x$);
 old:=$x$and edu_tips_private.subject_allowed(s.id)
   and exists(select 1 from edu_tips_private.learning_days d where d.enrollment_id=e.id)$x$;
 if (length(d)-length(replace(d,old,'')))/length(old)<>2 then raise exception 'TIPS_SYNTHETIC_WORKER_VERSION';end if;
 d:=replace(d,old,$x$and edu_tips_private.subject_allowed(s.id)
   and edu_tips_private.cohort_synthetic_allowed(s.member_id)
   and exists(select 1 from edu_tips_private.learning_days d where d.enrollment_id=e.id)$x$);
 execute d;

 d:=pg_get_functiondef('edu_tips_private.enqueue_cohort_refresh()'::regprocedure);
 old:=$x$insert into edu_tips_private.cohort_refresh_events(cohort_id) values(new.id);$x$;
 if strpos(d,old)=0 then raise exception 'TIPS_SYNTHETIC_COHORT_SIGNAL_VERSION';end if;
 d:=replace(d,old,$x$insert into edu_tips_private.cohort_refresh_events(cohort_id)
   select new.id where exists(select 1 from public.enrollments e where e.cohort_id=new.id
    and edu_tips_private.cohort_synthetic_allowed(e.user_id));$x$);
 old:=$x$insert into edu_tips_private.cohort_refresh_events(cohort_id) values(c);$x$;
 if strpos(d,old)=0 then raise exception 'TIPS_SYNTHETIC_ENROLLMENT_SIGNAL_VERSION';end if;
 d:=replace(d,old,$x$insert into edu_tips_private.cohort_refresh_events(cohort_id)
   select c where exists(select 1 from public.enrollments e where e.cohort_id=c
    and edu_tips_private.cohort_synthetic_allowed(e.user_id));$x$);
 execute d;
end$$;

-- The newer same-day capture policy applies only to the explicitly scoped member.
do $$
declare f regprocedure; d text; old text; replacement text;
begin
 foreach f in array array['edu_tips_private.capture_legacy_candidate(uuid)'::regprocedure,'edu_tips_private.hmac_needed_refs(uuid)'::regprocedure] loop
  d:=pg_get_functiondef(f);
  old:=$x$exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled)$x$;
  if (length(d)-length(replace(d,old,'')))/length(old)<>2 then raise exception 'TIPS_SYNTHETIC_SAME_DAY_VERSION';end if;
  d:=replace(d,old,'('||old||' and edu_tips_private.cohort_synthetic_allowed(s.member_id))');
  execute d;
 end loop;
 d:=pg_get_functiondef('edu_tips_private.capture_source()'::regprocedure);
 old:=$x$and excluded.observed_at>edu_tips_private.learning_days.observed_at;$x$;
 if strpos(d,old)=0 then raise exception 'TIPS_SYNTHETIC_OBSERVATION_VERSION';end if;
 d:=replace(d,old,$x$and excluded.observed_at>edu_tips_private.learning_days.observed_at
       and edu_tips_private.cohort_synthetic_allowed(m);$x$);
 execute d;
end$$;
-- This separate entry point is only installed alongside the scope guard.
-- It does not invoke the global HMAC worker or change its settings.
create function public.edu_tips_refresh_synthetic_cohort_feed_candidate(p_limit integer default 4)
returns jsonb language sql security definer set search_path='' as $$
 select public.edu_tips_refresh_cohort_feed_candidate(p_limit)
$$;
revoke all on function public.edu_tips_refresh_synthetic_cohort_feed_candidate(integer) from public,anon,authenticated;
grant execute on function public.edu_tips_refresh_synthetic_cohort_feed_candidate(integer) to service_role;
commit;
