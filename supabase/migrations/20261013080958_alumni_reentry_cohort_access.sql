begin;

-- A recruiting re-entry cohort can grant graduates lifetime curriculum access
-- immediately after checkout, without opening coached submissions or reviews.
alter table public.cohorts
  add column alumni_access_on_enroll boolean not null default false;

create or replace function public.edu_is_graduate_enrollment(p_enrollment uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.enrollments e
      join public.courses c on c.id = e.course_id
      join public.cohorts h on h.id = e.cohort_id and h.course_id = c.id
    where e.id = p_enrollment and c.category = 'paid_class'
      and e.status = 'active' and e.revoked_at is null
      and (e.access_starts_at is null or e.access_starts_at <= now())
      and (e.access_ends_at is null or e.access_ends_at > now())
      and h.status <> 'cancelled'
      and (h.alumni_access_on_enroll or h.status = 'completed' or h.operation_end_at <= now())
  );
$$;

revoke all on function public.edu_is_graduate_enrollment(uuid) from public, anon, authenticated;
grant execute on function public.edu_is_graduate_enrollment(uuid) to service_role;

commit;
