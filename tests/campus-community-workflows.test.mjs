import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function setup() {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,private to authenticated; grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,status text,role text);
 create table courses(id uuid primary key,status text,archived_at timestamptz);
 create table cohorts(id uuid primary key,course_id uuid,archived_at timestamptz);
 create table enrollments(id uuid primary key,user_id uuid,course_id uuid,cohort_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
 create table curriculum_weeks(id uuid primary key,course_id uuid,is_published boolean);
 create table curriculum_lessons(id uuid primary key,week_id uuid,is_published boolean);
 create table curriculum_missions(id uuid primary key,lesson_id uuid,is_published boolean,is_required boolean,archived_at timestamptz,updated_at timestamptz default now());
 create table mission_submissions(id uuid primary key,enrollment_id uuid,mission_id uuid,attempt_number integer,status text,reviewed_at timestamptz);
 create function private.mission_has_scope(text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active' and role='admin') $$;
 grant execute on function private.mission_has_scope(text) to authenticated;
 insert into profiles values('${uid(1)}','active','member'),('${uid(2)}','active','member'),('${uid(3)}','active','member'),('${uid(4)}','active','admin');
 insert into courses values('${uid(10)}','published',null);
 insert into cohorts(id,course_id) values('${uid(20)}','${uid(10)}'),('${uid(21)}','${uid(10)}');
 insert into enrollments(id,user_id,course_id,cohort_id,status) values('${uid(31)}','${uid(1)}','${uid(10)}','${uid(20)}','active'),('${uid(32)}','${uid(2)}','${uid(10)}','${uid(20)}','active'),('${uid(33)}','${uid(3)}','${uid(10)}','${uid(21)}','active');
 insert into curriculum_weeks values('${uid(40)}','${uid(10)}',true);
 insert into curriculum_lessons values('${uid(50)}','${uid(40)}',true);
 insert into curriculum_missions(id,lesson_id,is_published,is_required,archived_at) values('${uid(60)}','${uid(50)}',true,true,null);
 insert into mission_submissions(id,enrollment_id,mission_id,attempt_number,status) values('${uid(70)}','${uid(31)}','${uid(60)}',1,'approved');`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261102151403_edu_campus_community_workflows.sql',import.meta.url),'utf8'));
 const login=async n=>db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false)`);
 const mutate=async c=>(await db.query('select public.edu_campus_community_mutate($1::jsonb) as result',[JSON.stringify(c)])).rows[0].result;
 const rewards=async n=>(await db.query('select public.edu_campus_community_rewards($1) as result',[uid(n)])).rows[0].result;
 const make=(n,extra={})=>({requestId:uid(n),enrollmentId:uid(31),action:'create',kind:'portfolio',title:'고객 관점 첫 화면',body:'첫 화면에서 누구를 위한 제안인지 구체적으로 기록합니다.',alias:'문샷 동료',url:'https://example.com/work',imageUrls:['https://example.com/capture.png'],lessonId:uid(50),visibility:'private',...extra});
 await db.exec(`create role service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key,bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,update,delete on storage.objects to authenticated;create policy unrelated_broad_read on storage.objects for select to authenticated using(true);`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261102225053_edu_campus_community_exchange_demo_files.sql',import.meta.url),'utf8'));
 const flow=async c=>(await db.query('select public.edu_campus_community_flow_mutate($1::jsonb) result',[JSON.stringify(c)])).rows[0].result;
 return {db,login,mutate,rewards,make,flow};
}

test('talent exchange is cohort scoped, participant private, immutable, idempotent and cannot approve itself',async()=>{
 const {db,login,mutate,make,flow}=await setup();try{
 await login(1);await mutate(make(100,{visibility:'cohort',kind:'talent_offer'}));
 const proposal={requestId:uid(200),postId:uid(100),action:'exchange_propose',alias:'함께하는 동료',note:'첫 화면 문구 검토를 돕고 이미지 배치 의견을 받고 싶습니다.'};
 await assert.rejects(flow(proposal),/scope/i);await login(3);await assert.rejects(flow(proposal),/scope/i);
 await login(2);assert.equal((await flow(proposal)).id,uid(200));assert.equal((await flow(proposal)).revision,1);
 await assert.rejects(flow({...proposal,note:'같은 요청을 다른 내용으로 바꿔봅니다.'}),/replay conflict/i);
 await assert.rejects(flow({...proposal,requestId:uid(201)}),/duplicate/i);
 const step=(id,action,rev)=>({requestId:uid(id),postId:uid(100),entityId:uid(200),action,expectedRevision:rev,note:'상대가 제안한 범위와 내용을 확인했습니다.'});
 await assert.rejects(flow(step(210,'exchange_accept',1)),/transition/i);
 await login(1);await flow(step(211,'exchange_accept',1));await assert.rejects(flow(step(212,'exchange_complete',2)),/transition/i);
 await login(2);await flow(step(213,'exchange_submit',2));await assert.rejects(flow(step(214,'exchange_complete',3)),/transition/i);
 await login(1);await flow(step(215,'exchange_complete',3));assert.equal((await db.query('select status from edu_campus_exchanges')).rows[0].status,'completed');
 assert.equal((await db.query('select * from edu_campus_community_flow_history')).rows.length,4);
 await login(4);assert.equal((await db.query('select * from edu_campus_exchanges')).rows.length,0);
 await login(2);await assert.rejects(db.exec("update edu_campus_exchanges set status='completed'"),/permission denied/i);
 await db.exec(`reset role;update enrollments set revoked_at=now() where id='${uid(32)}';`);await login(2);assert.equal((await db.query('select * from edu_campus_exchanges')).rows.length,0);
 }finally{await db.close();}
});
test('demo slots prevent overlap, only operators start/finish, questions retain presenter answers and scope',async()=>{
 const {db,login,mutate,make,flow}=await setup();try{
 await login(1);await mutate(make(100,{visibility:'cohort',kind:'demo_day'}));
 const reserve={requestId:uid(200),postId:uid(100),action:'demo_reserve',startsAt:new Date(Date.now()+86400000).toISOString(),minutes:10};
 await flow(reserve);await login(2);await mutate(make(101,{enrollmentId:uid(32),visibility:'cohort',kind:'demo_day'}));await assert.rejects(flow({...reserve,requestId:uid(201),postId:uid(101)}),/slot conflict/i);
 const advance=(id,action,rev)=>({requestId:uid(id),postId:uid(100),entityId:uid(200),action,expectedRevision:rev,note:'현재 발표 상황을 확인하고 진행합니다.'});
 await assert.rejects(flow(advance(210,'demo_start',1)),/operator scope/i);
 await flow({requestId:uid(220),postId:uid(100),entityId:uid(200),action:'demo_ask',alias:'동료 질문',note:'첫 번째 고객의 반응은 어떻게 확인하셨나요?'});
 const answer={requestId:uid(221),postId:uid(100),entityId:uid(200),questionId:uid(220),action:'demo_answer',expectedRevision:1,note:'고객 세 분께 첫 화면을 보여드리고 문구를 조정했습니다.'};
 await assert.rejects(flow(answer),/presenter scope/i);await login(1);await flow(answer);await assert.rejects(flow({...answer,requestId:uid(222)}),/revision conflict/i);
 await login(4);await flow(advance(211,'demo_start',1));await flow(advance(212,'demo_finish',2));
 assert.equal((await db.query('select status from edu_campus_demo_slots')).rows[0].status,'finished');
 await login(2);assert.equal((await db.query('select answer from edu_campus_demo_questions')).rows[0].answer,answer.note);
 await login(3);assert.equal((await db.query('select * from edu_campus_demo_slots')).rows.length,0);
 }finally{await db.close();}
});
test('portfolio attachment metadata stays owner only even on shared posts; completion is server only and revoked access fails',async()=>{
 const {db,login,mutate,make}=await setup();try{
 await login(1);await mutate(make(100,{visibility:'cohort'}));
 const prepare=async c=>(await db.query('select (public.edu_campus_portfolio_file_prepare($1::jsonb)).*',[JSON.stringify(c)])).rows[0];
 const c={requestId:uid(200),postId:uid(100),expectedRevision:1,name:'화면 캡처.png',size:8,contentType:'image/png'};
 const f=await prepare(c);assert.equal(f.owner_id,uid(1));assert.equal(f.state,'pending');assert.equal((await prepare(c)).id,uid(200));
 await assert.rejects(prepare({...c,size:9}),/replay conflict/i);
 await assert.rejects(db.query('select public.edu_campus_portfolio_file_complete($1,$2,$3)',[uid(1),uid(200),'a'.repeat(64)]),/permission denied/i);
 await login(2);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);await assert.rejects(prepare({...c,requestId:uid(201)}),/scope/i);
 await login(4);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);
 await db.exec('reset role;set role service_role;');await db.query('select public.edu_campus_portfolio_file_complete($1,$2,$3)',[uid(1),uid(200),'a'.repeat(64)]);
 await login(1);assert.equal((await db.query('select state from edu_campus_portfolio_files')).rows[0].state,'ready');
 await db.exec(`reset role;update cohorts set archived_at=now() where id='${uid(20)}';set role service_role;`);await assert.rejects(db.query('select public.edu_campus_portfolio_file_complete($1,$2,$3)',[uid(1),uid(200),'a'.repeat(64)]),/scope/i);
 await login(1);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);
 const bucket=(await db.query('reset role;')).rows;void bucket;
 assert.equal((await db.query('select public from storage.buckets')).rows[0].public,false);
 await db.exec(`insert into storage.objects values('${uid(900)}','campus-portfolio-private','secret'),('${uid(901)}','other','public');`);await login(2);assert.deepEqual((await db.query('select name from storage.objects')).rows.map(r=>r.name),['public']);
 }finally{await db.close();}
});
test('explicit file sharing is CAS and cohort scoped; report hold, block, private transition and revoked membership close fresh reads',async()=>{
 const {db,login,mutate,make}=await setup();try{
 await login(1);await mutate(make(100,{visibility:'cohort'}));await db.query('select public.edu_campus_portfolio_file_prepare($1::jsonb)',[JSON.stringify({requestId:uid(200),postId:uid(100),expectedRevision:1,name:'캡처.png',size:8,contentType:'image/png'})]);
 await db.exec('reset role;set role service_role;');await db.query('select public.edu_campus_portfolio_file_complete($1,$2,$3)',[uid(1),uid(200),'a'.repeat(64)]);
 const share=async c=>(await db.query('select public.edu_campus_portfolio_file_share($1::jsonb) result',[JSON.stringify(c)])).rows[0].result;
 const c={requestId:uid(210),fileId:uid(200),expectedRevision:1,visibility:'cohort',confirmed:true};
 await login(2);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);await assert.rejects(share(c),/scope/i);
 await login(1);await assert.rejects(share({...c,confirmed:false}),/share scope/i);await share(c);assert.equal((await share(c)).revision,2);await assert.rejects(share({...c,requestId:uid(211)}),/revision conflict/i);
 await login(2);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,1);await login(3);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);
 await login(2);await mutate({requestId:uid(220),enrollmentId:uid(32),action:'report',postId:uid(100),reason:'개인정보가 보여서 확인을 요청합니다.'});assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);
 await login(4);await mutate({requestId:uid(221),enrollmentId:uid(31),action:'moderate',postId:uid(100),reportId:uid(220),moderation:'resolve_report',reason:'작성자가 공개 가능한 자료임을 확인했습니다.'});
 await login(2);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,1);await mutate({requestId:uid(222),enrollmentId:uid(32),action:'block',targetId:uid(1)});assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);await mutate({requestId:uid(223),enrollmentId:uid(32),action:'unblock',targetId:uid(1)});
 await login(1);await mutate(make(230,{action:'revise',postId:uid(100),expectedRevision:1,visibility:'private',changeNote:'첨부 공개를 함께 회수합니다.'}));assert.equal((await db.query('select visibility from edu_campus_portfolio_files')).rows[0].visibility,'private');
 await mutate(make(231,{action:'revise',postId:uid(100),expectedRevision:2,visibility:'cohort',changeNote:'글만 다시 공개하고 파일은 재동의 전까지 비공개입니다.'}));await login(2);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);
 await login(1);await share({...c,requestId:uid(232),expectedRevision:3});await db.exec(`reset role;update enrollments set revoked_at=now() where id='${uid(32)}';`);await login(2);assert.equal((await db.query('select * from edu_campus_portfolio_files')).rows.length,0);
 await db.exec('reset role;set role anon;');await assert.rejects(db.query('select * from edu_campus_portfolio_files'),/permission denied/i);
 }finally{await db.close();}
});
