begin;

alter table public.edu_conversion_reviews add column calibration_sample_kind text;

update public.edu_conversion_reviews r
set calibration_sample_kind=case when c.subject like '[DEV 검증]%' then 'test' else 'operational' end
from public.edu_conversion_cases c
where r.case_id=c.id and r.calibration is not null;

alter table public.edu_conversion_reviews
  add constraint edu_conversion_reviews_sample_kind_check check (
    (calibration is null and calibration_sample_kind is null)
    or (calibration is not null and calibration_sample_kind in ('operational','test'))
  );

create or replace function public.edu_conversion_mutate(
  p_actor uuid,p_request uuid,p_action text,p_payload jsonb,p_payload_hash text,
  p_result jsonb default null,p_evidence_versions jsonb default null,p_observed_version integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.profiles%rowtype;
  permissions jsonb;
  receipt public.edu_conversion_receipts%rowtype;
  inquiry public.edu_conversion_cases%rowtype;
  evidence public.edu_conversion_evidence%rowtype;
  judgment public.edu_conversion_runs%rowtype;
  review_record public.edu_conversion_reviews%rowtype;
  question public.edu_questions%rowtype;
  target_id uuid;
  target_course uuid;
  target_cohort uuid;
  v_question_id uuid;
  v_source_revision text;
  versions jsonb;
  candidate_snapshot jsonb;
  inquiry_snapshot jsonb;
  output jsonb;
begin
  if p_request is null or p_payload_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_payload) is distinct from 'object'
    or p_action not in ('save_case','save_evidence','analyze','review') then raise exception 'CONVERSION_INVALID'; end if;
  select * into actor from public.profiles where id=p_actor and status='active';
  if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
  if actor.role='staff' then
    select value into permissions from public.site_settings where key='edu_staff_permissions_'||p_actor::text;
    if (permissions->'members') is distinct from 'true'::jsonb or (p_action='save_evidence' and (permissions->'products') is distinct from 'true'::jsonb)
      then raise exception 'CONVERSION_FORBIDDEN'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(207260920,1);
  insert into public.edu_conversion_receipts(actor_id,request_id,action,payload_hash,payload)
    values(p_actor,p_request,p_action,p_payload_hash,p_payload) on conflict do nothing;
  select * into receipt from public.edu_conversion_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.action<>p_action or receipt.payload_hash<>p_payload_hash or receipt.payload<>p_payload then raise exception 'CONVERSION_REQUEST_REUSED'; end if;
  if receipt.result is not null then return receipt.result; end if;

  if p_action in ('save_case','save_evidence') then
    target_id := nullif(p_payload->>'id','')::uuid;
    target_course := (p_payload->>'course_id')::uuid;
    target_cohort := nullif(p_payload->>'cohort_id','')::uuid;
    perform 1 from public.courses where id=target_course for share;
    if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
    if target_cohort is not null then
      perform 1 from public.cohorts where id=target_cohort and course_id=target_course for share;
      if not found then raise exception 'CONVERSION_INVALID'; end if;
    end if;
  end if;

  if p_action='save_case' then
    v_question_id := nullif(p_payload->>'question_id','')::uuid;
    if v_question_id is not null then
      select * into question from public.edu_questions where id=v_question_id and not is_archived for share;
      if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
      if question.course_id is not null and question.course_id<>target_course then raise exception 'CONVERSION_INVALID'; end if;
      v_source_revision := md5(jsonb_build_array(question.title,question.content,question.course_id,question.user_id,question.updated_at,question.is_archived)::text);
    end if;
    if target_id is not null then
      select * into inquiry from public.edu_conversion_cases where id=target_id for update;
      if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
      if inquiry.input_version is distinct from (p_payload->>'expected_version')::integer then raise exception 'CONVERSION_STALE'; end if;
      if inquiry.question_id is distinct from v_question_id then raise exception 'CONVERSION_INVALID'; end if;
      update public.edu_conversion_cases set course_id=target_course,cohort_id=target_cohort,
        subject=case when v_question_id is not null then question.title else p_payload->>'subject' end,
        content=case when v_question_id is not null then question.content else p_payload->>'content' end,
        source_label=case when v_question_id is not null then '사이트 문의' else p_payload->>'source_label' end,
        received_at=case when v_question_id is not null then question.created_at else (p_payload->>'received_at')::timestamptz end,
        customer_id=question.user_id,source_revision=v_source_revision,input_version=input_version+1,actor_id=p_actor,updated_at=now()
        where id=target_id returning * into inquiry;
    else
      insert into public.edu_conversion_cases(source_type,question_id,course_id,cohort_id,subject,content,source_label,received_at,customer_id,source_revision,actor_id)
      values(case when v_question_id is null then 'manual' else 'native' end,v_question_id,target_course,target_cohort,
        case when v_question_id is not null then question.title else p_payload->>'subject' end,
        case when v_question_id is not null then question.content else p_payload->>'content' end,
        case when v_question_id is not null then '사이트 문의' else p_payload->>'source_label' end,
        case when v_question_id is not null then question.created_at else (p_payload->>'received_at')::timestamptz end,
        question.user_id,v_source_revision,p_actor) returning * into inquiry;
    end if;
    output := jsonb_build_object('case',to_jsonb(inquiry)-'source_revision');
  elsif p_action='save_evidence' then
    if target_id is not null then
      select * into evidence from public.edu_conversion_evidence where id=target_id for update;
      if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
      if evidence.version is distinct from (p_payload->>'expected_version')::integer then raise exception 'CONVERSION_STALE'; end if;
      update public.edu_conversion_evidence set course_id=target_course,cohort_id=target_cohort,title=p_payload->>'title',body=p_payload->>'body',source_url=p_payload->>'source_url',status=p_payload->>'status',version=version+1,actor_id=p_actor,updated_at=now()
        where id=target_id returning * into evidence;
    else
      insert into public.edu_conversion_evidence(course_id,cohort_id,title,body,source_url,status,actor_id)
        values(target_course,target_cohort,p_payload->>'title',p_payload->>'body',p_payload->>'source_url',p_payload->>'status',p_actor) returning * into evidence;
    end if;
    output := jsonb_build_object('evidence',to_jsonb(evidence));
  else
    select * into inquiry from public.edu_conversion_cases where id=(p_payload->>'case_id')::uuid for update;
    if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
    if inquiry.question_id is not null then
      select * into question from public.edu_questions where id=inquiry.question_id for share;
      if not found or question.is_archived or inquiry.source_revision is distinct from md5(jsonb_build_array(question.title,question.content,question.course_id,question.user_id,question.updated_at,question.is_archived)::text)
        then raise exception 'CONVERSION_STALE'; end if;
    end if;
    select coalesce(jsonb_object_agg(e.id::text,e.version),'{}'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object('id',e.id,'version',e.version,'course_id',e.course_id,'cohort_id',e.cohort_id,
        'title',e.title,'body',e.body,'source_url',e.source_url,'status',e.status) order by e.id),'[]'::jsonb)
      into versions,candidate_snapshot
      from public.edu_conversion_evidence e where e.course_id=inquiry.course_id and e.status='approved' and (e.cohort_id is null or e.cohort_id=inquiry.cohort_id);
    if p_action='analyze' then
      if inquiry.input_version is distinct from (p_payload->>'expected_version')::integer or inquiry.input_version is distinct from p_observed_version or versions is distinct from p_evidence_versions then raise exception 'CONVERSION_STALE'; end if;
      if jsonb_typeof(p_result) is distinct from 'object' or p_result->>'mode' not in ('mock','jev') or p_result->'requires_human_review' is distinct from 'true'::jsonb then raise exception 'CONVERSION_INVALID'; end if;
      inquiry_snapshot := jsonb_build_object('id',inquiry.id,'source_type',inquiry.source_type,'question_id',inquiry.question_id,
        'course_id',inquiry.course_id,'cohort_id',inquiry.cohort_id,'subject',inquiry.subject,'content',inquiry.content,
        'source_label',inquiry.source_label,'received_at',inquiry.received_at,'input_version',inquiry.input_version);
      insert into public.edu_conversion_runs(case_id,input_version,provider,result,evidence_versions,input_snapshot,evidence_snapshot,actor_id)
        values(inquiry.id,inquiry.input_version,p_result->>'mode',p_result,versions,inquiry_snapshot,candidate_snapshot,p_actor) returning * into judgment;
      output := jsonb_build_object('run',to_jsonb(judgment));
    else
      select * into judgment from public.edu_conversion_runs where id=(p_payload->>'run_id')::uuid and case_id=inquiry.id;
      if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
      if inquiry.input_version<>judgment.input_version or versions<>judgment.evidence_versions then raise exception 'CONVERSION_STALE'; end if;
      if p_payload->>'decision'='accept' and p_payload->>'reply_text' is distinct from judgment.result->>'proposed_reply' then raise exception 'CONVERSION_INVALID'; end if;
      if judgment.provider='jev' then
        perform 1 from public.edu_conversion_reviews where run_id=judgment.id and calibration is not null;
        if not found and (nullif(p_payload->'calibration','null'::jsonb) is null or p_payload->>'calibration_sample_kind' not in ('operational','test')) then raise exception 'CONVERSION_INVALID'; end if;
        if found and (nullif(p_payload->'calibration','null'::jsonb) is not null or nullif(p_payload->>'calibration_sample_kind','') is not null) then raise exception 'CONVERSION_INVALID'; end if;
      elsif nullif(p_payload->'calibration','null'::jsonb) is not null or nullif(p_payload->>'calibration_sample_kind','') is not null then
        raise exception 'CONVERSION_INVALID';
      end if;
      insert into public.edu_conversion_reviews(case_id,run_id,decision,reply_text,reason,calibration,calibration_sample_kind,actor_id)
        values(inquiry.id,judgment.id,p_payload->>'decision',p_payload->>'reply_text',p_payload->>'reason',nullif(p_payload->'calibration','null'::jsonb),nullif(p_payload->>'calibration_sample_kind',''),p_actor) returning * into review_record;
      output := jsonb_build_object('review',to_jsonb(review_record));
    end if;
  end if;
  update public.edu_conversion_receipts set result=output where actor_id=p_actor and request_id=p_request;
  return output;
end;
$$;

revoke all on function public.edu_conversion_mutate(uuid,uuid,text,jsonb,text,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function public.edu_conversion_mutate(uuid,uuid,text,jsonb,text,jsonb,jsonb,integer) to service_role;

commit;
