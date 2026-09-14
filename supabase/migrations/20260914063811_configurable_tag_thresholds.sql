begin;

alter table public.crm_tags
  add column if not exists threshold_percent integer not null default 80
  check (threshold_percent between 1 and 100);

create or replace function public.crm_sync_automatic_tags(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_status text;
begin
  if p_member_id is null then return; end if;
  select status into v_status from public.profiles where id=p_member_id;
  if v_status is null or v_status='withdrawn' then
    delete from public.crm_member_tags where member_id=p_member_id and assignment_source='automatic';
    return;
  end if;

  delete from public.crm_member_tags member_tag
  using public.crm_tags tag
  where member_tag.member_id=p_member_id and member_tag.tag_id=tag.id and member_tag.assignment_source='automatic'
    and not (tag.tag_kind='automatic' and tag.is_active and (
      tag.rule_key='signed_up'
      or (tag.rule_key='paid_customer' and exists(select 1 from public.orders where user_id=p_member_id and total_amount>0 and status in ('paid','partially_refunded')))
      or (tag.rule_key='mission_completed' and exists(select 1 from public.mission_submissions submission join public.enrollments enrollment on enrollment.id=submission.enrollment_id where enrollment.user_id=p_member_id and submission.status in ('submitted','approved')))
      or (tag.rule_key like 'free_lesson_%' and exists(
        select 1 from public.enrollments enrollment join public.courses course on course.id=enrollment.course_id
        where enrollment.user_id=p_member_id and enrollment.status='active' and (course.category='free' or coalesce(course.metadata->>'programType',course.metadata->>'productType','paid')='free')
          and (select count(*) from public.lesson_progress progress where progress.enrollment_id=enrollment.id and (progress.completed_at is not null or progress.progress_percent>=tag.threshold_percent)) >= split_part(tag.rule_key,'_',3)::integer
      ))
    ));

  insert into public.crm_member_tags(member_id,tag_id,assigned_by,assignment_source,rule_key,assigned_at)
  select p_member_id,tag.id,null,'automatic',tag.rule_key,now() from public.crm_tags tag
  where tag.tag_kind='automatic' and tag.is_active and (
    tag.rule_key='signed_up'
    or (tag.rule_key='paid_customer' and exists(select 1 from public.orders where user_id=p_member_id and total_amount>0 and status in ('paid','partially_refunded')))
    or (tag.rule_key='mission_completed' and exists(select 1 from public.mission_submissions submission join public.enrollments enrollment on enrollment.id=submission.enrollment_id where enrollment.user_id=p_member_id and submission.status in ('submitted','approved')))
    or (tag.rule_key like 'free_lesson_%' and exists(
      select 1 from public.enrollments enrollment join public.courses course on course.id=enrollment.course_id
      where enrollment.user_id=p_member_id and enrollment.status='active' and (course.category='free' or coalesce(course.metadata->>'programType',course.metadata->>'productType','paid')='free')
        and (select count(*) from public.lesson_progress progress where progress.enrollment_id=enrollment.id and (progress.completed_at is not null or progress.progress_percent>=tag.threshold_percent)) >= split_part(tag.rule_key,'_',3)::integer
    ))
  ) on conflict(member_id,tag_id) do update set assignment_source='automatic',rule_key=excluded.rule_key,assigned_at=excluded.assigned_at;
end;
$$;

revoke all on function public.crm_sync_automatic_tags(uuid) from public, anon, authenticated;
grant execute on function public.crm_sync_automatic_tags(uuid) to service_role;

commit;
