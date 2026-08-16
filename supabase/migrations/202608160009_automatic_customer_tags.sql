begin;

alter table public.crm_tags
  add column if not exists tag_kind text not null default 'manual',
  add column if not exists rule_key text;

alter table public.crm_member_tags
  add column if not exists assignment_source text not null default 'manual',
  add column if not exists rule_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='crm_tags_tag_kind_check') then
    alter table public.crm_tags add constraint crm_tags_tag_kind_check check(tag_kind in ('manual','automatic'));
  end if;
  if not exists (select 1 from pg_constraint where conname='crm_member_tags_assignment_source_check') then
    alter table public.crm_member_tags add constraint crm_member_tags_assignment_source_check check(assignment_source in ('manual','automatic'));
  end if;
end $$;

create unique index if not exists crm_tags_rule_key_key on public.crm_tags(rule_key) where rule_key is not null;
create index if not exists crm_member_tags_rule_key_idx on public.crm_member_tags(rule_key) where rule_key is not null;

insert into public.crm_tags(name,color,description,tag_kind,rule_key)
values
  ('결제 고객','#27895B','유료 상품 결제가 승인된 고객에게 자동으로 부여됩니다.','automatic','paid_customer'),
  ('무료 1강','#4874C9','무료 클래스 강의를 1개 완료한 회원에게 자동으로 부여됩니다.','automatic','free_lesson_1'),
  ('무료 2강','#D77A00','무료 클래스 강의를 2개 완료한 회원에게 자동으로 부여됩니다.','automatic','free_lesson_2'),
  ('무료 3강','#A10D12','무료 클래스 강의를 3개 이상 완료한 회원에게 자동으로 부여됩니다.','automatic','free_lesson_3')
on conflict(name) do update set
  color=excluded.color,
  description=excluded.description,
  tag_kind='automatic',
  rule_key=excluded.rule_key;

create or replace function public.crm_sync_automatic_tags(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tag_id uuid;
  v_free_stage integer:=0;
begin
  if p_member_id is null or not exists(select 1 from public.profiles where id=p_member_id) then return; end if;

  select id into v_tag_id from public.crm_tags where rule_key='paid_customer';
  if exists(
    select 1 from public.orders
    where user_id=p_member_id and total_amount>0 and status in ('paid','partially_refunded')
  ) then
    insert into public.crm_member_tags(member_id,tag_id,assigned_by,assignment_source,rule_key,assigned_at)
    values(p_member_id,v_tag_id,null,'automatic','paid_customer',now())
    on conflict(member_id,tag_id) do update set assignment_source='automatic',rule_key='paid_customer',assigned_at=excluded.assigned_at;
  else
    delete from public.crm_member_tags where member_id=p_member_id and rule_key='paid_customer' and assignment_source='automatic';
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

  delete from public.crm_member_tags
  where member_id=p_member_id and assignment_source='automatic' and rule_key in ('free_lesson_1','free_lesson_2','free_lesson_3');

  if v_free_stage>0 then
    select id into v_tag_id from public.crm_tags where rule_key='free_lesson_'||v_free_stage::text;
    insert into public.crm_member_tags(member_id,tag_id,assigned_by,assignment_source,rule_key,assigned_at)
    values(p_member_id,v_tag_id,null,'automatic','free_lesson_'||v_free_stage::text,now())
    on conflict(member_id,tag_id) do update set assignment_source='automatic',rule_key=excluded.rule_key,assigned_at=excluded.assigned_at;
  end if;
end;
$$;

create or replace function public.crm_sync_tags_from_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.user_id is distinct from new.user_id then perform public.crm_sync_automatic_tags(old.user_id); end if;
  perform public.crm_sync_automatic_tags(new.user_id);
  return new;
end;
$$;

create or replace function public.crm_sync_tags_from_progress()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_member_id uuid;
begin
  if tg_op='DELETE' then
    select user_id into v_member_id from public.enrollments where id=old.enrollment_id;
  else
    select user_id into v_member_id from public.enrollments where id=new.enrollment_id;
  end if;
  perform public.crm_sync_automatic_tags(v_member_id);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.crm_sync_tags_from_enrollment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    perform public.crm_sync_automatic_tags(old.user_id);
    return old;
  end if;
  if tg_op='UPDATE' and old.user_id is distinct from new.user_id then perform public.crm_sync_automatic_tags(old.user_id); end if;
  perform public.crm_sync_automatic_tags(new.user_id);
  return new;
end;
$$;

drop trigger if exists crm_automatic_tags_order on public.orders;
create trigger crm_automatic_tags_order
after insert or update of status,user_id,total_amount on public.orders
for each row execute function public.crm_sync_tags_from_order();

drop trigger if exists crm_automatic_tags_progress on public.lesson_progress;
create trigger crm_automatic_tags_progress
after insert or update of progress_percent,completed_at or delete on public.lesson_progress
for each row execute function public.crm_sync_tags_from_progress();

drop trigger if exists crm_automatic_tags_enrollment on public.enrollments;
create trigger crm_automatic_tags_enrollment
after insert or update of status,user_id,course_id or delete on public.enrollments
for each row execute function public.crm_sync_tags_from_enrollment();

do $$ declare v_member_id uuid; begin
  for v_member_id in select id from public.profiles loop
    perform public.crm_sync_automatic_tags(v_member_id);
  end loop;
end $$;

commit;
