-- Staff QA 11-17 (10cbd988 C4): an author can take a work back to "나만 보기", share it again,
-- or remove it; a commenter can edit or remove their own comment. Removal only hides the row
-- from members (removed_at); reports, moderation history and operator views stay intact.
begin;
set local lock_timeout='3s';

alter table public.edu_campus_posts add column if not exists removed_at timestamptz;
alter table public.edu_campus_comments add column if not exists removed_at timestamptz;
alter table public.edu_campus_comments add column if not exists edited_at timestamptz;

-- Members never read removed posts (their own included); operators keep their existing branch.
drop policy campus_posts_read on public.edu_campus_posts;
create policy campus_posts_read on public.edu_campus_posts for select using (
  (select private.campus_community_active()) and (
    ((select private.mission_has_scope('members')) and (visibility='cohort' or exists(select 1 from public.edu_campus_reports r where r.post_id=edu_campus_posts.id)))
    or (cohort_id in (select private.campus_community_cohorts()) and removed_at is null and (
      owner_id=(select auth.uid())
      or (visibility='cohort' and not hidden and not ((cohort_id,owner_id) in (select b.cohort_id,b.other_id from private.campus_community_blocked_pairs() b(cohort_id,other_id))))))));

drop policy campus_comments_read on public.edu_campus_comments;
create policy campus_comments_read on public.edu_campus_comments for select using (
  exists(select 1 from public.edu_campus_posts p where p.id=edu_campus_comments.post_id and (
    (select private.mission_has_scope('members'))
    or (not edu_campus_comments.hidden and edu_campus_comments.removed_at is null
        and not ((p.cohort_id,edu_campus_comments.author_id) in (select b.cohort_id,b.other_id from private.campus_community_blocked_pairs() b(cohort_id,other_id)))))));

create function private.campus_community_owner(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  action text := c->>'action';
  post public.edu_campus_posts;
  comment public.edu_campus_comments;
  new_body text := btrim(coalesce(c->>'body',''));
begin
  if actor is null or not private.campus_community_active() or not private.edu_account_access_allowed() then raise insufficient_privilege; end if;
  if action in ('withdraw','share','remove') then
    select * into post from public.edu_campus_posts where id=(c->>'postId')::uuid for update;
    if not found or post.owner_id<>actor or post.removed_at is not null or not private.campus_community_scope(post.cohort_id) then raise insufficient_privilege; end if;
    if action='share' then
      if post.hidden then raise exception 'Post hidden by an operator' using errcode='23514'; end if;
      update public.edu_campus_posts set visibility='cohort' where id=post.id;
    else
      -- Shared files follow the work back to private; a later share asks for each file again.
      update public.edu_campus_portfolio_files set visibility='private', revision=revision+1 where post_id=post.id and visibility='cohort';
      update public.edu_campus_posts set visibility='private', removed_at=case when action='remove' then now() else removed_at end where id=post.id;
    end if;
    return jsonb_build_object('postId',post.id);
  elsif action in ('edit_comment','remove_comment') then
    select * into comment from public.edu_campus_comments where id=(c->>'commentId')::uuid for update;
    if not found or comment.author_id<>actor or comment.removed_at is not null then raise insufficient_privilege; end if;
    select * into post from public.edu_campus_posts where id=comment.post_id;
    if not found or not private.campus_community_scope(post.cohort_id) then raise insufficient_privilege; end if;
    if action='edit_comment' then
      if char_length(new_body) not between 10 and 2000 then raise exception 'Comment length' using errcode='23514'; end if;
      update public.edu_campus_comments set body=new_body, edited_at=now() where id=comment.id;
    else
      update public.edu_campus_comments set removed_at=now() where id=comment.id;
    end if;
    return jsonb_build_object('commentId',comment.id);
  end if;
  raise exception 'Unknown action' using errcode='22P02';
end;$$;
revoke all on function private.campus_community_owner(jsonb) from public,anon,authenticated;

create function public.edu_campus_community_owner(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.campus_community_owner(p_command) $$;
revoke all on function public.edu_campus_community_owner(jsonb) from public,anon;
grant execute on function public.edu_campus_community_owner(jsonb) to authenticated;
grant execute on function private.campus_community_owner(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
