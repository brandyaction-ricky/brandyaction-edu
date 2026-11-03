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
 return {db,login,mutate,rewards,make};
}

test('community RLS privacy, cohort, version history, immutable proof, grants and scope revocation',async()=>{
 const {db,login,mutate,make}=await setup();
 try {
  await login(1); const first=make(100); await mutate(first); assert.deepEqual(await mutate(first),{postId:uid(100),revision:1});
  await assert.rejects(mutate({...first,title:'같은 요청 변조'}),/conflict/i);
  await assert.rejects(db.exec(`update edu_campus_posts set visibility='cohort'`),/permission denied/i);
  await assert.rejects(db.exec(`insert into edu_campus_launches(id) values('${uid(900)}')`),/permission denied/i);
  await login(4); assert.equal((await db.query('select * from edu_campus_posts')).rows.length,0);
  await login(2); assert.equal((await db.query('select * from edu_campus_posts')).rows.length,0);
  await assert.rejects(mutate(make(101,{enrollmentId:uid(31)})),/scope/i);
  await login(1); await mutate(make(102,{action:'revise',postId:uid(100),expectedRevision:1,visibility:'cohort',changeNote:'고객 문구를 구체화했습니다.'}));
  await assert.rejects(mutate(make(103,{action:'revise',postId:uid(100),expectedRevision:1,changeNote:'오래된 탭의 수정'})),/conflict/i);
  await login(2); assert.equal((await db.query('select * from edu_campus_posts')).rows.length,1);
  assert.deepEqual((await db.query('select revision from edu_campus_post_revisions')).rows.map(r=>r.revision),[2]);
  await login(3); assert.equal((await db.query('select * from edu_campus_posts')).rows.length,0);
  await login(1); await mutate(make(104,{action:'revise',postId:uid(100),expectedRevision:2,visibility:'private',changeNote:'이전 공유를 비공개로 회수합니다.'}));
  await login(2); assert.equal((await db.query('select * from edu_campus_post_revisions')).rows.length,0);
  await db.exec(`reset role; update enrollments set revoked_at=now() where id='${uid(31)}';`); await login(1);
  assert.equal((await db.query('select * from edu_campus_posts')).rows.length,0);
  await assert.rejects(mutate(make(105)),/scope/i);
  await db.exec('reset role; set role anon;'); await assert.rejects(db.query('select * from edu_campus_posts'),/permission denied/i);
  await assert.rejects(db.query('select public.edu_campus_community_mutate(null)'),/permission denied/i);
 }finally{await db.close();}
});

test('recipient feedback CAS, applied revision evidence, reward dedup, verified mission gate and launch idempotence',async()=>{
 const {db,login,mutate,rewards,make}=await setup();
 try {
  await login(1); await mutate(make(100,{visibility:'cohort'}));
  await login(2); await mutate({requestId:uid(200),enrollmentId:uid(32),action:'comment',postId:uid(100),expectedRevision:1,alias:'꼼꼼한 동료',body:'고객의 상황을 제목에 넣으면 더 잘 이해할 수 있겠어요.'});
  const ack={requestId:uid(300),enrollmentId:uid(31),action:'acknowledge',postId:uid(100),commentId:uid(200),expectedRevision:0,useful:true,decision:'pending',reason:''};
  await assert.rejects(mutate({...ack,enrollmentId:uid(32)}),/recipient/i);
  await login(1); await mutate(ack); await assert.rejects(mutate({...ack,requestId:uid(301)}),/conflict/i);
  await assert.rejects(mutate({...ack,requestId:uid(302),expectedRevision:1,decision:'apply',appliedRevision:1,reason:'반영했다고만 쓰면 안 됩니다.'}),/revision evidence/i);
  await mutate(make(110,{action:'revise',postId:uid(100),visibility:'cohort',expectedRevision:1,changeNote:'동료 의견대로 제목에 대상을 추가했습니다.'}));
  await mutate({...ack,requestId:uid(303),expectedRevision:1,decision:'apply',appliedRevision:2,reason:'제목의 대상과 핵심 혜택을 바꿨습니다.'});
  assert.equal((await rewards(31)).eligible,false); assert.equal((await rewards(31)).appliedRevisions,1);
  await login(2); await mutate(make(120,{enrollmentId:uid(32),visibility:'cohort'}));
  await login(1); await mutate({requestId:uid(201),enrollmentId:uid(31),action:'comment',postId:uid(120),expectedRevision:1,alias:'문샷 동료',body:'첫 번째 버튼에서 받을 수 있는 결과를 구체적으로 알려 주세요.'});
  await login(2); await mutate({...ack,requestId:uid(304),enrollmentId:uid(32),postId:uid(120),commentId:uid(201)});
  await login(1); const state=await rewards(31); assert.equal(state.eligible,true); assert.equal(state.xp,120); assert.equal(state.usefulFeedback,1);
  await mutate({requestId:uid(400),enrollmentId:uid(31),action:'launch'}); await mutate({requestId:uid(401),enrollmentId:uid(31),action:'launch'});
  const launches=(await db.query('select * from edu_campus_launches')).rows; assert.equal(launches.length,1); assert.equal(launches[0].evidence.missionApprovals[0].submissionId,uid(70)); assert.equal(launches[0].evidence.helpfulFeedback[0].commentId,uid(201)); assert.equal(launches[0].evidence.appliedRevisions,1); assert.equal(launches[0].evidence.appliedRevisionProofs.length,1); assert.equal((await rewards(31)).cohortLaunches,1);
  await db.exec(`reset role; insert into mission_submissions(id,enrollment_id,mission_id,attempt_number,status) values('${uid(71)}','${uid(31)}','${uid(60)}',2,'changes_requested');`); await login(1);
  assert.equal((await rewards(31)).eligible,false); assert.equal((await rewards(31)).xp,20);
  await assert.rejects(mutate({requestId:uid(402),enrollmentId:uid(31),action:'launch'}),/requirements/i);
 }finally{await db.close();}
});

test('blocks are bidirectional, reports private, moderation permission and log enforced',async()=>{
 const {db,login,mutate,make}=await setup();
 try{
  await login(1); await mutate(make(100,{visibility:'cohort'}));
  await login(2); await mutate({requestId:uid(200),enrollmentId:uid(32),action:'report',postId:uid(100),reason:'개인정보가 포함되어 있어 확인을 요청합니다.'});
  await login(1); assert.equal((await db.query('select * from edu_campus_reports')).rows.length,0);
  await assert.rejects(mutate({requestId:uid(300),enrollmentId:uid(31),action:'moderate',postId:uid(100),moderation:'hide_post',reason:'권한 없는 숨김 시도'}),/scope/i);
  await login(4); assert.equal((await db.query('select * from edu_campus_reports')).rows.length,1);
  await mutate({requestId:uid(301),enrollmentId:uid(31),action:'moderate',postId:uid(100),moderation:'hide_post',reason:'검토 중이므로 잠시 숨깁니다.'});
  assert.equal((await db.query('select * from edu_campus_moderation_log')).rows.length,1);
  await login(2); assert.equal((await db.query('select * from edu_campus_posts')).rows.length,0);
  await login(4); await mutate({requestId:uid(302),enrollmentId:uid(31),action:'moderate',postId:uid(100),moderation:'restore_post',reason:'문제없음 확인 후 복구합니다.'});
  await login(2); await mutate({requestId:uid(401),enrollmentId:uid(32),action:'block',targetId:uid(1)});
  assert.equal((await db.query('select * from edu_campus_posts')).rows.length,0);
  await mutate({requestId:uid(402),enrollmentId:uid(32),action:'unblock',targetId:uid(1)});
  assert.equal((await db.query('select * from edu_campus_posts')).rows.length,1);
 }finally{await db.close();}
});
