begin;

alter table public.crm_automations drop constraint crm_automations_trigger_type_check;
alter table public.crm_automations add constraint crm_automations_trigger_type_check
 check(trigger_type in ('member_joined','marketing_consent','tag_assigned','purchase_completed','member_inactive','learning_stalled'));
alter table public.crm_automations add column trigger_cohort_id uuid references public.cohorts(id),
 add column threshold_days integer,
 add constraint crm_retention_scope check (
  (trigger_type in ('member_inactive','learning_stalled') and trigger_cohort_id is not null
   and threshold_days between 1 and 365 and threshold_days is not null)
  or (trigger_type not in ('member_inactive','learning_stalled') and trigger_cohort_id is null and threshold_days is null));
alter table public.crm_automation_runs add column retention_enrollment_id uuid references public.enrollments(id),
 add column retention_anchor timestamptz, add column retention_config jsonb,
 add column retention_receipt_checked_at timestamptz;

-- A reservation survives provider timeouts: never send a second condition that
-- day when the first provider result is uncertain. Evidence is not auto-deleted.
create table public.crm_retention_daily_receipts (
 member_id uuid not null references public.profiles(id),
 send_day date not null,
 run_id uuid not null unique references public.crm_automation_runs(id),
 created_at timestamptz not null default now(),
 primary key(member_id,send_day)
);
alter table public.crm_retention_daily_receipts enable row level security;
revoke all on public.crm_retention_daily_receipts from public,anon,authenticated;
grant select,insert on public.crm_retention_daily_receipts to service_role;
create index crm_retention_active_cohort_idx on public.crm_automations(trigger_cohort_id) where is_active and trigger_cohort_id is not null;
create index crm_retention_pending_idx on public.crm_automation_runs(scheduled_for,id) where status='pending' and retention_enrollment_id is not null;
create index if not exists edu_member_visits_member_last_idx on public.edu_member_visits(user_id,last_seen_at desc);

-- Reuse the learning-care projection: only published, non-OT normal lessons
-- (learning/quiz or legacy self-completion), never mentor mission submissions.
-- completedAt is sourced from lesson_progress.completed_at, not updated_at.
create function edu_private.edu_retention_clock(p_enrollment uuid,p_kind text)
returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare e public.enrollments%rowtype; c public.cohorts%rowtype; cells jsonb; anchor timestamptz;
begin
 select * into e from public.enrollments where id=p_enrollment;
 if not found or e.status<>'active' or e.revoked_at is not null or e.access_starts_at>now()
  or e.access_ends_at<=now() then return null; end if;
 select * into c from public.cohorts where id=e.cohort_id and course_id=e.course_id;
 if not found or c.status in ('cancelled','completed') or c.operation_start_at is null
  or c.operation_start_at>now() or c.operation_end_at<=now() then return null; end if;
 if not exists(select 1 from public.profiles where id=e.user_id and status='active' and role='student')
  or not exists(select 1 from public.courses where id=e.course_id and archived_at is null) then return null; end if;
 cells:=edu_private.edu_learning_care_cells(e.id);
 if not exists(select 1 from jsonb_array_elements(cells) x where x->>'track'='learning'
   and (x->>'week')::integer>0 and (x->>'published')::boolean and x->>'state' in ('not_submitted','locked','changes_requested')) then return null; end if;
 if p_kind='member_inactive' then
  select max(last_seen_at) into anchor from public.edu_member_visits where user_id=e.user_id;
 elsif p_kind='learning_stalled' then
  -- A later visibility/archive edit must not erase a real completion clock.
  select max(p.completed_at) into anchor from public.lesson_progress p
   join public.curriculum_lessons l on l.id=p.lesson_id
   join public.curriculum_weeks w on w.id=l.week_id
   left join public.edu_lesson_block_heads h on h.lesson_id=l.id
   left join public.edu_lesson_block_versions v on v.id=h.revision
   where p.enrollment_id=e.id and w.course_id=e.course_id and w.week_number>0
    and coalesce(v.document->'progression'->>'track','learning')='learning'
    and not exists(select 1 from public.edu_ongoing_rules r where r.lesson_id=l.id);
  -- CEO decision: before the first completed day, use the later of course
  -- start and enrollment grant/access start. No guessed clock when start absent.
  anchor:=coalesce(anchor,greatest(c.operation_start_at,e.created_at,e.access_starts_at));
 end if;
 if anchor>now() then return null; end if;
 return anchor;
end; $$;

-- Snapshot rule settings. Editing a pending rule invalidates its old runs.
create function edu_private.edu_retention_config(a public.crm_automations)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('kind',a.trigger_type,'cohort',a.trigger_cohort_id,'days',a.threshold_days,
  'template',a.template_id,'delay',a.delay_minutes);
$$;
create function public.edu_scan_retention_automations()
returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.crm_automation_runs(automation_id,member_id,trigger_key,scheduled_for,
  retention_enrollment_id,retention_anchor,retention_config)
 select a.id,e.user_id,'retention:'||e.id::text||':'||extract(epoch from clock.anchor)::text,
  now()+make_interval(mins=>a.delay_minutes),e.id,clock.anchor,edu_private.edu_retention_config(a)
 from public.crm_automations a join public.enrollments e on e.cohort_id=a.trigger_cohort_id
 cross join lateral (select edu_private.edu_retention_clock(e.id,a.trigger_type) as anchor) clock
 join public.crm_templates t on t.id=a.template_id and t.is_active and t.channel='alimtalk'
  and t.purpose='transactional' and nullif(t.alimtalk_template_id,'') is not null
 where a.is_active and a.trigger_type in ('member_inactive','learning_stalled')
  and clock.anchor<=now()-make_interval(days=>a.threshold_days)
 on conflict(automation_id,trigger_key) do nothing;
 get diagnostics n=row_count; return n;
end; $$;

-- Atomic claim, live eligibility/contact check, and per-account KST-day
-- reservation in ONE short transaction. Network calls happen after commit.
create function public.edu_authorize_retention_run(p_run uuid,p_template uuid,p_content text,p_provider_template text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.crm_automation_runs%rowtype; a public.crm_automations%rowtype;
 t public.crm_templates%rowtype; e public.enrollments%rowtype; p public.profiles%rowtype;
 anchor timestamptz; claimed uuid;
begin
 select * into r from public.crm_automation_runs where id=p_run and retention_enrollment_id is not null for update;
 if not found or r.status<>'pending' or r.scheduled_for>now() then return null; end if;
 select * into a from public.crm_automations where id=r.automation_id;
 select * into t from public.crm_templates where id=a.template_id;
 select * into e from public.enrollments where id=r.retention_enrollment_id;
 select * into p from public.profiles where id=r.member_id;
 anchor:=edu_private.edu_retention_clock(e.id,a.trigger_type);
 if not a.is_active or r.retention_config is distinct from edu_private.edu_retention_config(a)
  or e.user_id is distinct from r.member_id or anchor is null or anchor is distinct from r.retention_anchor
  or anchor>now()-make_interval(days=>a.threshold_days)
  or not coalesce(t.is_active,false) or t.channel<>'alimtalk' or t.purpose<>'transactional'
  or t.id is distinct from p_template or t.content is distinct from p_content
  or t.alimtalk_template_id is distinct from p_provider_template
  or p.status is distinct from 'active' or regexp_replace(coalesce(p.phone,''),'[^0-9]','','g') !~ '^0[0-9]{8,10}$' then
  update public.crm_automation_runs set status='skipped',executed_at=now(),error_message='발송 직전 수강·접속·완료·연락처·설정이 변경되어 제외했습니다.' where id=r.id;
  return null;
 end if;
 insert into public.crm_retention_daily_receipts(member_id,send_day,run_id)
 values(p.id,(now() at time zone 'Asia/Seoul')::date,r.id)
 on conflict(member_id,send_day) do nothing returning run_id into claimed;
 if claimed is null then
  update public.crm_automation_runs set status='skipped',executed_at=now(),error_message='오늘 다른 수강 독려 알림을 이미 처리해 중복 발송하지 않습니다.' where id=r.id;
  return null;
 end if;
 update public.crm_automation_runs set status='processing',error_message=null where id=r.id;
 return jsonb_build_object('id',p.id,'phone',p.phone,'full_name',p.full_name,'status',p.status);
end; $$;
revoke all on function edu_private.edu_retention_clock(uuid,text),edu_private.edu_retention_config(public.crm_automations),public.edu_scan_retention_automations(),public.edu_authorize_retention_run(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function edu_private.edu_retention_clock(uuid,text),edu_private.edu_retention_config(public.crm_automations),public.edu_scan_retention_automations(),public.edu_authorize_retention_run(uuid,uuid,text,text) to service_role;
commit;
