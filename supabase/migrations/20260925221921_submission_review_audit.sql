begin;

-- Preserve the DEV guard from f455548 / 20260922054307_mission_priority_integrity.
-- Only the review dependency is reconciled here; no unrelated RLS/migrations are replayed.
create or replace function public.mission_operator_allowed(p_actor uuid, p_scope text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id=p_actor and p.status='active'
    and (p.role='admin' or (p.role='staff' and exists (
      select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text
      and s.value->p_scope='true'::jsonb
    )))
  );
$$;

create function public.review_mission_submissions_with_checks(
  p_actor uuid, p_ids uuid[], p_decision text, p_feedback text, p_checks jsonb, p_mode text
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare s public.mission_submissions; n integer := 0;
begin
  if not public.mission_operator_allowed(p_actor, 'members') then
    raise exception using errcode='42501', message='회원 관리 권한이 필요합니다.';
  end if;
  if coalesce(cardinality(p_ids),0) not between 1 and 50
    or (select count(distinct id) from unnest(p_ids) id) <> cardinality(p_ids)
    or p_decision is null or p_decision not in ('approved','changes_requested','rejected')
    or length(coalesce(p_feedback,'')) > 2000
    or (p_decision <> 'approved' and length(btrim(coalesce(p_feedback,'')))=0)
    or p_mode is null or p_mode not in ('single','bulk','legacy') then
    raise exception using errcode='22023', message='검토 대상과 피드백을 확인해 주세요.';
  end if;
  if p_mode='single' then
    if cardinality(p_ids)<>1 or jsonb_typeof(p_checks) is distinct from 'object'
      or p_checks->'version' is distinct from '1'::jsonb
      or jsonb_typeof(p_checks->'answers_complete') is distinct from 'boolean'
      or jsonb_typeof(p_checks->'evidence_consistent') is distinct from 'boolean'
      or jsonb_typeof(p_checks->'criteria_met') is distinct from 'boolean'
      or (p_checks - array['version','answers_complete','evidence_consistent','criteria_met']) <> '{}'::jsonb then
      raise exception using errcode='22023', message='검토 확인 항목을 확인해 주세요.';
    end if;
  elsif p_checks is not null then
    raise exception using errcode='22023', message='개별 검토만 체크 결과를 저장할 수 있습니다.';
  end if;
  -- Deterministic lock order, then recheck the row AFTER a competing writer commits.
  for s in select * from public.mission_submissions where id=any(p_ids) order by id for update loop
    if s.status <> 'submitted' then
      raise exception using errcode='PT409', message='이미 검토된 제출이 있습니다. 새로고침해 주세요.';
    end if;
    update public.mission_submissions set status=p_decision, reviewed_at=now(), reviewed_by=p_actor,
      reviewer_feedback=nullif(btrim(p_feedback),'') where id=s.id;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
      values(p_actor,'mission_submission.'||p_decision,'mission_submission',s.id,
        jsonb_build_object('status',s.status),
        jsonb_build_object('status',p_decision,'feedback',p_feedback,'review_checks',p_checks,'review_mode',p_mode));
    n := n+1;
  end loop;
  if n <> cardinality(p_ids) then
    raise exception using errcode='P0002', message='일부 제출 내역이 없습니다.';
  end if;
  return n;
end;
$$;

-- Keep the old signature callable during rollout/rollback, using the SAME transaction rules.
create or replace function public.review_mission_submissions(p_actor uuid,p_ids uuid[],p_decision text,p_feedback text)
returns integer language sql security invoker set search_path = '' as $$
  select public.review_mission_submissions_with_checks(p_actor,p_ids,p_decision,p_feedback,null,
    case when cardinality(p_ids)>1 then 'bulk' else 'legacy' end);
$$;
revoke all on function public.mission_operator_allowed(uuid,text),
  public.review_mission_submissions(uuid,uuid[],text,text),
  public.review_mission_submissions_with_checks(uuid,uuid[],text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.mission_operator_allowed(uuid,text),
  public.review_mission_submissions(uuid,uuid[],text,text),
  public.review_mission_submissions_with_checks(uuid,uuid[],text,text,jsonb,text) to service_role;

-- Existing audit_logs RLS/index and historical records are intentionally unchanged.
commit;
