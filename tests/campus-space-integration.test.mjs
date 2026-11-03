import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const manifest=JSON.parse(readFileSync('integration/campus/dev-migrations/manifest.json','utf8'));
// Local substrate only: checked column/type names match the read-only DEV metadata.
// Existing Supabase schemas and operator permission function are modeled, not deployed.
// This is NOT a live Realtime, Storage, migration-history, or network acceptance test.
const substrate=`
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema private;create schema realtime;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
grant usage on schema auth,private,realtime,storage to authenticated,service_role;
grant execute on function auth.uid(),realtime.topic() to authenticated,service_role;
create table profiles(id uuid primary key,status text not null,role text not null);
create table courses(id uuid primary key,title text not null,status text not null,archived_at timestamptz);
create table cohorts(id uuid primary key,course_id uuid not null references courses(id),name text not null,status text not null,archived_at timestamptz);
create table enrollments(id uuid primary key,user_id uuid not null references profiles(id),course_id uuid not null references courses(id),cohort_id uuid not null references cohorts(id),status text not null,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
create table curriculum_weeks(id uuid primary key,course_id uuid not null references courses(id),is_published boolean not null);
create table curriculum_lessons(id uuid primary key,week_id uuid not null references curriculum_weeks(id),is_published boolean not null,updated_at timestamptz not null);
create table curriculum_missions(id uuid primary key,lesson_id uuid not null references curriculum_lessons(id),is_published boolean not null,is_required boolean not null,archived_at timestamptz,updated_at timestamptz not null default now());
create table mission_submissions(id uuid primary key,enrollment_id uuid not null references enrollments(id),mission_id uuid not null references curriculum_missions(id),attempt_number integer not null,status text not null,reviewed_at timestamptz);
create function private.mission_has_scope(text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and status='active' and role='admin')$$;
grant execute on function private.mission_has_scope(text) to authenticated;
create table realtime.messages(id serial primary key,extension text);alter table realtime.messages enable row level security;
grant select,insert on realtime.messages to authenticated;grant usage on sequence realtime.messages_id_seq to authenticated;
create policy existing_realtime_send on realtime.messages for insert to authenticated with check(true);
create policy existing_realtime_read on realtime.messages for select to authenticated using(true);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key,bucket_id text,name text);alter table storage.objects enable row level security;
grant select,update,delete on storage.objects to authenticated;
create policy existing_storage_read on storage.objects for select to authenticated using(true);
grant select on profiles,courses,cohorts,enrollments,curriculum_weeks,curriculum_lessons,curriculum_missions,mission_submissions to authenticated,service_role;
grant update on profiles to service_role;
insert into profiles values('${uid(1)}','active','member'),('${uid(2)}','active','member'),('${uid(3)}','active','member'),('${uid(4)}','active','admin');
insert into courses values('${uid(10)}','문샷 통합 QA','published',null);
insert into cohorts values('${uid(20)}','${uid(10)}','동일 기수','in_progress',null),('${uid(21)}','${uid(10)}','다른 기수','in_progress',null);
insert into enrollments(id,user_id,course_id,cohort_id,status) values('${uid(31)}','${uid(1)}','${uid(10)}','${uid(20)}','active'),('${uid(32)}','${uid(2)}','${uid(10)}','${uid(20)}','active'),('${uid(33)}','${uid(3)}','${uid(10)}','${uid(21)}','active');
insert into curriculum_weeks values('${uid(40)}','${uid(10)}',true);insert into curriculum_lessons values('${uid(50)}','${uid(40)}',true,'2026-11-01T00:00:00Z');
insert into curriculum_missions(id,lesson_id,is_published,is_required) values('${uid(60)}','${uid(50)}',true,true);
insert into mission_submissions values('${uid(70)}','${uid(31)}','${uid(60)}',1,'approved',now());
`;
async function setup(){
 const db=new PGlite();await db.exec(substrate);
 assert.equal(manifest.migrations.length,11,'Review newly added migration scope explicitly');
 const paths=manifest.migrations.map(m=>m.path);assert.deepEqual(paths,[...paths].sort());
 for(const path of paths){try{await db.exec(readFileSync(path,'utf8'));}catch(error){await db.close();throw new Error(`Combined migration failed: ${path}`,{cause:error});}}
 return {db,login:async n=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`),server:async()=>db.exec('reset role;set role service_role;')};
}

test('all eleven campus migrations compose without duplicate objects, dangling foreign keys or unguarded anonymous data',async()=>{
 const {db}=await setup();try{
 const tables=(await db.query("select n.nspname schema,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and c.relname like 'edu_campus_%' order by 1,2")).rows;
 assert.ok(tables.length>=30);assert.ok(tables.every(t=>t.relrowsecurity),JSON.stringify(tables.filter(t=>!t.relrowsecurity)));
 const fks=(await db.query("select count(*)::int n from pg_constraint where contype='f' and conrelid in(select oid from pg_class where relname like 'edu_campus_%')")).rows[0].n;assert.ok(fks>=35);
 const unsafe=(await db.query("select p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and (p.proname like 'edu_campus_%' or p.proname like 'campus_%') and not coalesce(p.proconfig @> array['search_path=\"\"'],false)")).rows;assert.deepEqual(unsafe,[]);
 for(const table of tables)assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',['anon',`${table.schema}.${table.relname}`,'SELECT'])).rows[0].allowed,false,table.relname);
 assert.equal((await db.query("select public from storage.buckets where id='campus-portfolio-private'")).rows[0].public,false);
 assert.equal((await db.query("select count(*)::int n from pg_policies where policyname in('campus_space_receive_guard','campus_space_send_guard') and permissive='RESTRICTIVE'")).rows[0].n,2);
 }finally{await db.close();}
});

test('combined owner records, cohort publication, actual mission rewards, revoked access and session reconnect stay isolated',async()=>{
 const {db,login}=await setup();try{
 await login(1);
 await db.exec(`insert into edu_campus_focus_sessions(id,user_id,enrollment_id,lesson_id,lesson_version,action_text,status,running_since,created_at,updated_at) values('${uid(100)}','${uid(1)}','${uid(31)}','${uid(50)}','2026-11-01T00:00:00Z','고객 첫 화면 문구 검토','running',now(),now(),now());
 insert into edu_campus_preferences(user_id,mode)values('${uid(1)}','together');
 insert into edu_campus_support_requests(id,user_id,enrollment_id,category,title,question)values('${uid(101)}','${uid(1)}','${uid(31)}','tool','도구 연결','비공개 운영 지원 질문');
 insert into edu_campus_space_profiles(user_id,nickname,gender,coat,status,note)values('${uid(1)}','별 동료','female','#527086','joinable','개인 집중 메모');
 insert into edu_campus_space_presence(cohort_id,user_id,session_id,nickname,gender,coat,status)values('${uid(20)}','${uid(1)}','${uid(110)}','별 동료','female','#527086','joinable');`);
 const post={requestId:uid(120),enrollmentId:uid(31),action:'create',kind:'portfolio',title:'통합 첫 화면',body:'고객 관점에서 첫 화면 문구를 바꾸고 동료 의견을 기다립니다.',alias:'별 동료',url:'https://example.com/work',imageUrls:[],lessonId:uid(50),visibility:'cohort'};
 await db.query('select edu_campus_community_mutate($1)',[post]);
 await db.query('insert into edu_campus_business_records(id,user_id,enrollment_id,kind,title,payload,last_command_id,creation_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8)',[uid(130),uid(1),uid(31),'recipe','개인 실행 작업 순서',{goal:'문제 확인',prompt:'고객 문제를 좁히기',steps:'질문 후 기록',result:'본인 결과'},uid(131),'a'.repeat(64)]);
 const rewards=(await db.query('select edu_campus_community_rewards($1) value',[uid(31)])).rows[0].value;assert.equal(rewards.approvedMissions,1);assert.equal(rewards.eligible,false);
 await db.query('select edu_campus_space_claim_seat($1,$2,$3)',[uid(20),uid(110),'desk-1']);
 // Explicit leave/rejoin creates a new session; the old tab cannot reclaim the new seat.
 await db.exec('delete from edu_campus_space_seats;delete from edu_campus_space_presence;');
 await db.query("insert into edu_campus_space_presence(cohort_id,user_id,session_id,nickname,gender,coat,status)values($1,$2,$3,'별 동료','female','#527086','joinable')",[uid(20),uid(1),uid(111)]);
 await assert.rejects(db.query('select edu_campus_space_claim_seat($1,$2,$3)',[uid(20),uid(110),'desk-1']),/session/i);
 await db.query('select edu_campus_space_claim_seat($1,$2,$3)',[uid(20),uid(111),'desk-1']);
 await login(2);
 for(const table of ['edu_campus_focus_sessions','edu_campus_support_requests','edu_campus_preferences','edu_campus_business_records','edu_campus_space_profiles'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0,table);
 assert.equal((await db.query('select * from edu_campus_posts')).rows.length,1);assert.equal((await db.query('select * from edu_campus_space_presence')).rows.length,1);
 await assert.rejects(db.query('select edu_campus_community_rewards($1)',[uid(31)]),/scope/i);
 await login(3);assert.equal((await db.query('select * from edu_campus_posts')).rows.length,0);assert.equal((await db.query('select * from edu_campus_space_presence')).rows.length,0);
 await login(1);await db.exec(`select set_config('realtime.topic','campus-space:${uid(20)}:${uid(2)}',false)`);await assert.rejects(db.exec("insert into realtime.messages(extension)values('broadcast')"),/row-level security/i);
 await db.exec(`reset role;update enrollments set status='refunded',revoked_at=now() where id='${uid(31)}'`);await login(1);
 for(const table of ['edu_campus_focus_sessions','edu_campus_support_requests','edu_campus_business_records','edu_campus_posts'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0,table);
 assert.equal((await db.query('select edu_campus_space_topic($1,true) allowed',[`campus-space:${uid(20)}:${uid(1)}`])).rows[0].allowed,false);
 await db.exec('delete from edu_campus_space_seats;delete from edu_campus_space_presence;');assert.equal((await db.query('select * from edu_campus_space_presence')).rows.length,0);
 await db.exec(`reset role;update enrollments set status='active',revoked_at=null where id='${uid(31)}';update cohorts set archived_at=now() where id='${uid(20)}'`);await login(1);assert.equal((await db.query('select edu_campus_space_member($1) allowed',[uid(20)])).rows[0].allowed,false);assert.equal((await db.query('select * from edu_campus_posts')).rows.length,0);
 // Revocation does not destroy evidence. It only removes active access.
 await db.exec('reset role');assert.equal((await db.query('select * from edu_campus_focus_sessions')).rows.length,1);assert.equal((await db.query('select * from edu_campus_posts')).rows.length,1);
 }finally{await db.close();}
});

test('combined support booking cancel and private office events require their actual server role and preserve ownership',async()=>{
 const {db,login,server}=await setup();try{
 await server();await db.query("insert into edu_campus_office_sessions(id,cohort_id,title,kind,starts_at,ends_at,capacity,created_by)values($1,$2,'통합 멘토 시간','mentor',now()+interval '1 day',now()+interval '25 hours',1,$3)",[uid(200),uid(20),uid(4)]);
 await login(1);await assert.rejects(db.query('select edu_campus_reserve_office($1,$2,$3,false)',[uid(1),uid(200),uid(201)]),/permission denied/i);
 await server();await db.query('select edu_campus_reserve_office($1,$2,$3,false)',[uid(1),uid(200),uid(201)]);await assert.rejects(db.query('select edu_campus_reserve_office($1,$2,$3,false)',[uid(2),uid(200),uid(202)]),/full/i);
 await db.query('select edu_campus_reserve_office($1,$2,$3,true)',[uid(1),uid(200),uid(201)]);await db.query('select edu_campus_reserve_office($1,$2,$3,false)',[uid(2),uid(200),uid(202)]);await assert.rejects(db.query('select edu_campus_reserve_office($1,$2,$3,false)',[uid(3),uid(200),uid(203)]),/Access denied/i);
 await login(1);const job={requestId:uid(210),enrollmentId:uid(31),action:'create',objective:'첫 제안의 고객과 문제를 명확히 하는 개인 작업 계획을 정리합니다.',materialUrls:[],outputType:'plan'};await db.query('select edu_campus_office_mutate($1)',[job]);
 await assert.rejects(db.exec("update edu_campus_office_jobs set status='approved'"),/permission denied/i);
 const ingest=()=>db.query('select edu_campus_office_ingest($1,$2,$3::uuid[],$4,$5,$6)',['qa-office','v1',[uid(1)],uid(211),'b'.repeat(64),{jobId:uid(210),expectedRevision:1,event:'accepted',note:''}]);await assert.rejects(ingest(),/permission denied/i);
 await db.exec(`reset role;insert into private.edu_campus_office_connectors(connector_id,owner_id,key_version,enabled)values('qa-office','${uid(1)}','v1',true)`);await server();await ingest();
 await login(2);assert.equal((await db.query('select * from edu_campus_office_jobs')).rows.length,0);await login(1);assert.equal((await db.query('select status from edu_campus_office_jobs')).rows[0].status,'queued');
 assert.equal((await db.query('select status from edu_campus_office_bookings')).rows[0].status,'cancelled');
 await db.exec(`reset role;update enrollments set status='refunded',revoked_at=now() where id='${uid(31)}'`);await server();await assert.rejects(db.query('select edu_campus_archive_read($1,$2,$3,null)',[uid(1),uid(31),'business']),/unavailable/i);await assert.rejects(ingest(),/scope/i);
 }finally{await db.close();}
});


test('combined HTTP observations are server-only cohort aggregates and reject out-of-scope actors',async()=>{
 const {db,login,server}=await setup();try{
 const observe=(actor,cohort,status=200,elapsed=125)=>db.query('select edu_campus_observe_space_http($1,$2,$3,$4) recorded',[uid(actor),uid(cohort),status,elapsed]);
 await login(1);await assert.rejects(observe(1,20),/permission denied/i);await assert.rejects(db.query('select * from edu_campus_space_http_metrics'),/permission denied/i);
 await db.exec('reset role;set role anon');await assert.rejects(observe(1,20),/permission denied/i);
 await server();assert.equal((await observe(1,20)).rows[0].recorded,true);assert.equal((await observe(1,20,503,3200)).rows[0].recorded,true);assert.equal((await observe(3,20)).rows[0].recorded,false);
 const rows=(await db.query('select * from edu_campus_space_http_metrics')).rows;assert.equal(rows.length,1);assert.equal(Number(rows[0].requests),2);assert.equal(Number(rows[0].server_errors),1);assert.equal(Number(rows[0].slow_requests),1);assert.equal(Number(rows[0].total_ms),3325);
 assert.deepEqual(Object.keys(rows[0]).sort(),['bucket_at','client_errors','cohort_id','max_ms','requests','server_errors','slow_requests','total_ms'].sort());
 await db.exec(`reset role;update enrollments set status='refunded',revoked_at=now() where id='${uid(31)}'`);await server();assert.equal((await observe(1,20)).rows[0].recorded,false);
 }finally{await db.close();}
});
