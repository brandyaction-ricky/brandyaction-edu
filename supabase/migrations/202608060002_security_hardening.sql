begin;

-- Public buckets serve known object URLs without a broad SELECT policy.
-- Removing this policy prevents unauthenticated clients from listing every asset.
drop policy if exists course_assets_public_read on storage.objects;

-- Public catalog policies must not invoke privileged role helpers. Operator
-- access is provided separately by the authenticated management policies.
drop policy if exists public_read_published_courses on public.courses;
create policy public_read_published_courses on public.courses
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists public_read_course_assets on public.course_assets;
create policy public_read_course_assets on public.course_assets
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.courses c
      where c.id = course_id and c.status = 'published'
    )
  );

drop policy if exists public_read_available_cohorts on public.cohorts;
create policy public_read_available_cohorts on public.cohorts
  for select to anon, authenticated
  using (
    status <> 'cancelled'
    and exists (
      select 1
      from public.courses c
      where c.id = course_id and c.status = 'published'
    )
  );

drop policy if exists public_read_cohort_sessions on public.cohort_sessions;
create policy public_read_cohort_sessions on public.cohort_sessions
  for select to anon, authenticated
  using (
    is_public
    and exists (
      select 1
      from public.cohorts ch
      join public.courses c on c.id = ch.course_id
      where ch.id = cohort_id
        and ch.status <> 'cancelled'
        and c.status = 'published'
    )
  );

drop policy if exists public_read_curriculum_weeks on public.curriculum_weeks;
create policy public_read_curriculum_weeks on public.curriculum_weeks
  for select to anon, authenticated
  using (
    is_published
    and exists (
      select 1
      from public.courses c
      where c.id = course_id and c.status = 'published'
    )
  );

drop policy if exists public_read_curriculum_lessons on public.curriculum_lessons;
create policy public_read_curriculum_lessons on public.curriculum_lessons
  for select to anon, authenticated
  using (
    is_published
    and exists (
      select 1
      from public.curriculum_weeks w
      join public.courses c on c.id = w.course_id
      where w.id = week_id
        and w.is_published
        and c.status = 'published'
    )
  );

drop policy if exists public_read_published_reviews on public.reviews;
create policy public_read_published_reviews on public.reviews
  for select to anon, authenticated
  using (status = 'published' or user_id = (select auth.uid()));

drop policy if exists public_read_active_banners on public.site_banners;
create policy public_read_active_banners on public.site_banners
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

drop policy if exists public_read_settings on public.site_settings;
create policy public_read_settings on public.site_settings
  for select to anon, authenticated
  using (is_public);

-- Trigger helpers must not be callable through the exposed Data API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Anonymous users do not need to call the role helper directly. Authenticated
-- access remains because RLS policies use the helper for the current user.
revoke execute on function public.is_admin() from public, anon;

-- Some projects created through the dashboard contain this SECURITY DEFINER
-- helper. Keep event-trigger execution intact while removing API execution.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

commit;
