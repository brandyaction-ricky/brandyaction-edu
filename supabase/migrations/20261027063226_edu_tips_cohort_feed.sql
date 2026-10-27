-- Project current cohort/access state onto existing daily learning evidence.
-- No customer, keys, flags or source records are seeded by this migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create index if not exists edu_tips_enrollment_cohort_member
 on public.enrollments(cohort_id,user_id) where source='purchase';

create table edu_tips_private.cohort_refresh_settings (
 id integer primary key check(id=1),
 enabled boolean not null default false,
 seeded boolean not null default false
);
insert into edu_tips_private.cohort_refresh_settings(id) values(1);
create table edu_tips_private.cohort_refresh_jobs (
 cohort_id uuid primary key references public.cohorts(id) on delete cascade,
 due_at timestamptz,
 after_subject uuid,
 revision bigint not null default 1 check(revision>0)
);
-- Source writes append a signal without waiting for a refresh job row.
create table edu_tips_private.cohort_refresh_events (
 id bigint generated always as identity primary key,
 cohort_id uuid not null references public.cohorts(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp()
);
create index edu_tips_cohort_refresh_due on edu_tips_private.cohort_refresh_jobs(due_at,cohort_id)
 where due_at is not null;
alter table edu_tips_private.cohort_refresh_settings enable row level security;
alter table edu_tips_private.cohort_refresh_jobs enable row level security;
alter table edu_tips_private.cohort_refresh_events enable row level security;
revoke all on edu_tips_private.cohort_refresh_settings,edu_tips_private.cohort_refresh_jobs,edu_tips_private.cohort_refresh_events
 from public,anon,authenticated,service_role;
grant select on edu_tips_private.cohort_refresh_settings,edu_tips_private.cohort_refresh_jobs,edu_tips_private.cohort_refresh_events to service_role;

create function edu_tips_private.learning_current_state(p_member uuid,p_cohort uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'availability',case when h.status<>'cancelled' and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=statement_timestamp()
    and (e.access_ends_at is null or e.access_ends_at>statement_timestamp())
   then 'available' else 'not_available' end,
  'cohort_state',case
   when h.status='cancelled' then 'unknown'
   when h.status='completed' or h.operation_end_at<=statement_timestamp() then 'alumni'
   when h.operation_start_at>statement_timestamp() then 'before_start'
   when h.status='in_progress' or h.operation_start_at<=statement_timestamp() then 'active'
   when h.status in ('upcoming','recruiting') then 'before_start'
   else 'unknown' end)
 from public.enrollments e join public.cohorts h on h.id=e.cohort_id
 where e.user_id=p_member and e.cohort_id=p_cohort and e.source='purchase'
 and exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled)
 limit 1
$$;

-- Preserve the installed catalog, expiration, HMAC, consent and outbox logic.
-- Match the exact projector fragment and fail installation if it differs.
do $$
declare definition text; marker text := $marker$'availability','unknown','cohort_state','unknown','usage_ratio',null);$marker$;
begin
 definition:=pg_get_functiondef('edu_tips_private.capture_legacy_candidate(uuid)'::regprocedure);
 if strpos(definition,marker)=0
    or strpos(substr(definition,strpos(definition,marker)+length(marker)),marker)>0 then
  raise exception 'TIPS_COHORT_PROJECTOR_VERSION_MISMATCH';
 end if;
 execute replace(definition,marker,
  $replacement$'availability','unknown','cohort_state','unknown','usage_ratio',null)
    ||coalesce(edu_tips_private.learning_current_state(p_member,r.cohort_id),'{}'::jsonb);$replacement$);
end$$;

-- While a refresh is recorded as pending, do not serve older state as current. Existing authentication
-- and consumer/key/rate checks run first. Disabling the candidate restores the
-- prior gate and does not enable collection or any external transmission.
do $$
declare definition text; marker text := $marker$return jsonb_build_object('consumer_id',c);$marker$;
begin
 definition:=pg_get_functiondef('public.edu_tips_data_gate(text,text,text)'::regprocedure);
 if strpos(definition,marker)=0
    or strpos(substr(definition,strpos(definition,marker)+length(marker)),marker)>0 then
  raise exception 'TIPS_COHORT_GATE_VERSION_MISMATCH';
 end if;
 execute replace(definition,marker,$replacement$
 if exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled
    and (not seeded or exists(select 1 from edu_tips_private.cohort_refresh_events)
      or exists(select 1 from edu_tips_private.cohort_refresh_jobs where due_at<=statement_timestamp()))) then
  return jsonb_build_object('error','disabled');
 end if;
 return jsonb_build_object('consumer_id',c);$replacement$);
end$$;

-- Recheck inside the data operation as well as at the HTTP gate.
do $$
declare definition text; marker text := $marker$if p_limit is null or p_limit not between 1 and 500$marker$;
begin
 definition:=pg_get_functiondef('public.edu_tips_data_operation(uuid,text,text,text,jsonb,text,integer,text[])'::regprocedure);
 if strpos(definition,marker)=0
    or strpos(substr(definition,strpos(definition,marker)+length(marker)),marker)>0 then
  raise exception 'TIPS_COHORT_OPERATION_VERSION_MISMATCH';
 end if;
 execute replace(definition,marker,$replacement$
 if exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled
    and (not seeded or exists(select 1 from edu_tips_private.cohort_refresh_events)
      or exists(select 1 from edu_tips_private.cohort_refresh_jobs where due_at<=statement_timestamp()))) then
  return jsonb_build_object('error','disabled');
 end if;
 if p_limit is null or p_limit not between 1 and 500$replacement$);
end$$;

create function edu_tips_private.reset_cohort_refresh()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='cohort_refresh_settings' then
  if new.enabled and not old.enabled then
   new.seeded:=false;
   update edu_tips_private.cohort_refresh_jobs set after_subject=null,due_at=clock_timestamp();
  end if;
  return new;
 end if;
 if new.capture_enabled and not old.capture_enabled
  and exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled) then
  update edu_tips_private.cohort_refresh_settings set seeded=false where id=1;
  update edu_tips_private.cohort_refresh_jobs set after_subject=null,due_at=clock_timestamp();
 end if;
 return new;
end$$;
create trigger edu_tips_cohort_reset_on_enable
 before update of enabled on edu_tips_private.cohort_refresh_settings
 for each row execute function edu_tips_private.reset_cohort_refresh();
create trigger edu_tips_cohort_reset_on_capture
 after update of capture_enabled on edu_tips_private.feed_state
 for each row execute function edu_tips_private.reset_cohort_refresh();

create function edu_tips_private.enqueue_cohort_refresh()
returns trigger language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if not exists(select 1 from edu_tips_private.feed_state where capture_enabled)
  or not exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled) then return null;end if;
 if tg_table_name='cohorts' then
  insert into edu_tips_private.cohort_refresh_events(cohort_id) values(new.id);
 else
  for c in select distinct x from unnest(array[
   case when tg_op<>'INSERT' then old.cohort_id end,
   case when tg_op<>'DELETE' then new.cohort_id end
  ]) x where x is not null loop
   insert into edu_tips_private.cohort_refresh_events(cohort_id) values(c);
  end loop;
 end if;
 return null;
end$$;
create trigger edu_tips_cohort_refresh_changed
 after update of status,operation_start_at,operation_end_at on public.cohorts
 for each row when ((old.status,old.operation_start_at,old.operation_end_at)
  is distinct from (new.status,new.operation_start_at,new.operation_end_at))
 execute function edu_tips_private.enqueue_cohort_refresh();
create trigger edu_tips_cohort_refresh_enrollment
 after insert or update of cohort_id,source,access_starts_at,access_ends_at or delete on public.enrollments
 for each row execute function edu_tips_private.enqueue_cohort_refresh();

-- Bounded, resumable work. HMAC subjects are queued using the existing worker;
-- its quarantine keeps the feed unavailable until the new projection is saved.
create function public.edu_tips_refresh_cohort_feed_candidate(p_limit integer default 4)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j edu_tips_private.cohort_refresh_jobs; item record; signal record; n integer:=0;
 last_id uuid; more boolean; next_at timestamptz;
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'TIPS_COHORT_INVALID';end if;
 if not exists(select 1 from edu_tips_private.feed_state where capture_enabled)
  or not exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled) then
  return jsonb_build_object('status','disabled','processed',0,'pending',false);
 end if;
 perform 1 from edu_tips_private.cohort_refresh_settings where id=1 for update;
 if not(select seeded from edu_tips_private.cohort_refresh_settings where id=1) then
  insert into edu_tips_private.cohort_refresh_jobs(cohort_id,due_at)
   select distinct e.cohort_id,statement_timestamp()
   from public.enrollments e join edu_tips_private.learning_days d on d.enrollment_id=e.id
   join edu_tips_private.subjects s on s.member_id=e.user_id and s.retired_at is null
   where e.source='purchase'
   on conflict(cohort_id) do nothing;
  update edu_tips_private.cohort_refresh_settings set seeded=true where id=1;
 end if;
 -- Fold a bounded batch of append-only signals into jobs outside the customer write transaction.
 for signal in select id,cohort_id from edu_tips_private.cohort_refresh_events
   order by id limit 100 for update skip locked loop
  insert into edu_tips_private.cohort_refresh_jobs(cohort_id,due_at) values(signal.cohort_id,clock_timestamp())
   on conflict(cohort_id) do update set due_at=clock_timestamp(),after_subject=null,
    revision=edu_tips_private.cohort_refresh_jobs.revision+1;
  delete from edu_tips_private.cohort_refresh_events where id=signal.id;
 end loop;
 select * into j from edu_tips_private.cohort_refresh_jobs
  where due_at<=clock_timestamp() order by due_at,cohort_id for update skip locked limit 1;
 if not found then return jsonb_build_object('status','processed','processed',0,
  'pending',exists(select 1 from edu_tips_private.cohort_refresh_events));end if;
 last_id:=j.after_subject;
 for item in
  select s.id,s.member_id from edu_tips_private.subjects s
  join public.enrollments e on e.user_id=s.member_id and e.cohort_id=j.cohort_id and e.source='purchase'
  where s.retired_at is null and (j.after_subject is null or s.id>j.after_subject)
   and edu_tips_private.subject_allowed(s.id)
   and exists(select 1 from edu_tips_private.learning_days d where d.enrollment_id=e.id)
  order by s.id limit p_limit
 loop
  perform edu_tips_private.capture_member(item.member_id);
  last_id:=item.id;n:=n+1;
 end loop;
 select exists(select 1 from edu_tips_private.subjects s
  join public.enrollments e on e.user_id=s.member_id and e.cohort_id=j.cohort_id and e.source='purchase'
  where s.retired_at is null and (last_id is null or s.id>last_id)
   and edu_tips_private.subject_allowed(s.id)
   and exists(select 1 from edu_tips_private.learning_days d where d.enrollment_id=e.id))
 into more;
 if more then
  update edu_tips_private.cohort_refresh_jobs set after_subject=last_id,due_at=clock_timestamp()
   where cohort_id=j.cohort_id;
 else
  select min(v.at) into next_at from (
   select h.operation_start_at at from public.cohorts h where h.id=j.cohort_id
   union all select h.operation_end_at from public.cohorts h where h.id=j.cohort_id
   union all select e.access_starts_at from public.enrollments e where e.cohort_id=j.cohort_id and e.source='purchase'
   union all select e.access_ends_at from public.enrollments e where e.cohort_id=j.cohort_id and e.source='purchase'
  ) v where v.at>statement_timestamp();
  update edu_tips_private.cohort_refresh_jobs set after_subject=null,due_at=next_at where cohort_id=j.cohort_id;
 end if;
 return jsonb_build_object('status','processed','processed',n,
  'pending',exists(select 1 from edu_tips_private.cohort_refresh_events)
    or exists(select 1 from edu_tips_private.cohort_refresh_jobs where due_at<=clock_timestamp()));
end$$;
revoke all on function edu_tips_private.learning_current_state(uuid,uuid),
 edu_tips_private.enqueue_cohort_refresh(),edu_tips_private.reset_cohort_refresh() from public,anon,authenticated,service_role;
grant execute on function edu_tips_private.learning_current_state(uuid,uuid) to service_role;
revoke all on function public.edu_tips_refresh_cohort_feed_candidate(integer) from public,anon,authenticated;
grant execute on function public.edu_tips_refresh_cohort_feed_candidate(integer) to service_role;
commit;
