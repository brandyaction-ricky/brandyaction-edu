begin;

alter table public.crm_tags
  add column if not exists is_active boolean not null default true;

alter table public.crm_tags drop constraint if exists crm_tags_rule_key_allowed;
alter table public.crm_tags add constraint crm_tags_rule_key_allowed check (
  rule_key is null or rule_key in (
    'free_lesson_1', 'free_lesson_2', 'free_lesson_3',
    'paid_customer', 'mission_completed', 'signed_up'
  )
);

create or replace function public.crm_sync_automatic_tags(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text;
  v_free_stage integer:=0;
begin
  if p_member_id is null then return; end if;

  select status into v_status from public.profiles where id=p_member_id;

  if v_status is null or v_status='withdrawn' then
    delete from public.crm_member_tags where member_id=p_member_id and assignment_source='automatic';
    return;
  end if;

  select coalesce(least(3,max(completed_count)),0) into v_free_stage
  from (
    select count(*)::integer as completed_count
    from public.lesson_progress progress
    join public.enrollments enrollment on enrollment.id=progress.enrollment_id
    join public.courses course on course.id=enrollment.course_id
    where enrollment.user_id=p_member_id
      and enrollment.status='active'
      and coalesce(course.metadata->>'programType','paid')='free'
      and (progress.completed_at is not null or progress.progress_percent=100)
    group by enrollment.id
  ) stages;

  delete from public.crm_member_tags member_tag
  using public.crm_tags tag
  where member_tag.member_id=p_member_id
    and member_tag.tag_id=tag.id
    and member_tag.assignment_source='automatic'
    and not (
      tag.tag_kind='automatic'
      and tag.is_active
      and (
        tag.rule_key='signed_up'
        or (tag.rule_key='paid_customer' and exists(
          select 1 from public.orders where user_id=p_member_id and total_amount>0 and status in ('paid','partially_refunded')
        ))
        or (tag.rule_key='mission_completed' and exists(
          select 1 from public.mission_submissions submission
          join public.enrollments enrollment on enrollment.id=submission.enrollment_id
          where enrollment.user_id=p_member_id and submission.status in ('submitted','approved')
        ))
        or tag.rule_key='free_lesson_'||v_free_stage::text
      )
    );

  insert into public.crm_member_tags(member_id,tag_id,assigned_by,assignment_source,rule_key,assigned_at)
  select p_member_id,tag.id,null,'automatic',tag.rule_key,now()
  from public.crm_tags tag
  where tag.tag_kind='automatic'
    and tag.is_active
    and (
      tag.rule_key='signed_up'
      or (tag.rule_key='paid_customer' and exists(
        select 1 from public.orders
        where user_id=p_member_id and total_amount>0 and status in ('paid','partially_refunded')
      ))
      or (tag.rule_key='mission_completed' and exists(
        select 1 from public.mission_submissions submission
        join public.enrollments enrollment on enrollment.id=submission.enrollment_id
        where enrollment.user_id=p_member_id and submission.status in ('submitted','approved')
      ))
      or tag.rule_key='free_lesson_'||v_free_stage::text
    )
  on conflict(member_id,tag_id) do update set
    assignment_source='automatic',
    rule_key=excluded.rule_key,
    assigned_at=excluded.assigned_at;
end;
$$;

create or replace function public.crm_resync_all_automatic_tags()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_member_id uuid;
begin
  for v_member_id in select id from public.profiles loop
    perform public.crm_sync_automatic_tags(v_member_id);
  end loop;
end;
$$;

revoke all on function public.crm_resync_all_automatic_tags() from public, anon, authenticated;
grant execute on function public.crm_resync_all_automatic_tags() to service_role;

create or replace function public.crm_sync_tags_from_mission()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_member_id uuid;
begin
  select user_id into v_member_id
  from public.enrollments
  where id=case when tg_op='DELETE' then old.enrollment_id else new.enrollment_id end;
  perform public.crm_sync_automatic_tags(v_member_id);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists crm_automatic_tags_mission on public.mission_submissions;
create trigger crm_automatic_tags_mission
after insert or update of status,enrollment_id or delete on public.mission_submissions
for each row execute function public.crm_sync_tags_from_mission();

create or replace function public.crm_sync_tags_from_profile()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.crm_sync_automatic_tags(new.id);
  return new;
end;
$$;

drop trigger if exists crm_automatic_tags_profile on public.profiles;
create trigger crm_automatic_tags_profile
after insert or update of status on public.profiles
for each row execute function public.crm_sync_tags_from_profile();

select public.crm_resync_all_automatic_tags();

commit;
