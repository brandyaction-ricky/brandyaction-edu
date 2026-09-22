begin;

-- Mission-only entry points: do not widen the shared create/archive permissions.
create function public.mission_operator_allowed(p_actor uuid, p_scope text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id=p_actor and p.status='active'
    and (p.role='admin' or (p.role='staff' and exists (
      select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text
      and s.value->p_scope='true'::jsonb
    )))
  );
$$;

-- RLS uses the same per-profile permission source as the server, not the old
-- company-wide operator_preferences switch. No caller can supply an actor ID.
create schema if not exists private;
create function private.mission_has_scope(p_scope text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.mission_operator_allowed((select auth.uid()),p_scope);
$$;
revoke all on function private.mission_has_scope(text) from public,anon,authenticated;
grant usage on schema private to authenticated,service_role;
grant execute on function private.mission_has_scope(text) to authenticated,service_role;
alter policy members_read_accessible_missions on public.curriculum_missions using (
  (select private.mission_has_scope('products')) or (select private.mission_has_scope('members')) or (
    is_published and exists (
      select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
      join public.enrollments e on e.course_id=w.course_id join public.profiles p on p.id=e.user_id
      where l.id=lesson_id and l.is_published and w.is_published and e.user_id=(select auth.uid())
      and p.status='active' and e.status='active' and e.access_starts_at<=now()
      and (e.access_ends_at is null or e.access_ends_at>now())
    )
  )
);
alter policy members_read_own_submissions on public.mission_submissions using (
  exists(select 1 from public.enrollments e where e.id=enrollment_id and e.user_id=(select auth.uid()))
  or (select private.mission_has_scope('members'))
);
-- App mutations already use server routes. Direct table writes must not bypass
-- version/association validation or elevate a learner's review status.
revoke insert,update,delete on public.curriculum_missions from authenticated;
revoke update(status,reviewed_at,reviewed_by,reviewer_feedback) on public.mission_submissions from authenticated;

create or replace function public.review_mission_submissions(p_actor uuid,p_ids uuid[],p_decision text,p_feedback text)
returns integer language plpgsql security invoker set search_path='' as $$
declare s public.mission_submissions; n integer:=0;
begin
  if not public.mission_operator_allowed(p_actor,'members') then raise exception '회원 관리 권한이 필요합니다.'; end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50 or p_decision is null or p_decision not in ('approved','changes_requested','rejected')
    or length(coalesce(p_feedback,''))>2000 or (p_decision<>'approved' and length(btrim(coalesce(p_feedback,'')))=0)
    then raise exception '검토 대상과 피드백을 확인해 주세요.'; end if;
  for s in select * from public.mission_submissions where id=any(p_ids) order by id for update loop
    if s.status<>'submitted' then raise exception '이미 검토된 제출이 있습니다. 새로고침해 주세요.'; end if;
    update public.mission_submissions set status=p_decision,reviewed_at=now(),reviewed_by=p_actor,reviewer_feedback=nullif(trim(p_feedback),'') where id=s.id;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
      values(p_actor,'mission_submission.'||p_decision,'mission_submission',s.id,jsonb_build_object('status',s.status),jsonb_build_object('status',p_decision,'feedback',p_feedback));
    n:=n+1;
  end loop;
  if n<>cardinality(p_ids) then raise exception '일부 제출 내역이 없습니다.'; end if;
  return n;
end; $$;

create function public.save_mission_definition(p_actor uuid,p_request uuid,p_id uuid,p_expected timestamptz,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare receipt public.edu_mutation_receipts; saved_mission public.curriculum_missions; fingerprint text;
begin
  if not public.mission_operator_allowed(p_actor,'products') then raise exception '상품 관리 권한이 필요합니다.'; end if;
  if jsonb_typeof(p_values) is distinct from 'object'
    or (p_values-array['lesson_id','title','instructions','submission_type','is_required','is_published','form_schema','archived_at'])<>'{}'::jsonb
    or length(btrim(coalesce(p_values->>'title',''))) not between 1 and 200
    or length(coalesce(p_values->>'instructions',''))>20000
    or jsonb_typeof(p_values->'form_schema') is distinct from 'object'
    or p_values->>'submission_type' is null or p_values->>'submission_type' not in ('text','link','mixed','quiz')
    or jsonb_typeof(p_values->'is_required') is distinct from 'boolean'
    or jsonb_typeof(p_values->'is_published') is distinct from 'boolean'
  then raise exception '미션 입력값을 확인해 주세요.'; end if;
  perform 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    join public.courses c on c.id=w.course_id where l.id=(p_values->>'lesson_id')::uuid
    and c.archived_at is null and c.status<>'archived';
  if not found then raise exception '연결할 학습을 확인해 주세요.'; end if;
  if p_values->>'submission_type'='quiz' and (p_values->>'is_published')::boolean
    and not exists(select 1 from public.mission_quizzes where mission_id=p_id)
  then raise exception '퀴즈 문항을 먼저 등록해 주세요.'; end if;
  if p_id is not null then
    select * into saved_mission from public.curriculum_missions where id=p_id for update;
    if not found or p_expected is null or saved_mission.updated_at is distinct from p_expected
      or saved_mission.lesson_id is distinct from (p_values->>'lesson_id')::uuid
    then raise exception '다른 작업에서 미션을 변경했습니다. 편집 내용을 보관한 뒤 다시 열어 주세요.'; end if;
    update public.curriculum_missions set title=btrim(p_values->>'title'),instructions=p_values->>'instructions',
      submission_type=p_values->>'submission_type',is_required=(p_values->>'is_required')::boolean,
      is_published=(p_values->>'is_published')::boolean,form_schema=p_values->'form_schema',archived_at=null,
      updated_at=clock_timestamp() where id=p_id returning * into saved_mission;
    return to_jsonb(saved_mission);
  end if;
  if p_request is null then raise exception '등록 요청 ID가 필요합니다.'; end if;
  fingerprint:=md5('mission-definition'||p_values::text);
  insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint)
    values(p_actor,p_request,'curriculum_missions',fingerprint) on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.target_table<>'curriculum_missions' or receipt.fingerprint<>fingerprint then raise exception '같은 요청 ID로 다른 내용을 저장할 수 없습니다.'; end if;
  if receipt.result is not null then return receipt.result; end if;
  insert into public.curriculum_missions(lesson_id,title,instructions,submission_type,is_required,is_published,form_schema)
    values((p_values->>'lesson_id')::uuid,btrim(p_values->>'title'),p_values->>'instructions',p_values->>'submission_type',
      (p_values->>'is_required')::boolean,(p_values->>'is_published')::boolean,p_values->'form_schema') returning * into saved_mission;
  update public.edu_mutation_receipts set result=to_jsonb(saved_mission) where actor_id=p_actor and request_id=p_request;
  return to_jsonb(saved_mission);
end; $$;

create function public.archive_mission_definitions(p_actor uuid,p_ids uuid[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare affected integer;
begin
  if not public.mission_operator_allowed(p_actor,'products') then raise exception '상품 관리 권한이 필요합니다.'; end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50 or array_position(p_ids,null) is not null
    or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids)
  then raise exception '서로 다른 미션을 최대 50개까지 선택해 주세요.'; end if;
  perform 1 from public.curriculum_missions where id=any(p_ids) order by id for update;
  get diagnostics affected=row_count;
  if affected<>cardinality(p_ids) then raise exception '미션 목록이 변경되었습니다. 다시 조회해 주세요.'; end if;
  update public.curriculum_missions set archived_at=clock_timestamp(),is_published=false,updated_at=clock_timestamp() where id=any(p_ids);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
    values(p_actor,'edu.archive','curriculum_missions',null,jsonb_build_object('ids',p_ids,'count',affected));
  return affected;
end; $$;

alter table public.edu_mission_drafts add column revision uuid not null default gen_random_uuid();
create function public.save_mission_draft(p_user uuid,p_enrollment uuid,p_mission uuid,p_expected uuid,p_version timestamptz,p_content text,p_url text,p_response jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare course uuid; mission public.curriculum_missions; current_draft public.edu_mission_drafts; new_revision uuid:=gen_random_uuid();
begin
  -- Same lock as submit_learning_mission: a delayed draft cannot resurrect after submission.
  select e.course_id into course from public.enrollments e join public.profiles p on p.id=e.user_id
    where e.id=p_enrollment and e.user_id=p_user and e.status='active' and p.status='active'
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()) for update of e;
  if not found then raise exception '활성 수강권이 필요합니다.'; end if;
  select m.* into mission from public.curriculum_missions m join public.curriculum_lessons l on l.id=m.lesson_id
    join public.curriculum_weeks w on w.id=l.week_id
    where m.id=p_mission and m.is_published and l.is_published and w.is_published and w.course_id=course for share of m;
  if not found then raise exception '현재 수강할 수 없는 미션입니다.'; end if;
  if mission.updated_at is distinct from p_version then raise exception '미션이 변경되었습니다. 작성 내용을 보관한 뒤 다시 열어 주세요.'; end if;
  if exists(select 1 from public.mission_submissions where enrollment_id=p_enrollment and mission_id=p_mission and status in ('submitted','approved'))
    then raise exception '이미 제출했거나 승인된 미션입니다.'; end if;
  if jsonb_typeof(p_response) is distinct from 'object' or length(coalesce(p_content,''))>20000 or length(coalesce(p_url,''))>2000
    then raise exception '임시저장 입력값을 확인해 주세요.'; end if;
  select * into current_draft from public.edu_mission_drafts where enrollment_id=p_enrollment and mission_id=p_mission;
  if current_draft.revision is distinct from p_expected then raise exception '다른 화면에서 초안을 변경했습니다. 작성 내용을 복사한 뒤 다시 열어 주세요.'; end if;
  insert into public.edu_mission_drafts(user_id,enrollment_id,mission_id,content,url,response,revision,updated_at)
    values(p_user,p_enrollment,p_mission,coalesce(p_content,''),coalesce(p_url,''),p_response,new_revision,clock_timestamp())
    on conflict(enrollment_id,mission_id) do update set content=excluded.content,url=excluded.url,response=excluded.response,
      revision=excluded.revision,updated_at=excluded.updated_at;
  return jsonb_build_object('draftRevision',new_revision);
end; $$;

create function public.clear_submitted_mission_draft()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.enrollments where id=new.enrollment_id for update;
  delete from public.edu_mission_drafts where enrollment_id=new.enrollment_id and mission_id=new.mission_id;
  return new;
end; $$;
create trigger clear_submitted_mission_draft after insert on public.mission_submissions
  for each row execute function public.clear_submitted_mission_draft();

create function public.mission_review_queue(p_actor uuid,p_status text,p_query text,p_sort text,p_page integer,p_submission uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.mission_operator_allowed(p_actor,'members') then raise exception '회원 관리 권한이 필요합니다.'; end if;
  if p_status is null or p_status not in ('','submitted','approved','changes_requested','rejected')
    or p_sort is null or p_sort not in ('old','new') or p_page is null or p_page<1 or p_page>100000
    or p_query is null or length(p_query)>200 then raise exception '조회 조건을 확인해 주세요.'; end if;
  with matching as (
    select s.*,jsonb_build_object('id',p.id,'full_name',p.full_name,'email',p.email) member,
      jsonb_build_object('id',m.id,'title',m.title) mission,jsonb_build_object('id',c.id,'title',c.title) course
    from public.mission_submissions s join public.enrollments e on e.id=s.enrollment_id
    join public.profiles p on p.id=e.user_id join public.curriculum_missions m on m.id=s.mission_id
    join public.courses c on c.id=e.course_id
    where (p_submission is null or s.id=p_submission)
      and (p_query='' or strpos(lower(concat_ws(' ',p.full_name,p.email,m.title,c.title,s.response#>>'{mission_snapshot,title}')),lower(p_query))>0)
  ), filtered as (select * from matching where p_status='' or status=p_status),
  stats as (select count(*) total from filtered),
  paging as (select least(p_page,greatest(1,ceil(total/50.0)::integer)) page,total from stats),
  page_rows as (select * from filtered order by
    case when p_sort='old' then submitted_at end asc,case when p_sort='new' then submitted_at end desc,id
    limit 50 offset (select (page-1)*50 from paging))
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(r)) from page_rows r),'[]'::jsonb),
    'pagination',(select jsonb_build_object('page',page,'pageSize',50,'total',total) from paging),
    'counts',(select jsonb_build_object('all',count(*),'submitted',count(*) filter(where status='submitted'),
      'approved',count(*) filter(where status='approved'),'changes_requested',count(*) filter(where status='changes_requested'),
      'rejected',count(*) filter(where status='rejected')) from matching)) into result;
  return result;
end; $$;

revoke all on function public.mission_operator_allowed(uuid,text),public.save_mission_definition(uuid,uuid,uuid,timestamptz,jsonb),
  public.archive_mission_definitions(uuid,uuid[]),public.save_mission_draft(uuid,uuid,uuid,uuid,timestamptz,text,text,jsonb),
  public.clear_submitted_mission_draft(),public.mission_review_queue(uuid,text,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.mission_operator_allowed(uuid,text),public.save_mission_definition(uuid,uuid,uuid,timestamptz,jsonb),
  public.archive_mission_definitions(uuid,uuid[]),public.save_mission_draft(uuid,uuid,uuid,uuid,timestamptz,text,text,jsonb),
  public.clear_submitted_mission_draft(),public.mission_review_queue(uuid,text,text,text,integer,uuid) to service_role;

commit;
