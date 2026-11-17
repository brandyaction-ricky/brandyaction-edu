-- Work-feedback read policies ran a security-definer check for every row: campus_community_read_post(id) per post and
-- revision, campus_community_read_comment(id) (which calls read_post again) per comment and acknowledgment. With 120
-- learners opening the list at once on DEV the posts read averaged 4.3 s, comments 2.1 s, revisions 1.5 s; 71 of 120
-- list reads timed out and slowed every other request on the database.
-- The same rule is now evaluated set-wise: the learner's cohorts and block pairs are computed once per statement, staff
-- scope and active profile are evaluated once, and comments, acknowledgments and revisions reuse the posts policy by
-- reading the parent row. Who can read what does not change. The old functions stay for the routines that call them.
begin;
create function private.campus_community_cohorts() returns setof uuid language sql stable security definer set search_path='' as $$
 select e.cohort_id from public.enrollments e join public.profiles p on p.id=e.user_id
 join public.courses c on c.id=e.course_id join public.cohorts h on h.id=e.cohort_id and h.course_id=c.id
 where e.user_id=(select auth.uid()) and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())
 and p.status='active' and c.status='published' and c.archived_at is null and h.archived_at is null;
$$;
create function private.campus_community_blocked_pairs() returns table(cohort_id uuid,other_id uuid) language sql stable security definer set search_path='' as $$
 select b.cohort_id,b.target_id from public.edu_campus_blocks b where b.owner_id=(select auth.uid())
 union select b.cohort_id,b.owner_id from public.edu_campus_blocks b where b.target_id=(select auth.uid());
$$;
revoke all on function private.campus_community_cohorts(),private.campus_community_blocked_pairs() from public,anon;
grant execute on function private.campus_community_cohorts(),private.campus_community_blocked_pairs() to authenticated;
alter policy campus_posts_read on public.edu_campus_posts using (
 (select private.campus_community_active()) and (
  ((select private.mission_has_scope('members')) and (visibility='cohort' or exists(select 1 from public.edu_campus_reports r where r.post_id=edu_campus_posts.id)))
  or (cohort_id in (select private.campus_community_cohorts()) and (owner_id=(select auth.uid()) or (visibility='cohort' and not hidden
   and (cohort_id,owner_id) not in (select b.cohort_id,b.other_id from private.campus_community_blocked_pairs() b))))));
alter policy campus_comments_read on public.edu_campus_comments using (
 exists(select 1 from public.edu_campus_posts p where p.id=edu_campus_comments.post_id and ((select private.mission_has_scope('members'))
  or (not edu_campus_comments.hidden and (p.cohort_id,edu_campus_comments.author_id) not in (select b.cohort_id,b.other_id from private.campus_community_blocked_pairs() b)))));
alter policy campus_ack_read on public.edu_campus_feedback_acknowledgments using (
 exists(select 1 from public.edu_campus_comments c where c.id=edu_campus_feedback_acknowledgments.comment_id));
alter policy campus_revisions_read on public.edu_campus_post_revisions using (
 exists(select 1 from public.edu_campus_posts p where p.id=edu_campus_post_revisions.post_id and (edu_campus_post_revisions.visibility='cohort' or p.owner_id=(select auth.uid()))));
notify pgrst,'reload schema';
commit;
