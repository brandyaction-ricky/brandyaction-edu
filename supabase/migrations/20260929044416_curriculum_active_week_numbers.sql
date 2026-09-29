begin;
set local lock_timeout = '5s';

-- Keep deleted rows and their IDs/history. Only active weeks reserve a number.
-- A deferred constraint also preserves atomic swaps in the reorder function.
alter table public.curriculum_weeks
  add column active_week_number integer generated always as
    (case when archived_at is null then week_number else null end) stored;
alter table public.curriculum_weeks
  drop constraint curriculum_weeks_course_id_week_number_key,
  add constraint curriculum_weeks_course_id_week_number_key
    unique(course_id,active_week_number) deferrable initially immediate;

create function public.edu_create_curriculum_week(p_actor uuid,p_course uuid,p_request uuid,p_title text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  receipt public.edu_mutation_receipts%rowtype;
  fingerprint text;
  allocated integer;
  created_row jsonb;
begin
  if not public.mission_operator_allowed(p_actor,'products') then raise exception 'CURRICULUM_FORBIDDEN'; end if;
  if p_request is null or p_title is null or length(btrim(p_title)) not between 1 and 300 then raise exception 'CURRICULUM_INVALID'; end if;
  perform 1 from public.courses where id=p_course and archived_at is null for update;
  if not found then raise exception 'CURRICULUM_NOT_FOUND'; end if;
  fingerprint := md5(jsonb_build_array(p_course,btrim(p_title))::text);
  insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint)
    values(p_actor,p_request,'curriculum_week_auto',fingerprint) on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.target_table<>'curriculum_week_auto' or receipt.fingerprint<>fingerprint then raise exception 'CURRICULUM_REQUEST_REUSED'; end if;
  if receipt.result is not null then return receipt.result; end if;
  -- At most active-count+1 candidates are needed, even if stored numbers are sparse.
  select min(n) into allocated from generate_series(1,(select count(*)::integer+1 from public.curriculum_weeks where course_id=p_course and archived_at is null)) n
    where not exists(select 1 from public.curriculum_weeks where course_id=p_course and archived_at is null and week_number=n);
  insert into public.curriculum_weeks(course_id,week_number,title,is_published)
    values(p_course,allocated,btrim(p_title),false) returning to_jsonb(curriculum_weeks.*) into created_row;
  update public.edu_mutation_receipts set result=created_row where actor_id=p_actor and request_id=p_request;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
    values(p_actor,'curriculum.week_created','curriculum_week',created_row->>'id',jsonb_build_object('course_id',p_course,'week_number',allocated));
  return created_row;
end;
$$;

-- Returns a proposal without changing anything. A second request must name the
-- exact number accepted by the operator; concurrent changes cause a new proposal.
create function public.edu_restore_curriculum_week(p_actor uuid,p_course uuid,p_id uuid,p_expected_week integer,p_move_to integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  target public.curriculum_weeks%rowtype;
  proposed integer;
  result jsonb;
begin
  if not public.mission_operator_allowed(p_actor,'products') then raise exception 'CURRICULUM_FORBIDDEN'; end if;
  if p_expected_week is null or p_expected_week<0 or (p_move_to is not null and p_move_to<1) then raise exception 'CURRICULUM_INVALID'; end if;
  perform 1 from public.courses where id=p_course and archived_at is null for update;
  if not found then raise exception 'CURRICULUM_NOT_FOUND'; end if;
  select * into target from public.curriculum_weeks where id=p_id and course_id=p_course for update;
  if not found then raise exception 'CURRICULUM_NOT_FOUND'; end if;
  if target.archived_at is null then
    if target.week_number=coalesce(p_move_to,p_expected_week) then
      return jsonb_build_object('id',p_id,'kind','week','archived',false,'weekNumber',target.week_number);
    end if;
    raise exception 'CURRICULUM_CHANGED';
  end if;
  if target.week_number<>p_expected_week then raise exception 'CURRICULUM_CHANGED'; end if;
  if exists(select 1 from public.curriculum_weeks where course_id=p_course and archived_at is null and week_number=target.week_number) then
    select min(n) into proposed from generate_series(1,(select count(*)::integer+1 from public.curriculum_weeks where course_id=p_course and archived_at is null)) n
      where not exists(select 1 from public.curriculum_weeks where course_id=p_course and archived_at is null and week_number=n);
    if p_move_to is null or exists(select 1 from public.curriculum_weeks where course_id=p_course and archived_at is null and week_number=p_move_to) then
      return jsonb_build_object('needsConfirmation',true,'weekNumber',target.week_number,'suggestedWeekNumber',proposed);
    end if;
    update public.curriculum_weeks set week_number=p_move_to where id=p_id;
  elsif p_move_to is not null then
    raise exception 'CURRICULUM_CHANGED';
  end if;
  -- The original archive implementation preserves lessons, submissions and IDs.
  result := public.edu_set_curriculum_archive(p_actor,p_course,'week',p_id,false);
  if p_move_to is not null then
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
      values(p_actor,'curriculum.week_restore_number_changed','curriculum_week',p_id::text,
        jsonb_build_object('week_number',p_expected_week),jsonb_build_object('week_number',p_move_to));
  end if;
  return result||jsonb_build_object('weekNumber',coalesce(p_move_to,p_expected_week));
end;
$$;
revoke all on function public.edu_create_curriculum_week(uuid,uuid,uuid,text),public.edu_restore_curriculum_week(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.edu_create_curriculum_week(uuid,uuid,uuid,text),public.edu_restore_curriculum_week(uuid,uuid,uuid,integer,integer) to service_role;

create or replace function public.edu_admin_reorder_weeks(p_actor uuid, p_course uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  onboarding_id uuid;
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

  perform 1 from public.curriculum_weeks where course_id = p_course and archived_at is null order by id for update;
  select count(*) into expected_count from public.curriculum_weeks where course_id = p_course and archived_at is null;
  if expected_count <> cardinality(p_ids)
    or exists (
      select 1 from public.curriculum_weeks w
      where w.course_id = p_course and w.archived_at is null and not (w.id = any(p_ids))
    )
    or exists (
      select 1 from unnest(p_ids) as supplied(id)
      where not exists (select 1 from public.curriculum_weeks w where w.id = supplied.id and w.course_id = p_course and w.archived_at is null)
    ) then
    raise exception using errcode = 'PT409', message = '주차 목록이 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요.';
  end if;

  select id into onboarding_id from public.curriculum_weeks
    where course_id = p_course and archived_at is null and week_number = 0;
  if onboarding_id is not null and p_ids[array_lower(p_ids, 1)] is distinct from onboarding_id then
    raise exception using errcode = '22023', message = '0주차 온보딩은 첫 번째 순서를 유지해야 합니다.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week_number', week_number) order by week_number), '[]'::jsonb)
    into before_order from public.curriculum_weeks where course_id = p_course and archived_at is null;

  set constraints public.curriculum_weeks_course_id_week_number_key deferred;
  update public.curriculum_weeks as w
  set week_number = supplied.position::integer - case when onboarding_id is null then 0 else 1 end, updated_at = now()
  from unnest(p_ids) with ordinality as supplied(id, position)
  where w.id = supplied.id and w.course_id = p_course and w.archived_at is null;
  get diagnostics changed_count = row_count;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'week_number', week_number) order by week_number), '[]'::jsonb)
    into after_order from public.curriculum_weeks where course_id = p_course and archived_at is null;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor, 'curriculum.weeks_reordered', 'curriculum_weeks', p_course::text, before_order, after_order);
  return changed_count;
end;
$$;

revoke all on function public.edu_admin_reorder_weeks(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.edu_admin_reorder_weeks(uuid, uuid, uuid[]) to service_role;


commit;
