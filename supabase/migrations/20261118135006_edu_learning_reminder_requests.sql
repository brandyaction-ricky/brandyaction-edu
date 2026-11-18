begin;

create table public.edu_learning_reminder_requests (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  kind text not null check (kind in ('member_inactive', 'learning_stalled')),
  days integer not null check (days between 1 and 365),
  requested_at timestamptz not null,
  due_at timestamptz not null check (due_at = requested_at + make_interval(hours => days * 24)),
  -- These requests record the shown terms while delivery is unavailable. They
  -- must never be used as consent to send after a future provider approval.
  consent_version text not null check (consent_version = 'request-only-v1'),
  closed_at timestamptz,
  close_reason text check (close_reason in ('cancelled', 'activity', 'elapsed')),
  check ((closed_at is null) = (close_reason is null)),
  check (closed_at is null or closed_at >= requested_at)
);

alter table public.edu_learning_reminder_requests enable row level security;
revoke all on public.edu_learning_reminder_requests from public, anon, authenticated;
grant select, insert, update on public.edu_learning_reminder_requests to service_role;

create unique index edu_learning_reminder_open_idx
  on public.edu_learning_reminder_requests(user_id, enrollment_id, kind) where closed_at is null;
create index edu_learning_reminder_recent_idx
  on public.edu_learning_reminder_requests(user_id, enrollment_id, kind, requested_at desc, id);
create index edu_learning_reminder_enrollment_idx on public.edu_learning_reminder_requests(enrollment_id);

-- Access is scoped to the authenticated student's current paid seat. An
-- operator-granted seat in a paid class is eligible without a payment lookup.
create function edu_private.edu_learning_reminder_courses(p_user uuid)
returns table(enrollment_id uuid, course_title text, cohort_name text)
language sql stable security invoker set search_path = '' as $$
  select e.id, course.title, cohort.name
  from public.enrollments e
  join public.courses course on course.id = e.course_id
  join public.cohorts cohort on cohort.id = e.cohort_id and cohort.course_id = e.course_id
  where e.user_id = p_user and e.status = 'active' and e.revoked_at is null
    and e.access_starts_at <= now() and (e.access_ends_at is null or e.access_ends_at > now())
    and course.category = 'paid_class' and cohort.price > 0
    and course.status <> 'archived' and course.archived_at is null and cohort.archived_at is null
    and cohort.status not in ('cancelled', 'completed') and cohort.operation_start_at <= now()
    and (cohort.operation_end_at is null or cohort.operation_end_at > now());
$$;

create function edu_private.edu_learning_reminder_state(
  p_request public.edu_learning_reminder_requests, p_anchor timestamptz, p_now timestamptz
)
returns text language sql immutable security invoker set search_path = '' as $$
  select coalesce(p_request.close_reason, case
    when p_anchor is null or p_anchor > p_request.requested_at then 'activity'
    when p_request.due_at <= p_now then 'elapsed'
    else 'pending'
  end);
$$;

create function public.edu_learning_reminders(
  p_user uuid, p_action text, p_request uuid default null, p_enrollment uuid default null,
  p_kind text default null, p_days integer default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_at timestamptz := now();
  v_phone text;
  v_progress_at timestamptz;
  v_visit_at timestamptz;
  v_anchor timestamptz;
  v_courses jsonb;
begin
  select regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') into v_phone
    from public.profiles where id = p_user and role = 'student' and status = 'active';
  if not found then raise insufficient_privilege using message = 'LEARNING_REMINDER_FORBIDDEN'; end if;

  select max(last_seen_at) into v_visit_at from public.edu_member_visits where user_id = p_user;

  if p_action = 'request' then
    if p_request is null or p_enrollment is null or p_kind is null
      or p_kind not in ('member_inactive', 'learning_stalled') or p_days is null or p_days not between 1 and 365 then
      raise invalid_parameter_value using message = 'LEARNING_REMINDER_INVALID';
    end if;

    -- Serialize two requests for the same seat and recheck current ownership
    -- after any refund, revocation or transfer that already holds this row.
    perform 1 from public.enrollments where id = p_enrollment and user_id = p_user for update;
    if not found or not exists (
      select 1 from edu_private.edu_learning_reminder_courses(p_user) where enrollment_id = p_enrollment
    ) then raise insufficient_privilege using message = 'LEARNING_REMINDER_FORBIDDEN'; end if;

    v_progress_at := edu_private.edu_retention_clock(p_enrollment, 'learning_stalled');
    v_anchor := case when p_kind = 'member_inactive' then v_visit_at else v_progress_at end;
    if v_progress_at is null or v_anchor is null or v_anchor > v_at then
      raise insufficient_privilege using message = 'LEARNING_REMINDER_FORBIDDEN';
    end if;

    update public.edu_learning_reminder_requests r
      set closed_at = v_at, close_reason = edu_private.edu_learning_reminder_state(r, v_anchor, v_at)
      where r.user_id = p_user and r.enrollment_id = p_enrollment and r.kind = p_kind
        and r.closed_at is null and edu_private.edu_learning_reminder_state(r, v_anchor, v_at) <> 'pending';

    -- p_request is the form attempt ID. Retrying an old request after it was
    -- cancelled or superseded cannot create another request.
    insert into public.edu_learning_reminder_requests
      (id, user_id, enrollment_id, kind, days, requested_at, due_at, consent_version)
      values (p_request, p_user, p_enrollment, p_kind, p_days, v_at,
        v_at + make_interval(hours => p_days * 24), 'request-only-v1')
      on conflict do nothing;

  elsif p_action = 'cancel' then
    if p_request is null then raise invalid_parameter_value using message = 'LEARNING_REMINDER_INVALID'; end if;
    update public.edu_learning_reminder_requests
      set closed_at = v_at, close_reason = 'cancelled'
      where id = p_request and user_id = p_user and closed_at is null;
  elsif p_action is distinct from 'list' then
    raise invalid_parameter_value using message = 'LEARNING_REMINDER_INVALID';
  end if;

  with courses as materialized (
    select *, edu_private.edu_retention_clock(enrollment_id, 'learning_stalled') as progress_at
    from edu_private.edu_learning_reminder_courses(p_user)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'enrollmentId', course.enrollment_id, 'courseTitle', course.course_title,
    'cohortName', course.cohort_name, 'choices', choices.items
  ) order by course.course_title, course.cohort_name, course.enrollment_id), '[]'::jsonb)
  into v_courses
  from courses course
  cross join lateral (
    select jsonb_agg(jsonb_build_object('kind', kind.name,
      'eligible', coalesce(course.progress_at is not null and kind.anchor <= v_at, false),
      'request', case when r.id is not null then jsonb_build_object(
        'id', r.id, 'days', r.days, 'requestedAt', r.requested_at, 'dueAt', r.due_at,
        'status', edu_private.edu_learning_reminder_state(r, case when course.progress_at is not null then kind.anchor end, v_at)
      ) end) order by kind.ordinal) as items
    from (values ('member_inactive', v_visit_at, 1), ('learning_stalled', course.progress_at, 2)) kind(name, anchor, ordinal)
    left join lateral (
      select req.* from public.edu_learning_reminder_requests req
      where req.user_id = p_user and req.enrollment_id = course.enrollment_id and req.kind = kind.name
      order by req.requested_at desc, req.id desc limit 1
    ) r on true
  ) choices;

  return jsonb_build_object('courses', v_courses, 'maskedPhone', case
    when v_phone ~ '^0[0-9]{8,10}$' then left(v_phone, 3) || '-****-' || right(v_phone, 4)
  end);
end;
$$;

revoke all on function edu_private.edu_learning_reminder_courses(uuid),
  edu_private.edu_learning_reminder_state(public.edu_learning_reminder_requests, timestamptz, timestamptz),
  public.edu_learning_reminders(uuid, text, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function edu_private.edu_learning_reminder_courses(uuid),
  edu_private.edu_learning_reminder_state(public.edu_learning_reminder_requests, timestamptz, timestamptz),
  public.edu_learning_reminders(uuid, text, uuid, uuid, text, integer) to service_role;

commit;
