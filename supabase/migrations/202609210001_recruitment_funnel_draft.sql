begin;

-- Immutable revisions of the first pilot's mapping. Saving never starts tracking.
create table public.edu_recruitment_funnel_revisions (
  version integer primary key check (version > 0),
  actor_id uuid references public.profiles(id) on delete set null,
  request_id uuid not null,
  expected_version integer not null check (expected_version >= 0),
  free_course_id uuid not null references public.courses(id) on delete restrict,
  free_cohort_id uuid not null references public.cohorts(id) on delete restrict,
  paid_course_id uuid not null references public.courses(id) on delete restrict,
  paid_cohort_id uuid not null references public.cohorts(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (actor_id, request_id),
  check (free_course_id <> paid_course_id)
);
alter table public.edu_recruitment_funnel_revisions enable row level security;
revoke all on public.edu_recruitment_funnel_revisions from public, anon, authenticated, service_role;
grant select on public.edu_recruitment_funnel_revisions to service_role;

create function public.edu_save_recruitment_funnel(
  p_actor uuid, p_request uuid, p_expected integer,
  p_free_course uuid, p_free_cohort uuid, p_paid_course uuid, p_paid_cohort uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  permissions jsonb;
  previous public.edu_recruitment_funnel_revisions%rowtype;
  current_version integer;
begin
  select * into actor from public.profiles where id=p_actor and status='active' for share;
  if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
  if actor.role='staff' then
    select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text for share;
    if (permissions->'marketing') is distinct from 'true'::jsonb or (permissions->'products') is distinct from 'true'::jsonb then
      raise exception 'CONVERSION_FORBIDDEN';
    end if;
  end if;
  if p_request is null or p_expected is null or p_expected < 0 or p_free_course is null or p_paid_course is null
    or p_free_cohort is null or p_paid_cohort is null or p_free_course=p_paid_course then raise exception 'CONVERSION_INVALID'; end if;
  perform pg_catalog.pg_advisory_xact_lock(207260921,1);
  select * into previous from public.edu_recruitment_funnel_revisions where actor_id=p_actor and request_id=p_request;
  if found then
    if previous.expected_version<>p_expected or previous.free_course_id<>p_free_course or previous.free_cohort_id<>p_free_cohort
      or previous.paid_course_id<>p_paid_course or previous.paid_cohort_id<>p_paid_cohort then raise exception 'CONVERSION_REQUEST_REUSED'; end if;
    return to_jsonb(previous);
  end if;
  select coalesce(max(version),0) into current_version from public.edu_recruitment_funnel_revisions;
  if current_version<>p_expected then raise exception 'CONVERSION_STALE'; end if;
  perform 1 from public.courses where id=p_free_course for share;
  if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
  perform 1 from public.courses where id=p_paid_course for share;
  if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
  perform 1 from public.cohorts where id=p_free_cohort and course_id=p_free_course for share;
  if not found then raise exception 'CONVERSION_INVALID'; end if;
  perform 1 from public.cohorts where id=p_paid_cohort and course_id=p_paid_course for share;
  if not found then raise exception 'CONVERSION_INVALID'; end if;
  insert into public.edu_recruitment_funnel_revisions(version, actor_id, request_id, expected_version, free_course_id, free_cohort_id, paid_course_id, paid_cohort_id)
    values(current_version+1,p_actor,p_request,p_expected,p_free_course,p_free_cohort,p_paid_course,p_paid_cohort) returning * into previous;
  return to_jsonb(previous);
end;
$$;
revoke all on function public.edu_save_recruitment_funnel(uuid,uuid,integer,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_save_recruitment_funnel(uuid,uuid,integer,uuid,uuid,uuid,uuid) to service_role;
commit;
