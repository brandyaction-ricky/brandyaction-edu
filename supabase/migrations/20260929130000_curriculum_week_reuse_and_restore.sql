begin;
set local lock_timeout = '5s';

-- Archived weeks keep their original number for recovery, while active weeks
-- can reuse that now-empty slot. Only active rows must be unique.
alter table public.curriculum_weeks
  drop constraint if exists curriculum_weeks_course_id_week_number_key;
create unique index curriculum_weeks_active_course_week_number_key
  on public.curriculum_weeks(course_id, week_number)
  where archived_at is null;

-- Retire the legacy whole-curriculum replacement RPC: it hard-deletes omitted
-- rows and relies on the deferrable global week-number constraint removed above.
do $$
begin
  if to_regprocedure('public.save_course_curriculum(uuid,uuid,jsonb)') is not null then
    execute 'revoke all on function public.save_course_curriculum(uuid,uuid,jsonb) from public, anon, authenticated, service_role';
  end if;
end;
$$;

-- The DEV database had an earlier generated-number RPC under a four-argument
-- signature. The five-argument routine below supersedes it and includes goals.
drop function if exists public.edu_create_curriculum_week(uuid,uuid,uuid,text);

-- New week numbers are selected atomically while holding the parent course lock.
-- A retry with the same request ID returns the original row without duplicating it.
create or replace function public.edu_create_curriculum_week(
  p_actor uuid,
  p_request uuid,
  p_course uuid,
  p_title text,
  p_goal text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  receipt public.edu_mutation_receipts%rowtype;
  request_fingerprint text;
  next_number integer;
  upper_number integer;
  created_id uuid;
  created_row jsonb;
begin
  if p_request is null or p_course is null or nullif(trim(coalesce(p_title, '')), '') is null
    or char_length(trim(p_title)) > 300 or char_length(coalesce(p_goal, '')) > 10000 then
    raise exception using errcode = '22023', message = 'WEEK_INVALID';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.id = p_actor and p.status = 'active'
      and (p.role = 'admin' or (p.role = 'staff' and exists(
        select 1 from public.site_settings s
        where s.key = 'edu_staff_permissions_' || p_actor::text
          and s.value->'products' = 'true'::jsonb
      )))
  ) then raise exception using errcode = '42501', message = 'CURRICULUM_FORBIDDEN'; end if;

  perform 1 from public.courses where id = p_course for update;
  if not found then raise exception using errcode = 'P0001', message = 'WEEK_COURSE_NOT_FOUND'; end if;

  request_fingerprint := md5('curriculum_weeks' || jsonb_build_object(
    'course_id', p_course,
    'title', trim(p_title),
    'goal', nullif(trim(coalesce(p_goal, '')), ''),
    'is_published', false
  )::text);
  insert into public.edu_mutation_receipts(actor_id, request_id, target_table, fingerprint)
    values (p_actor, p_request, 'curriculum_weeks', request_fingerprint)
    on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts
    where actor_id = p_actor and request_id = p_request for update;
  if receipt.fingerprint is distinct from request_fingerprint or receipt.target_table <> 'curriculum_weeks' then
    raise exception using errcode = 'P0001', message = '같은 요청 ID로 다른 내용을 저장할 수 없습니다.';
  end if;
  if receipt.result is not null then return receipt.result; end if;

  select greatest(1, coalesce(max(w.week_number) + 1, 1)) into upper_number
    from public.curriculum_weeks w
    where w.course_id = p_course and w.archived_at is null and w.week_number > 0;
  select min(candidate.week_number) into next_number
    from generate_series(1, upper_number) as candidate(week_number)
    where not exists (
      select 1 from public.curriculum_weeks w
      where w.course_id = p_course and w.archived_at is null
        and w.week_number = candidate.week_number
    );
  if next_number is null then next_number := upper_number + 1; end if;

  insert into public.curriculum_weeks(course_id, week_number, title, goal, is_published, display_order)
    values (p_course, next_number, trim(p_title), nullif(trim(coalesce(p_goal, '')), ''), false, next_number - 1)
    returning id into created_id;
  select to_jsonb(w) into created_row from public.curriculum_weeks w where w.id = created_id;
  update public.edu_mutation_receipts set result = created_row
    where actor_id = p_actor and request_id = p_request;
  return created_row;
end;
$$;

revoke all on function public.edu_create_curriculum_week(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.edu_create_curriculum_week(uuid,uuid,uuid,text,text) to service_role;

-- A restore is normally identity-preserving. If its old number has since been
-- reused, it fails visibly unless the operator explicitly confirmed a move.
drop function public.edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean);
create function public.edu_set_curriculum_archive(
  p_actor uuid,
  p_course uuid,
  p_kind text,
  p_id uuid,
  p_archived boolean,
  p_reassign_on_conflict boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  affected integer := 0;
  target_week uuid;
  target_week_number integer;
  original_week_number integer;
  target_archived_at timestamptz;
  upper_number integer;
begin
  if p_kind not in ('week','lesson') or p_archived is null or p_reassign_on_conflict is null then
    raise exception 'CURRICULUM_INVALID';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=p_actor and p.status='active'
      and (p.role='admin' or (p.role='staff' and exists(
        select 1 from public.site_settings s
        where s.key='edu_staff_permissions_'||p_actor::text
          and s.value->'products'='true'::jsonb
      )))
  ) then raise exception 'CURRICULUM_FORBIDDEN'; end if;

  perform 1 from public.courses where id=p_course for update;
  if not found then raise exception 'CURRICULUM_NOT_FOUND'; end if;

  if p_kind='week' then
    select week_number, archived_at into target_week_number, target_archived_at
      from public.curriculum_weeks where id=p_id and course_id=p_course for update;
    if not found then raise exception 'CURRICULUM_NOT_FOUND'; end if;
    original_week_number := target_week_number;

    if not p_archived and target_archived_at is not null and exists(
      select 1 from public.curriculum_weeks w
      where w.course_id=p_course and w.id<>p_id and w.archived_at is null
        and w.week_number=target_week_number
    ) then
      if not p_reassign_on_conflict then raise exception 'CURRICULUM_WEEK_NUMBER_IN_USE'; end if;
      select greatest(1, coalesce(max(w.week_number) + 1, 1)) into upper_number
        from public.curriculum_weeks w
        where w.course_id=p_course and w.archived_at is null and w.week_number > 0;
      select min(candidate.week_number) into target_week_number
        from generate_series(1, upper_number) as candidate(week_number)
        where not exists (
          select 1 from public.curriculum_weeks w
          where w.course_id=p_course and w.archived_at is null
            and w.id<>p_id and w.week_number=candidate.week_number
        );
      if target_week_number is null then target_week_number := upper_number + 1; end if;
      update public.curriculum_weeks set week_number=target_week_number
        where id=p_id and course_id=p_course;
    end if;

    update public.curriculum_weeks
      set archived_at=case when p_archived then now() else null end,
          is_published=case when p_archived then false else is_published end
      where id=p_id and course_id=p_course;
    get diagnostics affected=row_count;

    -- A restored week remains private. Restore its lessons separately so the
    -- operator can review each item before it appears in the active outline.
    if p_archived then
      update public.curriculum_lessons
        set archived_at=now(), is_published=false
        where week_id=p_id and archived_at is null;
      update public.curriculum_missions m
        set archived_at=now(), is_published=false, archived_by_curriculum=true
        from public.curriculum_lessons l
        where m.lesson_id=l.id and l.week_id=p_id and m.archived_at is null;
    end if;
  else
    select l.week_id into target_week
      from public.curriculum_lessons l
      join public.curriculum_weeks w on w.id=l.week_id
      where l.id=p_id and w.course_id=p_course
      for update of l,w;
    if target_week is null then raise exception 'CURRICULUM_NOT_FOUND'; end if;
    if not p_archived and exists(select 1 from public.curriculum_weeks where id=target_week and archived_at is not null) then
      raise exception 'CURRICULUM_PARENT_ARCHIVED';
    end if;

    update public.curriculum_lessons
      set archived_at=case when p_archived then now() else null end,
          is_published=false
      where id=p_id and week_id=target_week;
    get diagnostics affected=row_count;
    update public.curriculum_missions
      set archived_at=case when p_archived then now() else null end,
          is_published=false,
          archived_by_curriculum=p_archived
      where lesson_id=p_id and ((p_archived and archived_at is null) or (not p_archived and archived_by_curriculum));
  end if;

  if affected<>1 then raise exception 'CURRICULUM_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
    values(p_actor,
      case when p_archived then 'curriculum.item_archived' else 'curriculum.item_restored' end,
      case when p_kind='week' then 'curriculum_week' else 'curriculum_lesson' end,
      p_id::text,
      jsonb_build_object(
        'course_id',p_course,'kind',p_kind,'archived',p_archived,'affected',affected,
        'previous_week_number',original_week_number,'week_number',target_week_number,
        'week_number_changed',original_week_number is distinct from target_week_number
      ));
  return jsonb_build_object(
    'id',p_id,'kind',p_kind,'archived',p_archived,'affected',affected,
    'week_number',target_week_number,'previous_week_number',original_week_number
  );
end;
$$;

revoke all on function public.edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean,boolean) to service_role;

-- Reordering works on active weeks only. Archived weeks retain their historic
-- number and are ignored by the active-week unique index. Two-phase numbering
-- avoids transient collisions because the replacement index is non-deferrable.
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
  max_number integer;
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
  select coalesce(max(week_number), 0) into max_number
    from public.curriculum_weeks where course_id = p_course and archived_at is null;

  update public.curriculum_weeks as w
  set week_number = max_number + supplied.position::integer, updated_at = now()
  from unnest(p_ids) with ordinality as supplied(id, position)
  where w.id = supplied.id and w.course_id = p_course and w.archived_at is null;
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
