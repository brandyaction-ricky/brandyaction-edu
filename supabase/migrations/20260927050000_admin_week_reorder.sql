begin;

create or replace function public.edu_admin_reorder_weeks(p_actor uuid, p_course uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
  changed_count integer;
  before_order jsonb;
  after_order jsonb;
begin
  if not public.mission_operator_allowed(p_actor, 'products') then
    raise exception using errcode = '42501', message = '상품 관리 권한이 필요합니다.';
  end if;
  if p_course is null
    or coalesce(cardinality(p_ids), 0) not between 1 and 1000
    or (select count(distinct id) from unnest(p_ids) as supplied(id)) <> cardinality(p_ids) then
    raise exception using errcode = '22023', message = '상품과 주차 목록을 다시 확인해 주세요.';
  end if;

  perform 1 from public.courses where id = p_course for update;
  if not found then
    raise exception using errcode = 'P0002', message = '상품을 찾을 수 없습니다.';
  end if;

  perform 1 from public.curriculum_weeks where course_id = p_course order by id for update;
  select count(*) into expected_count from public.curriculum_weeks where course_id = p_course;
  if expected_count <> cardinality(p_ids)
    or exists (
      select 1 from public.curriculum_weeks w
      where w.course_id = p_course and not (w.id = any(p_ids))
    )
    or exists (
      select 1 from unnest(p_ids) as supplied(id)
      where not exists (select 1 from public.curriculum_weeks w where w.id = supplied.id and w.course_id = p_course)
    ) then
    raise exception using errcode = 'PT409', message = '주차 목록이 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week_number', week_number) order by week_number), '[]'::jsonb)
    into before_order from public.curriculum_weeks where course_id = p_course;

  set constraints public.curriculum_weeks_course_id_week_number_key deferred;
  update public.curriculum_weeks as w
  set week_number = supplied.position::integer, updated_at = now()
  from unnest(p_ids) with ordinality as supplied(id, position)
  where w.id = supplied.id and w.course_id = p_course;
  get diagnostics changed_count = row_count;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week_number', week_number) order by week_number), '[]'::jsonb)
    into after_order from public.curriculum_weeks where course_id = p_course;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor, 'curriculum.weeks_reordered', 'curriculum_weeks', p_course::text, before_order, after_order);
  return changed_count;
end;
$$;

revoke all on function public.edu_admin_reorder_weeks(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.edu_admin_reorder_weeks(uuid, uuid, uuid[]) to service_role;

commit;
