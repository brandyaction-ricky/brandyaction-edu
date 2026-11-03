-- Local candidate only. Apply separately after review; EDU_CAMPUS_FOCUS_ENABLED stays off.
-- Personal planning records are not proof of attention, lesson completion, or rewards.
begin;

create table public.edu_campus_focus_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  -- Curriculum authoring may hard-delete lessons. Keep the private historical note;
  -- INSERT RLS validates the lesson/course/version and the trigger freezes this ID.
  lesson_id uuid not null,
  lesson_version text not null check (char_length(btrim(lesson_version)) between 1 and 160),
  action_text text not null check (char_length(btrim(action_text)) between 1 and 300),
  result_note text not null default '' check (char_length(result_note) <= 1000),
  next_step text not null default '' check (char_length(next_step) <= 500),
  status text not null check (status in ('running', 'paused', 'finished')),
  elapsed_seconds integer not null default 0 check (elapsed_seconds between 0 and 900),
  running_since timestamptz,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at),
  check ((status = 'running' and running_since is not null and running_since between created_at and updated_at)
    or (status <> 'running' and running_since is null)),
  check (status <> 'finished' or (char_length(btrim(result_note)) > 0 and char_length(btrim(next_step)) > 0))
);
create unique index edu_campus_focus_one_unfinished on public.edu_campus_focus_sessions (user_id, enrollment_id) where status <> 'finished';
create index edu_campus_focus_latest on public.edu_campus_focus_sessions (user_id, enrollment_id, created_at desc, id desc);
create index edu_campus_focus_enrollment on public.edu_campus_focus_sessions (enrollment_id);
create index edu_campus_focus_lesson on public.edu_campus_focus_sessions (lesson_id);

create function public.edu_campus_focus_has_scope(p_enrollment_id uuid, p_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_user_id = (select auth.uid()) and exists (
    select 1 from public.enrollments e
    join public.profiles p on p.id = e.user_id and p.status = 'active'
    join public.courses c on c.id = e.course_id and c.status = 'published' and c.archived_at is null
    join public.cohorts h on h.id = e.cohort_id and h.course_id = e.course_id and h.archived_at is null
    where e.id = p_enrollment_id and e.user_id = p_user_id and e.status = 'active' and e.revoked_at is null
      and (e.access_starts_at is null or e.access_starts_at <= now())
      and (e.access_ends_at is null or e.access_ends_at > now())
  );
$$;
revoke all on function public.edu_campus_focus_has_scope(uuid, uuid) from public, anon;
grant execute on function public.edu_campus_focus_has_scope(uuid, uuid) to authenticated;

alter table public.edu_campus_focus_sessions enable row level security;
revoke all on public.edu_campus_focus_sessions from public, anon, authenticated;
grant select, insert, update on public.edu_campus_focus_sessions to authenticated;

-- Existing private notes survive a lesson becoming hidden, provided enrollment remains active.
create policy edu_campus_focus_select on public.edu_campus_focus_sessions for select to authenticated
using (user_id = (select auth.uid()) and public.edu_campus_focus_has_scope(enrollment_id, user_id));
create policy edu_campus_focus_insert on public.edu_campus_focus_sessions for insert to authenticated
with check (user_id = (select auth.uid()) and public.edu_campus_focus_has_scope(enrollment_id, user_id) and exists (
  select 1 from public.curriculum_lessons l
  join public.curriculum_weeks w on w.id = l.week_id and w.is_published
  join public.enrollments e on e.id = enrollment_id and e.course_id = w.course_id
  where l.id = lesson_id and l.is_published and l.updated_at = lesson_version::timestamptz
));
create policy edu_campus_focus_update on public.edu_campus_focus_sessions for update to authenticated
using (user_id = (select auth.uid()) and public.edu_campus_focus_has_scope(enrollment_id, user_id))
with check (user_id = (select auth.uid()) and public.edu_campus_focus_has_scope(enrollment_id, user_id));

create function public.edu_campus_focus_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    if new.status <> 'running' or new.revision <> 1 or new.elapsed_seconds <> 0
      or new.running_since is distinct from new.created_at or new.updated_at is distinct from new.created_at
      or new.result_note <> '' or new.next_step <> '' then
      raise exception 'Invalid initial focus record' using errcode = '23514';
    end if;
  else
    if old.status = 'finished' then
      raise exception 'Finished focus records are immutable' using errcode = '23514';
    end if;
    if row(new.id, new.user_id, new.enrollment_id, new.lesson_id, new.lesson_version, new.action_text, new.created_at)
      is distinct from row(old.id, old.user_id, old.enrollment_id, old.lesson_id, old.lesson_version, old.action_text, old.created_at) then
      raise exception 'Focus identity is immutable' using errcode = '23514';
    end if;
    if new.revision <> old.revision + 1 or new.updated_at < old.updated_at or new.elapsed_seconds < old.elapsed_seconds
      or not ((old.status = 'running' and new.status in ('paused', 'finished'))
        or (old.status = 'paused' and new.status in ('running', 'finished'))) then
      raise exception 'Invalid focus transition' using errcode = '23514';
    end if;
    if new.status <> 'finished' and (new.result_note is distinct from old.result_note or new.next_step is distinct from old.next_step) then
      raise exception 'Notes are saved when finishing' using errcode = '23514';
    end if;
    if new.status = 'running' and (new.elapsed_seconds >= 900 or new.running_since is distinct from new.updated_at) then
      raise exception 'Invalid focus resume' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.edu_campus_focus_guard() from public, anon, authenticated;
create trigger edu_campus_focus_guard before insert or update on public.edu_campus_focus_sessions
for each row execute function public.edu_campus_focus_guard();
comment on table public.edu_campus_focus_sessions is 'Private self-reported 15-minute planning records. Never used to award completion, XP, or verified learning time.';
commit;
