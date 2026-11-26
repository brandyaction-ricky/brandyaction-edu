create table public.edu_external_partner_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id),
  cohort_id uuid not null references public.cohorts(id),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  access_ends_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  check (access_ends_at > created_at)
);

create index edu_external_partner_access_user_idx on public.edu_external_partner_access (user_id, created_at desc);
create index edu_external_partner_access_cohort_idx on public.edu_external_partner_access (cohort_id);
create index edu_external_partner_access_course_idx on public.edu_external_partner_access (course_id);

alter table public.edu_external_partner_access enable row level security;
revoke all on public.edu_external_partner_access from public, anon, authenticated, service_role;
grant select on public.edu_external_partner_access to service_role;

create function public.edu_set_external_partner_access(
  p_actor uuid, p_access uuid, p_user uuid, p_course uuid, p_cohort uuid, p_expires timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  result uuid;
begin
  perform 1 from public.profiles where id = p_actor and role = 'admin' and status = 'active' for share;
  if not found then raise exception 'PARTNER_ADMIN_REQUIRED' using errcode = '42501'; end if;

  if p_access is not null then
    update public.edu_external_partner_access
      set revoked_at = coalesce(revoked_at, now()), revoked_by = coalesce(revoked_by, p_actor)
      where id = p_access and user_id = p_user
      returning id into result;
    if result is null then raise exception 'PARTNER_GRANT_NOT_FOUND' using errcode = 'P0002'; end if;
    return result;
  end if;

  if p_expires is null or p_expires <= now() then
    raise exception 'PARTNER_EXPIRY_INVALID' using errcode = '22023';
  end if;

  -- A target-row lock serializes repeated grants for the same account.
  perform 1 from public.profiles where id = p_user and role = 'student' and status = 'active' for update;
  if not found then raise exception 'PARTNER_MEMBER_UNAVAILABLE' using errcode = 'P0002'; end if;

  perform 1 from public.courses c join public.cohorts h on h.course_id = c.id
    where c.id = p_course and h.id = p_cohort and c.status = 'published'
      and c.archived_at is null and h.archived_at is null
    for share of c, h;
  if not found then raise exception 'PARTNER_COHORT_UNAVAILABLE' using errcode = 'P0002'; end if;

  select id into result from public.edu_external_partner_access
    where user_id = p_user and cohort_id = p_cohort and revoked_at is null and access_ends_at > now()
    limit 1;
  if result is not null then
    raise exception 'PARTNER_GRANT_EXISTS' using errcode = '23505';
  end if;

  insert into public.edu_external_partner_access (user_id, course_id, cohort_id, access_ends_at, created_by)
    values (p_user, p_course, p_cohort, p_expires, p_actor)
    returning id into result;
  return result;
end
$$;

revoke all on function public.edu_set_external_partner_access(uuid,uuid,uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.edu_set_external_partner_access(uuid,uuid,uuid,uuid,uuid,timestamptz) to service_role;

create function public.edu_external_partner_scopes(p_user uuid)
returns table (id uuid, course_id uuid, cohort_id uuid, course_title text, cohort_name text, access_ends_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.course_id, a.cohort_id, c.title, h.name, a.access_ends_at
  from public.edu_external_partner_access a
  join public.profiles p on p.id = a.user_id and p.status = 'active' and p.role = 'student'
  join public.courses c on c.id = a.course_id and c.status = 'published' and c.archived_at is null
  join public.cohorts h on h.id = a.cohort_id and h.course_id = a.course_id and h.archived_at is null
  where a.user_id = p_user and a.revoked_at is null and a.access_ends_at > now()
  order by a.created_at desc, a.id
$$;

revoke all on function public.edu_external_partner_scopes(uuid) from public, anon, authenticated;
grant execute on function public.edu_external_partner_scopes(uuid) to service_role;

-- An authenticated session can request only its own grants, including when a
-- campus request revalidates a previously assigned grant ID.
create function public.edu_my_external_partner_scopes(p_access uuid default null)
returns table (id uuid, course_id uuid, cohort_id uuid, course_title text, cohort_name text, access_ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select * from public.edu_external_partner_scopes((select auth.uid())) s
  where p_access is null or s.id = p_access
$$;
revoke all on function public.edu_my_external_partner_scopes(uuid) from public, anon;
grant execute on function public.edu_my_external_partner_scopes(uuid) to authenticated;
