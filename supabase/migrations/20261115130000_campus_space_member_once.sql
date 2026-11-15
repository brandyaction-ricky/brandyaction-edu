-- Study-room policies checked membership once per ROW: edu_campus_space_member(cohort_id) ran (with nested RLS on
-- enrollments, profiles, courses and cohorts) for every presence, seat and chat row a query touched. On DEV with 30
-- learners the roster read averaged 308 ms and the head count 578 ms, and both grew with the room. The cohorts a learner
-- may use are now computed once per statement and compared with IN (same rule: active profile, active enrollment in its
-- access window, published course, cohort not archived).
begin;
create function private.edu_campus_space_cohorts() returns setof uuid language sql stable security definer set search_path='' as $$
 select e.cohort_id from public.enrollments e
 join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.user_id=(select auth.uid()) and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now());
$$;
revoke all on function private.edu_campus_space_cohorts() from public,anon;
grant execute on function private.edu_campus_space_cohorts() to authenticated;
do $migration$
declare pol record; old_call text:='edu_campus_space_member(cohort_id)'; new_call text:='(cohort_id IN ( SELECT private.edu_campus_space_cohorts()))'; changed integer:=0;
begin
 for pol in select tablename,policyname,qual,with_check from pg_policies where schemaname='public'
  and tablename in ('edu_campus_space_presence','edu_campus_space_seats','edu_campus_space_chat','edu_campus_space_controls')
  and (coalesce(qual,'')||coalesce(with_check,'')) like '%'||old_call||'%' loop
  if pol.qual is not null then execute format('alter policy %I on public.%I using (%s)',pol.policyname,pol.tablename,replace(pol.qual,old_call,new_call)); end if;
  if pol.with_check is not null then execute format('alter policy %I on public.%I with check (%s)',pol.policyname,pol.tablename,replace(pol.with_check,old_call,new_call)); end if;
  changed:=changed+1;
 end loop;
 if changed<>9 then raise exception 'Expected 9 study-room policies to rewrite, found %; review before applying',changed; end if;
end; $migration$;
notify pgrst,'reload schema';
commit;
