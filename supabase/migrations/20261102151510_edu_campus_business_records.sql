-- Local candidate: private execution records, no automated verification or publication.
begin;
create function public.edu_campus_business_payload_valid(k text, p jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare fields jsonb := '{"brief":[{"key":"product","label":"상품·서비스","type":"text","required":true},{"key":"customer","label":"핵심 고객","type":"text","required":true},{"key":"problem","label":"고객이 해결하고 싶은 문제","type":"long","required":true},{"key":"price","label":"판매 가격","type":"number","required":true,"max":1000000000000},{"key":"currency","label":"통화","type":"select","choices":["KRW","USD"]},{"key":"voice","label":"브랜드 말투","type":"text"},{"key":"offer","label":"고객에게 약속하는 가치","type":"long"}],"routine":[{"key":"week","label":"시작일","type":"date","required":true},{"key":"day0","label":"월요일 할 일","type":"text"},{"key":"done0","label":"월요일 실행 완료","type":"check"},{"key":"day1","label":"화요일 할 일","type":"text"},{"key":"done1","label":"화요일 실행 완료","type":"check"},{"key":"day2","label":"수요일 할 일","type":"text"},{"key":"done2","label":"수요일 실행 완료","type":"check"},{"key":"day3","label":"목요일 할 일","type":"text"},{"key":"done3","label":"목요일 실행 완료","type":"check"},{"key":"day4","label":"금요일 할 일","type":"text"},{"key":"done4","label":"금요일 실행 완료","type":"check"},{"key":"day5","label":"토요일 할 일","type":"text"},{"key":"done5","label":"토요일 실행 완료","type":"check"},{"key":"day6","label":"일요일 할 일","type":"text"},{"key":"done6","label":"일요일 실행 완료","type":"check"}],"recipe":[{"key":"goal","label":"이번 실행 목표","type":"text","required":true},{"key":"prompt","label":"사용할 프롬프트","type":"long","required":true},{"key":"steps","label":"실행 순서 (한 줄에 하나)","type":"long","required":true},{"key":"result","label":"실행 후 배운 점","type":"long"}],"campaign":[{"key":"audience","label":"대상 고객","type":"text","required":true},{"key":"channel","label":"유입 채널","type":"text","required":true},{"key":"entryUrl","label":"유입 콘텐츠 URL","type":"url"},{"key":"landingUrl","label":"상세 페이지 URL","type":"url","required":true},{"key":"cta","label":"고객의 다음 행동","type":"text","required":true},{"key":"goal","label":"성공을 판단할 수치·기간","type":"text","required":true},{"key":"status","label":"진행 상태","type":"select","choices":["계획","실행 중","마무리"]}],"checklist":[{"key":"url","label":"확인한 페이지 URL","type":"url","required":true},{"key":"offer","label":"상품·가격·조건을 직접 확인했어요","type":"check"},{"key":"links","label":"버튼과 이동 링크를 눌러 봤어요","type":"check"},{"key":"mobile","label":"휴대폰에서도 확인했어요","type":"check"},{"key":"claims","label":"근거 없는 성과 보장이 없어요","type":"check"},{"key":"privacy","label":"개인정보·동의·환불 안내를 확인했어요","type":"check"},{"key":"memo","label":"남은 문제·수정 내용","type":"long"}],"decision":[{"key":"question","label":"결정할 문제","type":"text","required":true},{"key":"options","label":"검토한 선택지","type":"long","required":true},{"key":"choice","label":"선택한 방향","type":"text","required":true},{"key":"reason","label":"선택한 근거","type":"long","required":true},{"key":"revisit","label":"다시 확인할 날짜","type":"date"},{"key":"result","label":"돌아보고 배운 점","type":"long"}],"practice":[{"key":"product","label":"새로 적용할 상품","type":"text","required":true},{"key":"principle","label":"적용할 원리","type":"long","required":true},{"key":"action","label":"도움 없이 해볼 실행","type":"long","required":true},{"key":"result","label":"실행 결과·막힌 점","type":"long"},{"key":"next","label":"다음에 바꿀 것","type":"long"}],"rehearsal":[{"key":"audience","label":"대화할 고객 유형","type":"text","required":true},{"key":"question","label":"고객에게 물어볼 질문","type":"long","required":true},{"key":"answer","label":"실제 들은 답변 또는 연습 답변 (구분해서 작성)","type":"long"},{"key":"insight","label":"다음에 확인할 가설","type":"long"}],"experiment":[{"key":"hypothesis","label":"검증할 가설","type":"long","required":true},{"key":"action","label":"바꿀 행동 하나","type":"long","required":true},{"key":"measure","label":"확인할 지표·판단 기준","type":"text","required":true},{"key":"start","label":"시작일","type":"date","required":true},{"key":"end","label":"마무리일","type":"date","required":true},{"key":"status","label":"실험 상태","type":"select","choices":["계획","진행 중","가설 지지","가설 기각","판단 보류"]},{"key":"result","label":"실제로 관찰한 결과","type":"long"},{"key":"learning","label":"다음 실험에 반영할 배움","type":"long"}],"metric":[{"key":"stage","label":"기록 구분","type":"select","choices":["시작점","체크인"]},{"key":"start","label":"집계 시작일","type":"date","required":true},{"key":"end","label":"집계 종료일","type":"date","required":true},{"key":"actions","label":"마케팅 실행 횟수","type":"number","required":true,"max":1000000},{"key":"leads","label":"문의 수","type":"number","required":true,"max":1000000000},{"key":"revenue","label":"매출","type":"number","required":true,"max":1000000000000},{"key":"currency","label":"통화","type":"select","choices":["KRW","USD"]},{"key":"minutes","label":"마케팅에 쓴 시간 (분)","type":"number","required":true,"max":527040},{"key":"evidenceUrl","label":"참고 자료 URL (검증 전)","type":"url"},{"key":"note","label":"집계 기준·외부 요인","type":"long"}],"review":[{"key":"url","label":"테스트할 사이트 URL","type":"url","required":true},{"key":"audience","label":"참여자 유형 (실명·연락처 제외)","type":"text","required":true},{"key":"task","label":"참여자가 해볼 과업","type":"long","required":true},{"key":"observation","label":"실제로 관찰한 어려움·발언 (개인정보 제외)","type":"long"},{"key":"change","label":"관찰 후 바꿀 점","type":"long"}],"case":[{"key":"summary","label":"공유하고 싶은 배움","type":"long","required":true},{"key":"evidence","label":"주장을 뒷받침할 기록·기간","type":"long","required":true},{"key":"limits","label":"해석할 때 주의할 점","type":"long","required":true},{"key":"permission","label":"이 내용을 사례 후보로 검토하고 싶어요","type":"check"}]}'::jsonb -> k; spec jsonb; val jsonb; txt text; key text; i integer;
begin
 if fields is null or jsonb_typeof(p) <> 'object' or pg_column_size(p)>30000 then return false; end if;
 for key in select jsonb_object_keys(p) loop
  if not exists(select 1 from jsonb_array_elements(fields) f where f->>'key'=key) then return false; end if;
 end loop;
 for spec in select * from jsonb_array_elements(fields) loop
  val:=p->(spec->>'key'); txt:=p->>(spec->>'key');
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
revoke all on function public.edu_campus_business_payload_valid(text,jsonb) from public,anon;
grant execute on function public.edu_campus_business_payload_valid(text,jsonb) to authenticated;
create table public.edu_campus_business_records(
 id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 kind text not null,
 title text not null check(char_length(btrim(title)) between 1 and 120),
 payload jsonb not null check(public.edu_campus_business_payload_valid(kind,payload)),
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 last_command_id uuid not null,
 creation_fingerprint text not null check(creation_fingerprint ~ '^[0-9a-f]{64}$')
);
create index edu_campus_business_owner_scope on public.edu_campus_business_records(user_id,enrollment_id,id) where archived_at is null;
create index edu_campus_business_enrollment on public.edu_campus_business_records(enrollment_id);
create function public.edu_campus_business_has_scope(eid uuid,uid uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select uid=(select auth.uid()) and exists(select 1 from public.enrollments e
 join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.id=eid and e.user_id=uid and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()));
$$;
revoke all on function public.edu_campus_business_has_scope(uuid,uuid) from public,anon;
grant execute on function public.edu_campus_business_has_scope(uuid,uuid) to authenticated;
alter table public.edu_campus_business_records enable row level security;
revoke all on public.edu_campus_business_records from public,anon,authenticated;
grant select,insert,update on public.edu_campus_business_records to authenticated;
create policy business_select on public.edu_campus_business_records for select to authenticated using(user_id=(select auth.uid()) and public.edu_campus_business_has_scope(enrollment_id,user_id));
create policy business_insert on public.edu_campus_business_records for insert to authenticated with check(user_id=(select auth.uid()) and public.edu_campus_business_has_scope(enrollment_id,user_id));
create policy business_update on public.edu_campus_business_records for update to authenticated using(user_id=(select auth.uid()) and public.edu_campus_business_has_scope(enrollment_id,user_id)) with check(user_id=(select auth.uid()) and public.edu_campus_business_has_scope(enrollment_id,user_id));
create function public.edu_campus_business_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.revision<>1 or new.archived_at is not null then raise exception 'Invalid initial business record' using errcode='23514'; end if;
  new.created_at:=now(); new.updated_at:=now();
 else
  if old.archived_at is not null or row(new.id,new.user_id,new.enrollment_id,new.kind,new.created_at,new.creation_fingerprint) is distinct from row(old.id,old.user_id,old.enrollment_id,old.kind,old.created_at,old.creation_fingerprint) then raise exception 'Business identity is immutable' using errcode='23514'; end if;
  if new.revision<>old.revision+1 or new.last_command_id=old.last_command_id then raise exception 'Invalid business revision' using errcode='23514'; end if;
  if new.archived_at is not null then
   if row(new.title,new.payload) is distinct from row(old.title,old.payload) then raise exception 'Archive must preserve record' using errcode='23514'; end if;
   new.archived_at:=now();
  end if;
  new.updated_at:=now();
 end if;
 return new;
end;
$$;
revoke all on function public.edu_campus_business_guard() from public,anon,authenticated;
create trigger edu_campus_business_guard before insert or update on public.edu_campus_business_records for each row execute function public.edu_campus_business_guard();
comment on table public.edu_campus_business_records is 'Owner-private self-reported execution and outcome records. No outcome verification, causal attribution, automatic AI, external publication, or educational completion claims.';
commit;

-- Explicit opt-in external review: only title, artifact URL and question leave the private workspace.
begin;
create table public.edu_campus_business_review_links(
 id uuid primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 title text not null check(char_length(btrim(title)) between 1 and 120),
 artifact_url text not null check(char_length(artifact_url)<=500 and artifact_url ~ '^https?://[^[:space:]@]+[.][^[:space:]]+'),
 question text not null check(char_length(btrim(question)) between 1 and 500),
 public_consent boolean not null check(public_consent),
 created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz,
 response_count integer not null default 0 check(response_count between 0 and 50),
 last_response_at timestamptz, revision integer not null default 1 check(revision>0)
);
create index edu_campus_review_owner on public.edu_campus_business_review_links(user_id,enrollment_id,created_at desc);
create index edu_campus_review_enrollment on public.edu_campus_business_review_links(enrollment_id);
create table public.edu_campus_business_review_replies(
 id uuid primary key, link_id uuid not null references public.edu_campus_business_review_links(id) on delete cascade,
 clarity integer not null check(clarity between 1 and 5),
 answer text not null check(char_length(btrim(answer)) between 1 and 2000), created_at timestamptz not null default now()
);
create index edu_campus_review_replies_link on public.edu_campus_business_review_replies(link_id,created_at desc);
alter table public.edu_campus_business_review_links enable row level security;
alter table public.edu_campus_business_review_replies enable row level security;
revoke all on public.edu_campus_business_review_links,public.edu_campus_business_review_replies from public,anon,authenticated,service_role;
grant select,insert on public.edu_campus_business_review_links to authenticated;
grant update(revoked_at,revision) on public.edu_campus_business_review_links to authenticated;
grant select on public.edu_campus_business_review_replies to authenticated;
grant select,update on public.edu_campus_business_review_links to service_role;
grant select,insert on public.edu_campus_business_review_replies to service_role;
create policy business_review_select on public.edu_campus_business_review_links for select to authenticated using(user_id=(select auth.uid()) and public.edu_campus_business_has_scope(enrollment_id,user_id));
create policy business_review_insert on public.edu_campus_business_review_links for insert to authenticated with check(user_id=(select auth.uid()) and public.edu_campus_business_has_scope(enrollment_id,user_id));
create policy business_review_update on public.edu_campus_business_review_links for update to authenticated using(user_id=(select auth.uid()) and public.edu_campus_business_has_scope(enrollment_id,user_id)) with check(user_id=(select auth.uid()) and public.edu_campus_business_has_scope(enrollment_id,user_id));
create policy business_reply_select on public.edu_campus_business_review_replies for select to authenticated using(exists(select 1 from public.edu_campus_business_review_links l where l.id=link_id and l.user_id=(select auth.uid()) and public.edu_campus_business_has_scope(l.enrollment_id,l.user_id)));
create function public.edu_campus_business_review_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.revision<>1 or new.revoked_at is not null or new.response_count<>0 or new.last_response_at is not null or new.expires_at<=now() or new.expires_at>now()+interval '7 days 1 minute' then raise exception 'Invalid review creation' using errcode='23514'; end if;
  new.created_at:=now();
 else
  if row(new.id,new.user_id,new.enrollment_id,new.token_hash,new.title,new.artifact_url,new.question,new.public_consent,new.created_at,new.expires_at) is distinct from row(old.id,old.user_id,old.enrollment_id,old.token_hash,old.title,old.artifact_url,old.question,old.public_consent,old.created_at,old.expires_at) then raise exception 'Review scope is immutable' using errcode='23514'; end if;
  if current_user='authenticated' then
   if old.revoked_at is not null or new.revoked_at is null or new.revision<>old.revision+1 or row(new.response_count,new.last_response_at) is distinct from row(old.response_count,old.last_response_at) then raise exception 'Invalid review revocation' using errcode='23514'; end if;
   new.revoked_at:=now();
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.edu_campus_business_review_guard() from public,anon,authenticated;
create trigger edu_campus_business_review_guard before insert or update on public.edu_campus_business_review_links for each row execute function public.edu_campus_business_review_guard();
-- No SECURITY DEFINER and no anonymous RPC/table grant. Only server-only service_role calls these bounded RPCs.
create function public.edu_campus_business_review_available(eid uuid,uid uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id and p.status='active'
 join public.courses c on c.id=e.course_id and c.status='published' and c.archived_at is null
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id and h.archived_at is null
 where e.id=eid and e.user_id=uid and e.status='active' and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()));
$$;
revoke all on function public.edu_campus_business_review_available(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_campus_business_review_available(uuid,uuid) to service_role;
create function public.edu_campus_business_review_read(p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.edu_campus_business_review_links;
begin
 select * into l from public.edu_campus_business_review_links where token_hash=p_hash and revoked_at is null and expires_at>now();
 if l.id is null or not public.edu_campus_business_review_available(l.enrollment_id,l.user_id) then raise exception 'Unavailable review' using errcode='P0002'; end if;
 return jsonb_build_object('title',l.title,'url',l.artifact_url,'question',l.question,'expiresAt',l.expires_at,'accepting',l.response_count<50);
end;
$$;
revoke all on function public.edu_campus_business_review_read(text) from public,anon,authenticated;
grant execute on function public.edu_campus_business_review_read(text) to service_role;
create function public.edu_campus_business_review_respond(p_hash text,p_request_id uuid,p_clarity integer,p_answer text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.edu_campus_business_review_links; previous public.edu_campus_business_review_replies;
begin
 if p_request_id is null or p_clarity not between 1 and 5 or p_clarity is null or p_answer is null or char_length(btrim(p_answer)) not between 1 and 2000 then raise exception 'Invalid reply' using errcode='23514'; end if;
 select * into l from public.edu_campus_business_review_links where token_hash=p_hash for update;
 if l.id is null or l.revoked_at is not null or l.expires_at<=now() or not public.edu_campus_business_review_available(l.enrollment_id,l.user_id) then raise exception 'Unavailable review' using errcode='P0002'; end if;
 select * into previous from public.edu_campus_business_review_replies where id=p_request_id;
 if previous.id is not null then
  if previous.link_id=l.id and previous.clarity=p_clarity and previous.answer=btrim(p_answer) then return jsonb_build_object('accepted',true); end if;
  raise exception 'Reply request conflict' using errcode='23505';
 end if;
 if l.response_count>=50 or l.last_response_at>now()-interval '5 seconds' then raise exception 'Review response limit' using errcode='P0001'; end if;
 insert into public.edu_campus_business_review_replies(id,link_id,clarity,answer) values(p_request_id,l.id,p_clarity,btrim(p_answer));
 update public.edu_campus_business_review_links set response_count=response_count+1,last_response_at=now() where id=l.id;
 return jsonb_build_object('accepted',true);
end;
$$;
revoke all on function public.edu_campus_business_review_respond(text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.edu_campus_business_review_respond(text,uuid,integer,text) to service_role;
comment on table public.edu_campus_business_review_links is 'Opt-in capability links. Only chosen title, URL, question are public; token SHA-256 only; max 7 days; owner revoke; 50 replies; service RPC enforces enrollment and 5-second global link cooldown.';
comment on table public.edu_campus_business_review_replies is 'Anonymous feedback text without name/email/IP. Owner-only replies. Private business notes, metrics, students and curriculum are never returned to public readers.';
commit;
