-- Business workflow depth. Backward compatible optional fields; no existing records rewritten.
begin;
create or replace function public.edu_campus_business_payload_valid(k text, p jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare fields jsonb := '{"brief":[{"key":"product","label":"상품·서비스","type":"text","required":true},{"key":"customer","label":"핵심 고객","type":"text","required":true},{"key":"problem","label":"고객이 해결하고 싶은 문제","type":"long","required":true},{"key":"price","label":"판매 가격","type":"number","required":true,"max":1000000000000},{"key":"currency","label":"통화","type":"select","choices":["KRW","USD"]},{"key":"voice","label":"브랜드 말투","type":"text"},{"key":"offer","label":"고객에게 약속하는 가치","type":"long"}],"routine":[{"key":"week","label":"시작일","type":"date","required":true},{"key":"day0","label":"월요일 할 일","type":"text"},{"key":"done0","label":"월요일 실행 완료","type":"check"},{"key":"day1","label":"화요일 할 일","type":"text"},{"key":"done1","label":"화요일 실행 완료","type":"check"},{"key":"day2","label":"수요일 할 일","type":"text"},{"key":"done2","label":"수요일 실행 완료","type":"check"},{"key":"day3","label":"목요일 할 일","type":"text"},{"key":"done3","label":"목요일 실행 완료","type":"check"},{"key":"day4","label":"금요일 할 일","type":"text"},{"key":"done4","label":"금요일 실행 완료","type":"check"},{"key":"day5","label":"토요일 할 일","type":"text"},{"key":"done5","label":"토요일 실행 완료","type":"check"},{"key":"day6","label":"일요일 할 일","type":"text"},{"key":"done6","label":"일요일 실행 완료","type":"check"}],"recipe":[{"key":"goal","label":"이번 실행 목표","type":"text","required":true},{"key":"prompt","label":"사용할 프롬프트","type":"long","required":true},{"key":"steps","label":"실행 순서 (한 줄에 하나)","type":"long","required":true},{"key":"result","label":"실행 후 배운 점","type":"long"}],"campaign":[{"key":"audience","label":"대상 고객","type":"text","required":true},{"key":"channel","label":"유입 채널","type":"text","required":true},{"key":"entryUrl","label":"유입 콘텐츠 URL","type":"url"},{"key":"landingUrl","label":"상세 페이지 URL","type":"url","required":true},{"key":"cta","label":"고객의 다음 행동","type":"text","required":true},{"key":"goal","label":"성공을 판단할 수치·기간","type":"text","required":true},{"key":"status","label":"진행 상태","type":"select","choices":["계획","실행 중","마무리"]},{"key":"applicationUrl","label":"신청 도착 URL","type":"url","legacyDefault":""},{"key":"followupAction","label":"신청 이후 안내·후속 행동","type":"long","legacyDefault":""},{"key":"followupUrl","label":"후속 안내 URL","type":"url","legacyDefault":""}],"checklist":[{"key":"url","label":"확인한 페이지 URL","type":"url","required":true},{"key":"offer","label":"상품·가격·조건을 직접 확인했어요","type":"check"},{"key":"links","label":"버튼과 이동 링크를 눌러 봤어요","type":"check"},{"key":"mobile","label":"휴대폰에서도 확인했어요","type":"check"},{"key":"claims","label":"근거 없는 성과 보장이 없어요","type":"check"},{"key":"privacy","label":"개인정보·동의·환불 안내를 확인했어요","type":"check"},{"key":"memo","label":"남은 문제·수정 내용","type":"long"}],"decision":[{"key":"question","label":"결정할 문제","type":"text","required":true},{"key":"options","label":"검토한 선택지","type":"long","required":true},{"key":"choice","label":"선택한 방향","type":"text","required":true},{"key":"reason","label":"선택한 근거","type":"long","required":true},{"key":"revisit","label":"다시 확인할 날짜","type":"date"},{"key":"result","label":"돌아보고 배운 점","type":"long"}],"practice":[{"key":"product","label":"새로 적용할 상품","type":"text","required":true},{"key":"principle","label":"적용할 원리","type":"long","required":true},{"key":"action","label":"도움 없이 해볼 실행","type":"long","required":true},{"key":"result","label":"실행 결과·막힌 점","type":"long"},{"key":"next","label":"다음에 바꿀 것","type":"long"},{"key":"support","label":"이번에 사용한 도움","type":"select","choices":["진행 중","혼자 완료","수업 자료 참고","AI 도움","멘토 도움"],"legacyDefault":"진행 중"},{"key":"blocked","label":"복습할 키워드","type":"text","legacyDefault":""},{"key":"reflection","label":"다음에는 혼자 할 수 있는 것","type":"long","legacyDefault":""}],"rehearsal":[{"key":"audience","label":"대화할 고객 유형","type":"text","required":true},{"key":"question","label":"고객에게 물어볼 질문","type":"long","required":true},{"key":"answer","label":"실제 들은 답변 또는 연습 답변 (구분해서 작성)","type":"long"},{"key":"insight","label":"다음에 확인할 가설","type":"long"}],"experiment":[{"key":"hypothesis","label":"검증할 가설","type":"long","required":true},{"key":"action","label":"바꿀 행동 하나","type":"long","required":true},{"key":"measure","label":"확인할 지표·판단 기준","type":"text","required":true},{"key":"start","label":"시작일","type":"date","required":true},{"key":"end","label":"마무리일","type":"date","required":true},{"key":"status","label":"실험 상태","type":"select","choices":["계획","진행 중","가설 지지","가설 기각","판단 보류"]},{"key":"result","label":"실제로 관찰한 결과","type":"long"},{"key":"learning","label":"다음 실험에 반영할 배움","type":"long"}],"metric":[{"key":"stage","label":"기록 구분","type":"select","choices":["시작점","체크인"]},{"key":"start","label":"집계 시작일","type":"date","required":true},{"key":"end","label":"집계 종료일","type":"date","required":true},{"key":"actions","label":"마케팅 실행 횟수","type":"number","required":true,"max":1000000},{"key":"leads","label":"문의 수","type":"number","required":true,"max":1000000000},{"key":"revenue","label":"매출","type":"number","required":true,"max":1000000000000},{"key":"currency","label":"통화","type":"select","choices":["KRW","USD"]},{"key":"minutes","label":"마케팅에 쓴 시간 (분)","type":"number","required":true,"max":527040},{"key":"evidenceUrl","label":"참고 자료 URL (검증 전)","type":"url"},{"key":"note","label":"집계 기준·외부 요인","type":"long"}],"review":[{"key":"url","label":"테스트할 사이트 URL","type":"url","required":true},{"key":"audience","label":"참여자 유형 (실명·연락처 제외)","type":"text","required":true},{"key":"task","label":"참여자가 해볼 과업","type":"long","required":true},{"key":"observation","label":"실제로 관찰한 어려움·발언 (개인정보 제외)","type":"long"},{"key":"change","label":"관찰 후 바꿀 점","type":"long"}],"case":[{"key":"summary","label":"공유하고 싶은 배움","type":"long","required":true},{"key":"evidence","label":"주장을 뒷받침할 기록·기간","type":"long","required":true},{"key":"limits","label":"해석할 때 주의할 점","type":"long","required":true},{"key":"permission","label":"이 내용을 사례 후보로 검토하고 싶어요","type":"check"}]}'::jsonb -> k; spec jsonb; val jsonb; txt text; key text; i integer;
begin
 if fields is null or jsonb_typeof(p) <> 'object' or pg_column_size(p)>30000 then return false; end if;
 for key in select jsonb_object_keys(p) loop
  if not exists(select 1 from jsonb_array_elements(fields) f where f->>'key'=key) then return false; end if;
 end loop;
 for spec in select * from jsonb_array_elements(fields) loop
  val:=coalesce(p->(spec->>'key'),spec->'legacyDefault'); txt:=val#>>'{}';
  if val is null then return false; end if;
  if spec->>'type'='check' then
   if jsonb_typeof(val)<>'boolean' then return false; end if;
  elsif spec->>'type'='number' then
   if jsonb_typeof(val)<>'number' then return false; end if;
   if txt::numeric<0 or txt::numeric>coalesce((spec->>'max')::numeric,1000000000000) or ((spec->>'key') not in ('price','revenue') and trunc(txt::numeric)<>txt::numeric) then return false; end if;
  else
   if jsonb_typeof(val)<>'string' or char_length(txt)>(case when spec->>'type'='long' then 4000 else 500 end) or (coalesce((spec->>'required')::boolean,false) and btrim(txt)='') then return false; end if;
   if spec->>'type'='select' and not (spec->'choices' ? txt) then return false; end if;
   if spec->>'type'='url' and txt<>'' and txt !~ '^https?://[^[:space:]@]+[.][^[:space:]]+' then return false; end if;
   if spec->>'type'='date' and txt<>'' then
    if txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char(txt::date,'YYYY-MM-DD')<>txt then return false; end if;
   end if;
  end if;
 end loop;
 if k in ('metric','experiment') and (p->>'start')::date>(p->>'end')::date then return false; end if;
 if k='metric' and (((p->>'end')::date-(p->>'start')::date)>365 or (p->>'minutes')::numeric>(((p->>'end')::date-(p->>'start')::date)+1)*1440) then return false; end if;
 if k='experiment' and p->>'status' in ('가설 지지','가설 기각') and btrim(p->>'result')='' then return false; end if;
 if k='routine' then for i in 0..6 loop if (p->>('done'||i))::boolean and btrim(p->>('day'||i))='' then return false; end if; end loop; end if;
 return true;
exception when others then return false;
end;
$$;

commit;

begin;
create table public.edu_campus_business_cases(
 id uuid primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 120),
 industry text check(industry in ('온라인 상품','전문 서비스','교육·콘텐츠')),
 summary text not null check(char_length(btrim(summary)) between 1 and 2000),
 limits text not null check(char_length(btrim(limits)) between 1 and 2000),
 evidence jsonb not null check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence) between 1 and 5),
 granted_purposes text[] not null check(cardinality(granted_purposes) between 1 and 3 and granted_purposes <@ array['cohort_learning','website','sales_material']::text[]),
 allowed_purposes text[] not null check(allowed_purposes <@ granted_purposes),
 status text not null default 'submitted' check(status in ('submitted','approved','changes_requested','rejected','withdrawn')),
 revision integer not null default 1 check(revision>0),
 reviewed_revision integer check(reviewed_revision is null or (reviewed_revision>0 and reviewed_revision<=revision)),
 reviewer_note text not null default '' check(char_length(reviewer_note)<=2000), reviewed_at timestamptz,
 consent_version text not null check(consent_version='moonshot-case-selection-v2'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index edu_campus_cases_owner on public.edu_campus_business_cases(user_id,enrollment_id,id);
create index edu_campus_cases_enrollment on public.edu_campus_business_cases(enrollment_id,created_at desc);
create table public.edu_campus_business_case_events(
 id uuid primary key,case_id uuid not null references public.edu_campus_business_cases(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete cascade,
 action text not null check(action in ('submit','withdraw','review')),command_hash text not null,
 purposes text[] not null,decision text,note text not null default '',created_at timestamptz not null default now()
);
create index edu_campus_case_events_case on public.edu_campus_business_case_events(case_id,created_at);
create index edu_campus_case_events_actor on public.edu_campus_business_case_events(actor_id);
alter table public.edu_campus_business_cases enable row level security;
alter table public.edu_campus_business_case_events enable row level security;
revoke all on public.edu_campus_business_cases,public.edu_campus_business_case_events from public,anon,authenticated,service_role;
grant select on public.edu_campus_business_cases,public.edu_campus_business_case_events to authenticated;
grant select,insert,update on public.edu_campus_business_cases to service_role;
grant select,insert on public.edu_campus_business_case_events to service_role;
-- Owners retain access to withdraw consent even after their enrollment expires.
create policy business_cases_owner_read on public.edu_campus_business_cases for select to authenticated using(user_id=(select auth.uid()));
create policy business_case_events_owner_read on public.edu_campus_business_case_events for select to authenticated using(exists(select 1 from public.edu_campus_business_cases c where c.id=case_id and c.user_id=(select auth.uid())));
grant select on public.edu_campus_business_records to service_role;
create function public.edu_campus_business_case_command(p_actor uuid,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.edu_campus_business_cases; event public.edu_campus_business_case_events; r public.edu_campus_business_records;
 cid uuid; rid uuid; eid uuid; actor_role text; action text; purpose text; purposes text[]; selection jsonb; selected_payload jsonb; snapshots jsonb:='[]'; field text; fields text[]; expected integer; decision text; note text; hash text;
begin
 if p_actor is null or jsonb_typeof(p_command) is distinct from 'object' or pg_column_size(p_command)>20000 then raise exception 'Invalid case command' using errcode='23514'; end if;
 select role into actor_role from public.profiles where id=p_actor and status='active';
 if actor_role is null then raise exception 'Unavailable actor' using errcode='42501'; end if;
 cid:=(p_command->>'id')::uuid; rid:=(p_command->>'requestId')::uuid; action:=p_command->>'action'; hash:=md5(p_command::text);
 if cid is null or rid is null or action is null or action not in ('submit','withdraw','review') then raise exception 'Invalid command' using errcode='23514'; end if;
 if action='review' and actor_role<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 -- Serializes every command for a case, including racing creation and consent/approval.
 perform pg_advisory_xact_lock(hashtextextended(cid::text, 27067));
 select * into c from public.edu_campus_business_cases where id=cid for update;
 select * into event from public.edu_campus_business_case_events where id=rid;
 if event.id is not null then
  if event.case_id=cid and event.actor_id=p_actor and event.command_hash=hash then return to_jsonb(c); end if;
  raise exception 'Request identity conflict' using errcode='23505';
 end if;
 if action='submit' then
  if c.id is not null then raise exception 'Case already exists' using errcode='23505'; end if;
  eid:=(p_command->>'enrollmentId')::uuid;
  if not public.edu_campus_business_review_available(eid,p_actor) then raise exception 'Enrollment unavailable' using errcode='42501'; end if;
  if p_command->>'consentVersion' is distinct from 'moonshot-case-selection-v2' or p_command->'consent' is distinct from 'true'::jsonb or jsonb_typeof(p_command->'purposes') is distinct from 'array' or jsonb_typeof(p_command->'selections') is distinct from 'array' then raise exception 'Invalid consent' using errcode='23514'; end if;
  select array_agg(value) into purposes from jsonb_array_elements_text(p_command->'purposes');
  if cardinality(purposes) not between 1 and 3 or not(purposes <@ array['cohort_learning','website','sales_material']::text[]) or cardinality(purposes)<>(select count(distinct v) from unnest(purposes) v) or jsonb_array_length(p_command->'selections') not between 1 and 5 then raise exception 'Invalid selection' using errcode='23514'; end if;
  for selection in select * from jsonb_array_elements(p_command->'selections') loop
   select * into r from public.edu_campus_business_records where id=(selection->>'recordId')::uuid and user_id=p_actor and enrollment_id=eid and archived_at is null;
   if r.id is null then raise exception 'Evidence unavailable' using errcode='42501'; end if;
   if r.revision is distinct from (selection->>'revision')::integer then raise exception 'Evidence changed' using errcode='40001'; end if;
   if exists(select 1 from jsonb_array_elements(snapshots) v where v->>'recordId'=r.id::text) then raise exception 'Repeated evidence' using errcode='23514'; end if;
   if jsonb_typeof(selection->'fields') is distinct from 'array' or jsonb_array_length(selection->'fields') not between 1 and 10 then raise exception 'Invalid fields' using errcode='23514'; end if;
   fields:='{}';selected_payload:='{}';
   for field in select * from jsonb_array_elements_text(selection->'fields') loop
    if not(r.payload ? field) or field=any(fields) or jsonb_typeof(r.payload->field) not in ('string','number') then raise exception 'Invalid field selection' using errcode='23514'; end if;
    fields:=array_append(fields,field);selected_payload:=selected_payload||jsonb_build_object(field,r.payload->field);
   end loop;
   snapshots:=snapshots||jsonb_build_array(jsonb_build_object('recordId',r.id,'revision',r.revision,'kind',r.kind,'title',r.title,'fields',fields,'payload',selected_payload));
  end loop;
  insert into public.edu_campus_business_cases(id,user_id,enrollment_id,title,industry,summary,limits,evidence,granted_purposes,allowed_purposes,consent_version)
  values(cid,p_actor,eid,btrim(p_command->>'title'),p_command->>'industry',btrim(p_command->>'summary'),btrim(p_command->>'limits'),snapshots,purposes,purposes,p_command->>'consentVersion') returning * into c;
 else
  if c.id is null then raise exception 'Case unavailable' using errcode='P0002'; end if;
  expected:=(p_command->>'expectedRevision')::integer;
  if expected is null or expected<>c.revision then raise exception 'Case changed' using errcode='40001'; end if;
  if action='withdraw' then
   if c.user_id<>p_actor then raise exception 'Owner required' using errcode='42501'; end if;
   purpose:=p_command->>'purpose';if purpose is null or not(purpose=any(c.allowed_purposes)) then raise exception 'Purpose unavailable' using errcode='23514'; end if;
   purposes:=array_remove(c.allowed_purposes,purpose);
   update public.edu_campus_business_cases set allowed_purposes=purposes,reviewed_revision=null,status=case when cardinality(purposes)=0 then 'withdrawn' else status end,revision=revision+1,updated_at=now() where id=cid returning * into c;
  else
   if actor_role<>'admin' or not exists(select 1 from public.enrollments e where e.id=c.enrollment_id and e.cohort_id=(p_command->>'cohortId')::uuid) then raise exception 'Administrator scope required' using errcode='42501'; end if;
   decision:=p_command->>'decision';note:=btrim(p_command->>'note');
   if c.status='withdrawn' or cardinality(c.allowed_purposes)=0 or decision is null or decision not in ('approved','changes_requested','rejected') or note is null or char_length(note) not between 1 and 2000 then raise exception 'Invalid review' using errcode='23514'; end if;
   update public.edu_campus_business_cases set status=decision,reviewed_revision=case when decision='approved' then revision+1 else null end,reviewer_note=note,reviewed_at=now(),revision=revision+1,updated_at=now() where id=cid returning * into c;
  end if;
 end if;
 insert into public.edu_campus_business_case_events(id,case_id,actor_id,action,command_hash,purposes,decision,note) values(rid,cid,p_actor,action,hash,c.allowed_purposes,decision,coalesce(note,''));
 return to_jsonb(c);
end;
$$;
revoke all on function public.edu_campus_business_case_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_campus_business_case_command(uuid,jsonb) to service_role;
comment on table public.edu_campus_business_cases is 'Owner-selected evidence snapshots and purpose-specific revocable consent. Approval is an editorial usage decision, not outcome verification. No external publication automation.';
comment on table public.edu_campus_business_case_events is 'Append-only consent and review evidence; service-only atomic command writes; no raw unselected business payload.';
commit;

-- Active learners may read only explicitly selected, currently consented/approved same-cohort examples.
begin;
create index edu_campus_cases_industry_approved on public.edu_campus_business_cases(industry,id) where status='approved';
create function public.edu_campus_business_learning_cases(p_actor uuid,p_enrollment uuid,p_industry text,p_cursor uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare cohort uuid; entries jsonb;
begin
 if p_industry is null or p_industry not in ('온라인 상품','전문 서비스','교육·콘텐츠') then raise exception 'Choose industry' using errcode='23514'; end if;
 if not public.edu_campus_business_review_available(p_enrollment,p_actor) then raise exception 'Enrollment unavailable' using errcode='42501'; end if;
 select e.cohort_id into cohort from public.enrollments e where e.id=p_enrollment and e.user_id=p_actor;
 select coalesce(jsonb_agg(q.item order by q.id),'[]'::jsonb) into entries from (
  select c.id,jsonb_build_object('id',c.id,'title',c.title,'industry',c.industry,'summary',c.summary,'limits',c.limits,'revision',c.revision,'reviewedAt',c.reviewed_at,
   'evidence',(select coalesce(jsonb_agg(jsonb_build_object('kind',v->'kind','title',v->'title','revision',v->'revision','payload',v->'payload')),'[]'::jsonb) from jsonb_array_elements(c.evidence) v)) as item
  from public.edu_campus_business_cases c join public.enrollments e on e.id=c.enrollment_id
  where e.cohort_id=cohort and c.industry=p_industry and c.status='approved' and c.reviewed_revision=c.revision and c.reviewed_at is not null
   and c.consent_version='moonshot-case-selection-v2' and 'cohort_learning'=any(c.allowed_purposes)
   and public.edu_campus_business_review_available(c.enrollment_id,c.user_id) and (p_cursor is null or c.id>p_cursor)
   -- Changed/archived originals cannot silently become a newly approved example. Resubmit the current selection.
   and not exists(select 1 from jsonb_array_elements(c.evidence) v where not exists(
    select 1 from public.edu_campus_business_records r where r.id=(v->>'recordId')::uuid and r.user_id=c.user_id and r.enrollment_id=c.enrollment_id and r.archived_at is null and r.revision=(v->>'revision')::integer))
  order by c.id limit 21
 ) q;
 return jsonb_build_object('items',case when jsonb_array_length(entries)>20 then entries-20 else entries end,'nextCursor',case when jsonb_array_length(entries)>20 then entries->19->>'id' else null end);
end;$$;
revoke all on function public.edu_campus_business_learning_cases(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.edu_campus_business_learning_cases(uuid,uuid,text,uuid) to service_role;
comment on function public.edu_campus_business_learning_cases(uuid,uuid,text,uuid) is 'Same-cohort active-access reader. Approval permits selected historical evidence use, not outcome verification. No names, owner IDs, unselected fields, external publication consent or reviewer notes returned. Every request rechecks revocation/version/source scope.';
commit;
