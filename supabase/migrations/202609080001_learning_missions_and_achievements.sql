begin;

create table public.curriculum_missions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.curriculum_lessons(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  instructions text,
  is_required boolean not null default true,
  submission_type text not null default 'mixed' check (
    submission_type in ('text', 'link', 'mixed')
  ),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Attempts remain separate so rejection and resubmission history is preserved.
create table public.mission_submissions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  mission_id uuid not null references public.curriculum_missions(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'submitted' check (
    status in ('submitted', 'changes_requested', 'approved', 'rejected')
  ),
  response jsonb not null default '{}'::jsonb check (jsonb_typeof(response) = 'object'),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewer_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, mission_id, attempt_number),
  check (
    (status = 'submitted' and reviewed_at is null and reviewed_by is null)
    or
    (status in ('changes_requested', 'approved', 'rejected') and reviewed_at is not null)
  )
);

create index curriculum_missions_published_lesson_idx
  on public.curriculum_missions (lesson_id)
  where is_published;

create index mission_submissions_enrollment_status_idx
  on public.mission_submissions (enrollment_id, status, submitted_at desc);

create index mission_submissions_review_queue_idx
  on public.mission_submissions (status, submitted_at)
  where status in ('submitted', 'changes_requested');

create unique index mission_submissions_one_pending_attempt_idx
  on public.mission_submissions (enrollment_id, mission_id)
  where status = 'submitted';

-- Enforce the course boundary even when a trusted server client writes rows.
create or replace function public.validate_mission_submission_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.enrollments e
    join public.curriculum_missions m on m.id = new.mission_id
    join public.curriculum_lessons l on l.id = m.lesson_id
    join public.curriculum_weeks w on w.id = l.week_id
    where e.id = new.enrollment_id
      and e.course_id = w.course_id
  ) then
    raise exception 'Mission and enrollment must belong to the same course'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger validate_mission_submission_scope
before insert or update of mission_id, enrollment_id
on public.mission_submissions
for each row execute procedure public.validate_mission_submission_scope();

create trigger curriculum_missions_set_updated_at
before update on public.curriculum_missions
for each row execute procedure public.set_updated_at();

create trigger mission_submissions_set_updated_at
before update on public.mission_submissions
for each row execute procedure public.set_updated_at();

alter table public.curriculum_missions enable row level security;
alter table public.mission_submissions enable row level security;

revoke all on table public.curriculum_missions from public, anon, authenticated;
revoke all on table public.mission_submissions from public, anon, authenticated;

grant select, insert, update, delete on table public.curriculum_missions to authenticated;
grant select on table public.mission_submissions to authenticated;
grant update (status, reviewed_at, reviewed_by, reviewer_feedback)
  on table public.mission_submissions to authenticated;
grant all on table public.curriculum_missions to service_role;
grant all on table public.mission_submissions to service_role;

create policy members_read_accessible_missions
on public.curriculum_missions for select to authenticated
using (
  (select public.has_operator_permission('products'))
  or (select public.has_operator_permission('members'))
  or (
    is_published
    and exists (
    select 1
    from public.curriculum_lessons l
    join public.curriculum_weeks w on w.id = l.week_id
    join public.enrollments e on e.course_id = w.course_id
    join public.profiles p on p.id = e.user_id
    where l.id = lesson_id
      and e.user_id = (select auth.uid())
      and p.status = 'active'
      and e.status = 'active'
      and e.access_starts_at <= now()
      and (e.access_ends_at is null or e.access_ends_at > now())
    )
  )
);

create policy product_operators_insert_missions
on public.curriculum_missions for insert to authenticated
with check ((select public.has_operator_permission('products')));

create policy product_operators_update_missions
on public.curriculum_missions for update to authenticated
using ((select public.has_operator_permission('products')))
with check ((select public.has_operator_permission('products')));

create policy product_operators_delete_missions
on public.curriculum_missions for delete to authenticated
using ((select public.has_operator_permission('products')));

create policy members_read_own_submissions
on public.mission_submissions for select to authenticated
using (
  exists (
    select 1
    from public.enrollments e
    where e.id = enrollment_id
      and e.user_id = (select auth.uid())
  )
  or (select public.has_operator_permission('members'))
);

-- Learner writes must pass through an authenticated server route. This keeps
-- review status and reviewer fields outside the member's direct Data API path.
create policy member_operators_update_submissions
on public.mission_submissions for update to authenticated
using ((select public.has_operator_permission('members')))
with check ((select public.has_operator_permission('members')));

revoke execute on function public.validate_mission_submission_scope()
  from public, anon, authenticated;
grant execute on function public.validate_mission_submission_scope() to service_role;

comment on table public.mission_submissions is
  'Enrollment-scoped mission attempts. Achievement level is derived from approved required missions in application code.';

commit;
