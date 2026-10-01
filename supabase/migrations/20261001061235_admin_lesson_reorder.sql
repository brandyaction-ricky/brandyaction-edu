begin;
set local lock_timeout = '5s';

-- Reuse the existing day-number slots, including gaps reserved by archived
-- lessons. Never recreate lessons or change their publication/progression data.
create function public.edu_admin_reorder_lessons(
  p_actor uuid, p_course uuid, p_week uuid, p_ids uuid[],
  p_expected_ids uuid[], p_expected_days integer[], p_expected_updated_at timestamptz[]
) returns integer
language plpgsql security invoker set search_path = '' set lock_timeout = '5s'
as $$
declare
  current_ids uuid[];
  current_days integer[];
  current_stamps timestamptz[];
  before_order jsonb;
  after_order jsonb;
  changed_count integer;
begin
  if not public.mission_operator_allowed(p_actor, 'products') then
    raise exception using errcode='42501', message='LESSON_ORDER_FORBIDDEN';
  end if;
  if p_course is null or p_week is null
    or coalesce(cardinality(p_ids),0) not between 2 and 1000
    or array_ndims(p_ids) <> 1 or array_lower(p_ids,1) <> 1
    or (select count(distinct id) from unnest(p_ids) supplied(id)) <> cardinality(p_ids)
    or cardinality(p_ids) is distinct from cardinality(p_expected_ids)
    or cardinality(p_ids) is distinct from cardinality(p_expected_days)
    or cardinality(p_ids) is distinct from cardinality(p_expected_updated_at) then
    raise exception using errcode='22023', message='LESSON_ORDER_INVALID';
  end if;

  -- Same parent-to-child lock order as curriculum archive/create operations.
  perform 1 from public.courses where id=p_course and archived_at is null for update;
  if not found then raise exception using errcode='P0002', message='LESSON_ORDER_NOT_FOUND'; end if;
  perform 1 from public.curriculum_weeks where id=p_week and course_id=p_course and archived_at is null for update;
  if not found then raise exception using errcode='P0002', message='LESSON_ORDER_NOT_FOUND'; end if;
  perform 1 from public.curriculum_lessons where week_id=p_week order by id for update;
  select array_agg(id order by day_number), array_agg(day_number order by day_number),
    array_agg(updated_at order by day_number),
    jsonb_agg(jsonb_build_object('id',id,'day_number',day_number,'display_order',display_order) order by day_number)
  into current_ids,current_days,current_stamps,before_order
  from public.curriculum_lessons where week_id=p_week and archived_at is null;

  if current_ids is distinct from p_expected_ids
    or current_days is distinct from p_expected_days
    or current_stamps is distinct from p_expected_updated_at
    or not (p_ids @> current_ids and current_ids @> p_ids) then
    raise exception using errcode='PT409', message='LESSON_ORDER_CHANGED';
  end if;
  if current_ids = p_ids then return 0; end if;

  set constraints public.curriculum_lessons_week_id_day_number_key deferred;
  update public.curriculum_lessons l
    set day_number=current_days[s.position::integer], display_order=current_days[s.position::integer], updated_at=clock_timestamp()
    from unnest(p_ids) with ordinality s(id,position)
    where l.id=s.id and l.week_id=p_week and l.archived_at is null
      and (l.day_number is distinct from current_days[s.position::integer] or l.display_order is distinct from current_days[s.position::integer]);
  get diagnostics changed_count = row_count;
  select jsonb_agg(jsonb_build_object('id',id,'day_number',day_number,'display_order',display_order) order by day_number)
    into after_order from public.curriculum_lessons where week_id=p_week and archived_at is null;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_actor,'curriculum.lessons_reordered','curriculum_weeks',p_week::text,before_order,after_order);
  return changed_count;
end;
$$;
revoke all on function public.edu_admin_reorder_lessons(uuid,uuid,uuid,uuid[],uuid[],integer[],timestamptz[]) from public,anon,authenticated;
grant execute on function public.edu_admin_reorder_lessons(uuid,uuid,uuid,uuid[],uuid[],integer[],timestamptz[]) to service_role;
commit;
