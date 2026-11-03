-- Prepared DEV-only smoke; NOT executed on DEV by its author.
-- Caller must verify the actual connected project, then set the session GUC
-- campus.qa.verified_project_ref = 'vjmjhaidlqkmascdjocw'. Database name is not proof.
-- Run this WHOLE file on one connection. Never remove the final ROLLBACK.
-- Auth rows have no password, identity, session or confirmed email, and never commit.
-- No Storage.objects writes, no HTTP, no bot dispatch, no payment or student data reads.
-- SQL checks the ingest privilege boundary; HMAC is tested separately in the HTTP handler.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local idle_in_transaction_session_timeout = '60s';
set local row_security = on;

-- A lost/changing target or pre-existing QA namespace fails before any insert.
do $guard$
declare r record; collision boolean;
begin
 if current_setting('campus.qa.verified_project_ref',true) is distinct from 'vjmjhaidlqkmascdjocw' then
  raise exception 'STOP: caller has not verified the DEV project identity';
 end if;
 if current_user in ('anon','authenticated','service_role') then raise exception 'STOP: use the reviewed database operator connection';end if;
 perform pg_advisory_xact_lock(hashtextextended('campus-transactional-qa-20261103',0));
 if exists(select 1 from auth.users where id between 'f03c2026-1103-4000-8000-000000000001'::uuid and 'f03c2026-1103-4000-8000-000000000999'::uuid
   or email like 'campus-rollback-qa-20261103-%@example.invalid') then raise exception 'STOP: fixed auth QA identifier already exists';end if;
 for r in select * from (values
  ('public','profiles','id'),('public','courses','id'),('public','cohorts','id'),('public','enrollments','id'),
  ('public','curriculum_weeks','id'),('public','curriculum_lessons','id'),
  ('public','edu_campus_focus_sessions','id'),('public','edu_campus_posts','id'),('public','edu_campus_business_records','id'),
  ('public','edu_campus_support_requests','id'),('public','edu_campus_office_jobs','id'),('public','edu_campus_exchanges','id'),
  ('public','edu_campus_business_cases','id'),('public','edu_campus_archive_entries','id'),('public','edu_campus_space_profiles','user_id'),
  ('public','edu_campus_space_controls','cohort_id')
 ) v(s,t,c) loop
  if to_regclass(format('%I.%I',r.s,r.t)) is null then raise exception 'STOP: required campus relation missing: %.%',r.s,r.t;end if;
  execute format('select exists(select 1 from %I.%I where %I between $1 and $2)',r.s,r.t,r.c) into collision
    using 'f03c2026-1103-4000-8000-000000000001'::uuid,'f03c2026-1103-4000-8000-000000000999'::uuid;
  if collision then raise exception 'STOP: fixed QA identifier already exists in %.%',r.s,r.t;end if;
 end loop;
 for r in select * from (values ('edu_tips_private','subjects'),('edu_tips_private','hmac_intents')) v(s,t) loop
  if to_regclass(format('%I.%I',r.s,r.t)) is not null then
   execute format('select exists(select 1 from %I.%I where member_id between $1 and $2)',r.s,r.t) into collision using 'f03c2026-1103-4000-8000-000000000001'::uuid,'f03c2026-1103-4000-8000-000000000004'::uuid;
   if collision then raise exception 'STOP: QA member already has a Tips subject/intent';end if;
  end if;
 end loop;
 if exists(select 1 from public.courses where course_code='campus-rollback-qa-20261103' or slug='campus-rollback-qa-20261103') then
  raise exception 'STOP: fixed QA course key already exists';end if;
end;
$guard$;

-- The runner supplies a frozen fingerprint from reviewed seed-trigger metadata.
-- Never compute-and-accept a new production fingerprint merely to bypass this guard.
do $seed_guard$
declare actual text;
begin
 select md5(coalesce(string_agg(n.nspname||'.'||c.relname||'.'||t.tgname||E'\n'||pg_get_triggerdef(t.oid)||E'\n'||pg_get_functiondef(t.tgfoid),E'\n' order by n.nspname,c.relname,t.tgname),'')) into actual
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and ((n.nspname='auth' and c.relname='users') or (n.nspname='public' and c.relname in
 ('profiles','courses','cohorts','enrollments','curriculum_weeks','curriculum_lessons')));
 if current_setting('campus.qa.reviewed_seed_fingerprint',true) is distinct from actual then
  raise exception 'STOP: seed trigger/function metadata differs from the reviewed baseline';
 end if;
 select md5(coalesce(string_agg(n.nspname||'.'||p.proname||E'\n'||pg_get_functiondef(p.oid),E'\n' order by n.nspname,p.proname,pg_get_functiondef(p.oid)),'')) into actual
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('crm_enqueue_automation','crm_sync_automatic_tags','crm_on_tag_assigned'))
    or (n.nspname='edu_tips_private' and p.proname in ('capture_member','subject_allowed'));
 if current_setting('campus.qa.reviewed_automation_fingerprint',true) is distinct from actual then
  raise exception 'STOP: automation functions differ from the reviewed baseline';
 end if;
end;
$seed_guard$;

-- TEMP functions run as the current test role, never SECURITY DEFINER.
create function pg_temp.campus_qa_assert(ok boolean,label text) returns void language plpgsql security invoker as $$
begin if ok is distinct from true then raise exception 'CAMPUS QA FAILED: %',label;end if;end;$$;
create function pg_temp.campus_qa_denied(statement text,label text,expected_state text default '42501') returns void language plpgsql security invoker as $$
begin
 begin execute statement;
 exception when others then
  if sqlstate=expected_state then return;end if;
  raise exception 'CAMPUS QA wrong rejection for %: expected %, got %',label,expected_state,sqlstate;
 end;
 raise exception 'CAMPUS QA access unexpectedly allowed: %',label;
end;$$;

-- Only fabricated QA identities. A normal auth insert trigger may create the matching profile.
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('f03c2026-1103-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'campus-rollback-qa-20261103-'||n||'@example.invalid',null,'{}'::jsonb,jsonb_build_object('full_name','CAMPUS ROLLBACK QA '||n),now(),now()
from generate_series(1,4) n;
insert into public.profiles(id,email,full_name,role,status,created_at,updated_at,marketing_consent,is_internal)
select ('f03c2026-1103-4000-8000-'||lpad(n::text,12,'0'))::uuid,'campus-rollback-qa-20261103-'||n||'@example.invalid',
 'CAMPUS ROLLBACK QA '||n,'student','active',now(),now(),false,true from generate_series(1,4) n
on conflict(id) do nothing;
select pg_temp.campus_qa_assert((select count(*)=4 from public.profiles where id in (
 'f03c2026-1103-4000-8000-000000000001','f03c2026-1103-4000-8000-000000000002',
 'f03c2026-1103-4000-8000-000000000003','f03c2026-1103-4000-8000-000000000004') and status='active' and role='student'), 'four new non-admin profiles');
insert into public.courses(id,course_code,slug,title,list_price,status,display_order,metadata,published_at,created_at,updated_at)
values('f03c2026-1103-4000-8000-000000000010','campus-rollback-qa-20261103','campus-rollback-qa-20261103',
 'ROLLBACK QA ONLY',0,'published',999999,'{"hidden_from_catalog":true,"qa_only":true}'::jsonb,now(),now(),now());
insert into public.cohorts(id,course_id,cohort_code,name,price,status,created_at,updated_at,alumni_access_on_enroll)
values('f03c2026-1103-4000-8000-000000000020','f03c2026-1103-4000-8000-000000000010','qa-a','ROLLBACK QA A',0,'in_progress',now(),now(),false),
 ('f03c2026-1103-4000-8000-000000000021','f03c2026-1103-4000-8000-000000000010','qa-b','ROLLBACK QA B',0,'in_progress',now(),now(),false);
insert into public.enrollments(id,user_id,course_id,cohort_id,status,source,access_starts_at,created_at,updated_at)
select ('f03c2026-1103-4000-8000-'||lpad((30+n)::text,12,'0'))::uuid,('f03c2026-1103-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'f03c2026-1103-4000-8000-000000000010'::uuid,case when n=3 then 'f03c2026-1103-4000-8000-000000000021'::uuid else 'f03c2026-1103-4000-8000-000000000020'::uuid end,
 'active','admin_grant',now()-interval '1 minute',now(),now() from generate_series(1,4) n;
insert into public.curriculum_weeks(id,course_id,week_number,title,is_published,display_order,created_at,updated_at)
values('f03c2026-1103-4000-8000-000000000040','f03c2026-1103-4000-8000-000000000010',1,'ROLLBACK QA WEEK',true,0,now(),now());
insert into public.curriculum_lessons(id,week_id,day_number,title,content_type,is_preview,is_published,display_order,access_mode,created_at,updated_at)
values('f03c2026-1103-4000-8000-000000000050','f03c2026-1103-4000-8000-000000000040',1,'ROLLBACK QA LESSON','material',false,true,0,'enrolled',now(),'2026-11-03T00:00:00Z');

-- OWNER and future-refunded account initially create only their own QA records.
reset role;
select set_config('request.jwt.claim.sub','f03c2026-1103-4000-8000-000000000001',true),set_config('request.jwt.claims','{"sub":"f03c2026-1103-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;

select public.edu_campus_community_mutate('{"requestId": "f03c2026-1103-4000-8000-000000000100", "enrollmentId": "f03c2026-1103-4000-8000-000000000031", "action": "create", "kind": "portfolio", "title": "ROLLBACK QA PORTFOLIO", "body": "Only fabricated QA text. Never a real student submission.", "alias": "QA ONLY", "url": "", "imageUrls": [], "lessonId": "f03c2026-1103-4000-8000-000000000050", "visibility": "private"}'::jsonb);
select public.edu_campus_community_mutate('{"requestId": "f03c2026-1103-4000-8000-000000000101", "enrollmentId": "f03c2026-1103-4000-8000-000000000031", "action": "create", "kind": "portfolio", "title": "ROLLBACK QA PORTFOLIO", "body": "Only fabricated QA text. Never a real student submission.", "alias": "QA ONLY", "url": "", "imageUrls": [], "lessonId": "f03c2026-1103-4000-8000-000000000050", "visibility": "cohort"}'::jsonb);
insert into public.edu_campus_focus_sessions(id,user_id,enrollment_id,lesson_id,lesson_version,action_text,status,running_since,created_at,updated_at)
values('f03c2026-1103-4000-8000-000000000102','f03c2026-1103-4000-8000-000000000001','f03c2026-1103-4000-8000-000000000031','f03c2026-1103-4000-8000-000000000050','2026-11-03T00:00:00Z','ROLLBACK QA focus plan','running',now(),now(),now());
insert into public.edu_campus_business_records(id,user_id,enrollment_id,kind,title,payload,last_command_id,creation_fingerprint)
values('f03c2026-1103-4000-8000-000000000103','f03c2026-1103-4000-8000-000000000001','f03c2026-1103-4000-8000-000000000031','recipe','ROLLBACK QA RECIPE','{"goal":"QA ONLY","prompt":"QA ONLY","steps":"QA ONLY","result":""}'::jsonb,'f03c2026-1103-4000-8000-000000000104',repeat('a',64));
insert into public.edu_campus_support_requests(id,user_id,enrollment_id,category,title,question)
values('f03c2026-1103-4000-8000-000000000105','f03c2026-1103-4000-8000-000000000001','f03c2026-1103-4000-8000-000000000031','tool','ROLLBACK QA SUPPORT','Fabricated QA question only');
select public.edu_campus_office_mutate('{"requestId":"f03c2026-1103-4000-8000-000000000106","enrollmentId":"f03c2026-1103-4000-8000-000000000031","action":"create","objective":"ROLLBACK QA private office plan only","materialUrls":[],"outputType":"plan"}'::jsonb);
select pg_temp.campus_qa_assert((select status='awaiting_connection' from public.edu_campus_office_jobs where id='f03c2026-1103-4000-8000-000000000106'),'new office job stays disconnected');
select pg_temp.campus_qa_assert(public.edu_campus_office_connection('f03c2026-1103-4000-8000-000000000031')='not_connected','no fabricated connector activated');
reset role;
select set_config('request.jwt.claim.sub','f03c2026-1103-4000-8000-000000000004',true),set_config('request.jwt.claims','{"sub":"f03c2026-1103-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;

select public.edu_campus_community_mutate('{"requestId": "f03c2026-1103-4000-8000-000000000200", "enrollmentId": "f03c2026-1103-4000-8000-000000000034", "action": "create", "kind": "portfolio", "title": "ROLLBACK QA PORTFOLIO", "body": "Only fabricated QA text. Never a real student submission.", "alias": "QA ONLY", "url": "", "imageUrls": [], "lessonId": "f03c2026-1103-4000-8000-000000000050", "visibility": "private"}'::jsonb);
select public.edu_campus_community_mutate('{"requestId": "f03c2026-1103-4000-8000-000000000201", "enrollmentId": "f03c2026-1103-4000-8000-000000000034", "action": "create", "kind": "portfolio", "title": "ROLLBACK QA PORTFOLIO", "body": "Only fabricated QA text. Never a real student submission.", "alias": "QA ONLY", "url": "", "imageUrls": [], "lessonId": "f03c2026-1103-4000-8000-000000000050", "visibility": "cohort"}'::jsonb);
insert into public.edu_campus_focus_sessions(id,user_id,enrollment_id,lesson_id,lesson_version,action_text,status,running_since,created_at,updated_at)
values('f03c2026-1103-4000-8000-000000000202','f03c2026-1103-4000-8000-000000000004','f03c2026-1103-4000-8000-000000000034','f03c2026-1103-4000-8000-000000000050','2026-11-03T00:00:00Z','ROLLBACK QA focus plan','running',now(),now(),now());
insert into public.edu_campus_business_records(id,user_id,enrollment_id,kind,title,payload,last_command_id,creation_fingerprint)
values('f03c2026-1103-4000-8000-000000000203','f03c2026-1103-4000-8000-000000000004','f03c2026-1103-4000-8000-000000000034','recipe','ROLLBACK QA RECIPE','{"goal":"QA ONLY","prompt":"QA ONLY","steps":"QA ONLY","result":""}'::jsonb,'f03c2026-1103-4000-8000-000000000204',repeat('a',64));
insert into public.edu_campus_support_requests(id,user_id,enrollment_id,category,title,question)
values('f03c2026-1103-4000-8000-000000000205','f03c2026-1103-4000-8000-000000000004','f03c2026-1103-4000-8000-000000000034','tool','ROLLBACK QA SUPPORT','Fabricated QA question only');
select public.edu_campus_office_mutate('{"requestId":"f03c2026-1103-4000-8000-000000000206","enrollmentId":"f03c2026-1103-4000-8000-000000000034","action":"create","objective":"ROLLBACK QA private office plan only","materialUrls":[],"outputType":"plan"}'::jsonb);
select pg_temp.campus_qa_assert((select status='awaiting_connection' from public.edu_campus_office_jobs where id='f03c2026-1103-4000-8000-000000000206'),'new office job stays disconnected');
select pg_temp.campus_qa_assert(public.edu_campus_office_connection('f03c2026-1103-4000-8000-000000000034')='not_connected','no fabricated connector activated');

-- Owner reads only exact new IDs; no broad student-table scans.
reset role;
select set_config('request.jwt.claim.sub','f03c2026-1103-4000-8000-000000000001',true),set_config('request.jwt.claims','{"sub":"f03c2026-1103-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.campus_qa_assert((select count(*)=2 from public.edu_campus_posts where id in ('f03c2026-1103-4000-8000-000000000100','f03c2026-1103-4000-8000-000000000101')),'owner edu_campus_posts read');
select pg_temp.campus_qa_assert((select count(*)=1 from public.edu_campus_focus_sessions where id in ('f03c2026-1103-4000-8000-000000000102')),'owner edu_campus_focus_sessions read');
select pg_temp.campus_qa_assert((select count(*)=1 from public.edu_campus_business_records where id in ('f03c2026-1103-4000-8000-000000000103')),'owner edu_campus_business_records read');
select pg_temp.campus_qa_assert((select count(*)=1 from public.edu_campus_support_requests where id in ('f03c2026-1103-4000-8000-000000000105')),'owner edu_campus_support_requests read');
select pg_temp.campus_qa_assert((select count(*)=1 from public.edu_campus_office_jobs where id in ('f03c2026-1103-4000-8000-000000000106')),'owner edu_campus_office_jobs read');
select pg_temp.campus_qa_denied('update public.edu_campus_office_jobs set status=''approved'' where id=''f03c2026-1103-4000-8000-000000000106''','browser cannot forge bot completion');

-- A different member in the same cohort sees only the explicitly shared post.
reset role;
select set_config('request.jwt.claim.sub','f03c2026-1103-4000-8000-000000000002',true),set_config('request.jwt.claims','{"sub":"f03c2026-1103-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.campus_qa_assert((select count(*)=1 from public.edu_campus_posts where id in ('f03c2026-1103-4000-8000-000000000100','f03c2026-1103-4000-8000-000000000101')),'same-cohort sharing only');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_focus_sessions where id='f03c2026-1103-4000-8000-000000000102'),'peer cannot read private edu_campus_focus_sessions');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_business_records where id='f03c2026-1103-4000-8000-000000000103'),'peer cannot read private edu_campus_business_records');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_support_requests where id='f03c2026-1103-4000-8000-000000000105'),'peer cannot read private edu_campus_support_requests');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_office_jobs where id='f03c2026-1103-4000-8000-000000000106'),'peer cannot read private edu_campus_office_jobs');
select pg_temp.campus_qa_denied('insert into public.edu_campus_support_requests(id,user_id,enrollment_id,category,title,question) values(''f03c2026-1103-4000-8000-000000000300'',''f03c2026-1103-4000-8000-000000000001'',''f03c2026-1103-4000-8000-000000000031'',''tool'',''QA FORGERY'',''QA FORGERY'')','forged support owner');
select pg_temp.campus_qa_denied('select public.edu_campus_community_mutate(''{"requestId": "f03c2026-1103-4000-8000-000000000301", "enrollmentId": "f03c2026-1103-4000-8000-000000000031", "action": "create", "kind": "portfolio", "title": "ROLLBACK QA PORTFOLIO", "body": "Only fabricated QA text. Never a real student submission.", "alias": "QA ONLY", "url": "", "imageUrls": [], "lessonId": "f03c2026-1103-4000-8000-000000000050", "visibility": "cohort"}''::jsonb)','foreign enrollment RPC');

-- Forged private writes must fail rather than simply hide the resulting row.
select pg_temp.campus_qa_denied($q$insert into public.edu_campus_focus_sessions(id,user_id,enrollment_id,lesson_id,lesson_version,action_text,status,running_since,created_at,updated_at)
values('f03c2026-1103-4000-8000-000000000310','f03c2026-1103-4000-8000-000000000002','f03c2026-1103-4000-8000-000000000031','f03c2026-1103-4000-8000-000000000050','2026-11-03T00:00:00Z','FORGED QA','running',now(),now(),now())$q$,'focus foreign enrollment write');
select pg_temp.campus_qa_denied($q$insert into public.edu_campus_business_records(id,user_id,enrollment_id,kind,title,payload,last_command_id,creation_fingerprint)
values('f03c2026-1103-4000-8000-000000000311','f03c2026-1103-4000-8000-000000000002','f03c2026-1103-4000-8000-000000000031','recipe','FORGED QA','{"goal":"QA","prompt":"QA","steps":"QA","result":""}'::jsonb,'f03c2026-1103-4000-8000-000000000312',repeat('a',64))$q$,'business foreign enrollment write');
select pg_temp.campus_qa_denied($q$select public.edu_campus_office_mutate('{"requestId":"f03c2026-1103-4000-8000-000000000313","enrollmentId":"f03c2026-1103-4000-8000-000000000031","action":"create","objective":"FORGED QA private office request","materialUrls":[],"outputType":"plan"}'::jsonb)$q$,'office foreign enrollment write');

-- Another active cohort has no access to the original cohort records.
reset role;
select set_config('request.jwt.claim.sub','f03c2026-1103-4000-8000-000000000003',true),set_config('request.jwt.claims','{"sub":"f03c2026-1103-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_posts where id in ('f03c2026-1103-4000-8000-000000000100','f03c2026-1103-4000-8000-000000000101')),'other cohort edu_campus_posts denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_focus_sessions where id in ('f03c2026-1103-4000-8000-000000000102')),'other cohort edu_campus_focus_sessions denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_business_records where id in ('f03c2026-1103-4000-8000-000000000103')),'other cohort edu_campus_business_records denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_support_requests where id in ('f03c2026-1103-4000-8000-000000000105')),'other cohort edu_campus_support_requests denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_office_jobs where id in ('f03c2026-1103-4000-8000-000000000106')),'other cohort edu_campus_office_jobs denied');
select pg_temp.campus_qa_denied('select public.edu_campus_community_mutate(''{"requestId": "f03c2026-1103-4000-8000-000000000302", "enrollmentId": "f03c2026-1103-4000-8000-000000000031", "action": "create", "kind": "portfolio", "title": "ROLLBACK QA PORTFOLIO", "body": "Only fabricated QA text. Never a real student submission.", "alias": "QA ONLY", "url": "", "imageUrls": [], "lessonId": "f03c2026-1103-4000-8000-000000000050", "visibility": "cohort"}''::jsonb)','other cohort cannot use owner enrollment');

-- Simulate refund of the NEW QA enrollment only; no payment/refund provider call.
reset role;
update public.enrollments set status='refunded',revoked_at=now() where id='f03c2026-1103-4000-8000-000000000034' and user_id='f03c2026-1103-4000-8000-000000000004' and course_id='f03c2026-1103-4000-8000-000000000010';
reset role;
select set_config('request.jwt.claim.sub','f03c2026-1103-4000-8000-000000000004',true),set_config('request.jwt.claims','{"sub":"f03c2026-1103-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_posts where id in ('f03c2026-1103-4000-8000-000000000200','f03c2026-1103-4000-8000-000000000201')),'refunded own edu_campus_posts denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_focus_sessions where id in ('f03c2026-1103-4000-8000-000000000202')),'refunded own edu_campus_focus_sessions denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_business_records where id in ('f03c2026-1103-4000-8000-000000000203')),'refunded own edu_campus_business_records denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_support_requests where id in ('f03c2026-1103-4000-8000-000000000205')),'refunded own edu_campus_support_requests denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_office_jobs where id in ('f03c2026-1103-4000-8000-000000000206')),'refunded own edu_campus_office_jobs denied');
select pg_temp.campus_qa_assert(not public.edu_campus_focus_has_scope('f03c2026-1103-4000-8000-000000000034','f03c2026-1103-4000-8000-000000000004'),'refunded focus scope');
select pg_temp.campus_qa_assert(not public.edu_campus_business_has_scope('f03c2026-1103-4000-8000-000000000034','f03c2026-1103-4000-8000-000000000004'),'refunded business scope');
select pg_temp.campus_qa_denied('select public.edu_campus_community_mutate(''{"requestId": "f03c2026-1103-4000-8000-000000000303", "enrollmentId": "f03c2026-1103-4000-8000-000000000034", "action": "create", "kind": "portfolio", "title": "ROLLBACK QA PORTFOLIO", "body": "Only fabricated QA text. Never a real student submission.", "alias": "QA ONLY", "url": "", "imageUrls": [], "lessonId": "f03c2026-1103-4000-8000-000000000050", "visibility": "private"}''::jsonb)','refunded create denied');

-- Only server routes may manage review windows; browser cannot forge review promises.
reset role;
select pg_temp.campus_qa_assert(not has_table_privilege('authenticated','public.edu_campus_review_windows','SELECT,INSERT,UPDATE,DELETE'),'review window is server-only');
select pg_temp.campus_qa_assert((select bool_and(has_table_privilege('service_role','public.edu_campus_review_windows',privilege)) from unnest(array['SELECT','INSERT','UPDATE','DELETE']) privilege),'review-window server grants');

-- The eleventh migration keeps observed HTTP metrics and recording server-only.
select pg_temp.campus_qa_assert(not has_table_privilege('authenticated','public.edu_campus_space_http_metrics','SELECT,INSERT,UPDATE,DELETE'),'HTTP metrics browser access denied');
select pg_temp.campus_qa_assert(not has_function_privilege('authenticated','public.edu_campus_observe_space_http(uuid,uuid,integer,integer)','EXECUTE'),'HTTP metrics browser recording denied');
select pg_temp.campus_qa_assert(has_function_privilege('service_role','public.edu_campus_observe_space_http(uuid,uuid,integer,integer)','EXECUTE'),'HTTP metrics server recording grant');

-- No authenticated browser or anonymous caller may bypass webhook verification.
reset role;
select set_config('request.jwt.claim.sub','f03c2026-1103-4000-8000-000000000001',true),set_config('request.jwt.claims','{"sub":"f03c2026-1103-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.campus_qa_assert(not has_function_privilege('authenticated','public.edu_campus_office_ingest(text,text,uuid[],uuid,text,jsonb)','EXECUTE'),'ingest is server-only');
select pg_temp.campus_qa_denied('select public.edu_campus_office_ingest(''rollback-qa'',''v1'',array[''f03c2026-1103-4000-8000-000000000001''::uuid],''f03c2026-1103-4000-8000-000000000401'',repeat(''b'',64),''{"jobId":"f03c2026-1103-4000-8000-000000000106","event":"accepted","expectedRevision":1}''::jsonb)','unsigned browser ingest denied at DB boundary');
reset role;
set local role anon;
select pg_temp.campus_qa_denied('select id from public.edu_campus_posts where id=''f03c2026-1103-4000-8000-000000000101''','anon edu_campus_posts denied');
select pg_temp.campus_qa_denied('select id from public.edu_campus_focus_sessions where id=''f03c2026-1103-4000-8000-000000000102''','anon edu_campus_focus_sessions denied');
select pg_temp.campus_qa_denied('select id from public.edu_campus_business_records where id=''f03c2026-1103-4000-8000-000000000103''','anon edu_campus_business_records denied');
select pg_temp.campus_qa_denied('select id from public.edu_campus_support_requests where id=''f03c2026-1103-4000-8000-000000000105''','anon edu_campus_support_requests denied');
select pg_temp.campus_qa_denied('select id from public.edu_campus_office_jobs where id=''f03c2026-1103-4000-8000-000000000106''','anon edu_campus_office_jobs denied');
select pg_temp.campus_qa_denied('select public.edu_campus_office_ingest(''rollback-qa'',''v1'',array[''f03c2026-1103-4000-8000-000000000001''::uuid],''f03c2026-1103-4000-8000-000000000401'',repeat(''b'',64),''{"jobId":"f03c2026-1103-4000-8000-000000000106","event":"accepted","expectedRevision":1}''::jsonb)','anon ingest denied');

-- Archive only the freshly created QA cohort: all active workspace access must stop.
reset role;
update public.cohorts set archived_at=now() where id='f03c2026-1103-4000-8000-000000000020' and course_id='f03c2026-1103-4000-8000-000000000010';
select set_config('request.jwt.claim.sub','f03c2026-1103-4000-8000-000000000001',true),set_config('request.jwt.claims','{"sub":"f03c2026-1103-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_posts where id='f03c2026-1103-4000-8000-000000000101'),'archived cohort edu_campus_posts denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_focus_sessions where id='f03c2026-1103-4000-8000-000000000102'),'archived cohort edu_campus_focus_sessions denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_business_records where id='f03c2026-1103-4000-8000-000000000103'),'archived cohort edu_campus_business_records denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_support_requests where id='f03c2026-1103-4000-8000-000000000105'),'archived cohort edu_campus_support_requests denied');
select pg_temp.campus_qa_assert((select count(*)=0 from public.edu_campus_office_jobs where id='f03c2026-1103-4000-8000-000000000106'),'archived cohort edu_campus_office_jobs denied');
select pg_temp.campus_qa_assert(not public.edu_campus_space_member('f03c2026-1103-4000-8000-000000000020'),'archived cohort space denied');

-- Evidence remains intact in the transaction; access revocation did not delete it.
reset role;
select pg_temp.campus_qa_assert((select count(*)=2 from public.edu_campus_posts where id in ('f03c2026-1103-4000-8000-000000000200','f03c2026-1103-4000-8000-000000000201')),'refund preserves QA evidence');
select jsonb_build_object('status','transactional_assertions_passed_pending_rollback','fixture','f03c2026-1103-4000-8000','real_login_tested',false,'real_storage_tested',false,'hmac_tested_by_sql',false) as campus_qa_result;
rollback;
-- A result row above is only valid when the client also confirms ROLLBACK completed.
