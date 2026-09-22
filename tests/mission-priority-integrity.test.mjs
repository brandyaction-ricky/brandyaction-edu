import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = name => read('supabase/migrations/' + name + '.sql');
const fn = (source, name) => {
  const match = source.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  assert.ok(match, name);return match[0];
};
const priority = migration('20260922054307_mission_priority_integrity');
const schema = {version:1,questions:[{id:'q1',prompt:'실행 내용',kind:'text',required:true}],checklist:[]};

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table profiles(id uuid primary key,role text,status text,full_name text,email text);
    create table site_settings(key text primary key,value jsonb);
    create table courses(id uuid primary key,title text,status text default 'published',archived_at timestamptz);
    create table curriculum_weeks(id uuid primary key,course_id uuid references courses(id),is_published boolean default true);
    create table curriculum_lessons(id uuid primary key,week_id uuid references curriculum_weeks(id),is_published boolean default true);
    create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),status text default 'active',access_starts_at timestamptz default now(),access_ends_at timestamptz);
    create table audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,before_data jsonb,after_data jsonb);
    create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp();return new;end; $$;
  `);
  const auth = migration('202608060001_launch_transactions');
  await db.exec(fn(auth,'is_admin') + fn(auth,'has_operator_permission'));
  await db.exec(migration('202609080001_learning_missions_and_achievements'));
  await db.exec(migration('20260911052159_edu_rebuild_questions_and_mission_drafts'));
  await db.exec(`
    alter table curriculum_missions add column archived_at timestamptz;
    alter table mission_submissions add column quiz_required boolean default false,add column quiz_passed boolean;
    create table mission_quizzes(mission_id uuid primary key,revision uuid,questions jsonb,pass_percent integer);
    create table mission_quiz_attempts(enrollment_id uuid,mission_id uuid,quiz_revision uuid,passed boolean,score integer,created_at timestamptz default now());
    create table edu_mutation_receipts(actor_id uuid,request_id uuid,target_table text,fingerprint text,result jsonb,primary key(actor_id,request_id));
    alter table edu_mutation_receipts enable row level security;
  `);
  await db.exec(fn(migration('20260908070719_admin_content_and_quiz_workflows'),'submit_learning_mission'));
  await db.exec(fn(migration('20260911060940_edu_ui_functional_workflows'),'review_mission_submissions'));
  await db.exec(migration('20260921144834_member_mission_workspace'));
  // Match pre-existing service-role access, without granting learners writes.
  await db.exec(`grant usage on schema public,auth to anon,authenticated,service_role;
    grant all on all tables in schema public to service_role;
    grant select on profiles,enrollments,curriculum_lessons,curriculum_weeks,site_settings to authenticated;
    revoke execute on function submit_learning_mission(uuid,uuid,uuid,jsonb,uuid,jsonb),review_mission_submissions(uuid,uuid[],text,text) from public,anon,authenticated;
    grant execute on function submit_learning_mission(uuid,uuid,uuid,jsonb,uuid,jsonb),review_mission_submissions(uuid,uuid[],text,text) to service_role;`);
  await db.exec(priority);
  await db.exec(migration('20260922062939_mission_question_context'));
  const ids = Object.fromEntries(['admin','staff','denied','member','other','course','week','lesson','lesson2','enrollment','otherEnrollment'].map(key=>[key,randomUUID()]));
  for (const key of ['admin','staff','denied','member','other']) await db.query('insert into profiles values($1,$2,$3,$4,$5)',[ids[key],key==='admin'?'admin':key==='staff'||key==='denied'?'staff':'student','active','Synthetic '+key,key+'@example.test']);
  await db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+ids.staff,{products:true,members:true}]);
  await db.query('insert into courses(id,title) values($1,$2)',[ids.course,'Synthetic course']);
  await db.query('insert into curriculum_weeks(id,course_id) values($1,$2)',[ids.week,ids.course]);
  for(const key of ['lesson','lesson2'])await db.query('insert into curriculum_lessons(id,week_id) values($1,$2)',[ids[key],ids.week]);
  for(const [key,user] of [['enrollment','member'],['otherEnrollment','other']])await db.query('insert into enrollments(id,user_id,course_id) values($1,$2,$3)',[ids[key],ids[user],ids.course]);
  const call = async(name,args) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
  const values = {lesson_id:ids.lesson,title:'Synthetic mission',instructions:'Try it',submission_type:'text',is_required:true,is_published:true,form_schema:schema};
  await db.exec('set role service_role');
  return {db,ids,call,values};
}

test('mission questions preserve context, ownership, idempotency and private replies without changing general questions',async()=>{
  const {db,ids,call,values}=await database();try{
    const mission=await call('save_mission_definition',[ids.admin,randomUUID(),null,null,values]);
    const request=randomUUID();
    const args=[ids.member,request,ids.enrollment,mission.id,'실행 질문','어떤 순서인가요?'];
    const saved=await call('create_mission_question',args);
    assert.equal((await call('create_mission_question',args)).id,saved.id);
    await assert.rejects(call('create_mission_question',[...args.slice(0,5),'다른 내용']),/같은 요청/);
    const row=(await db.query('select * from edu_questions where id=$1',[saved.id])).rows[0];
    assert.equal(row.course_id,ids.course);assert.equal(row.mission_id,mission.id);assert.equal(row.enrollment_id,ids.enrollment);assert.equal(row.user_id,ids.member);
    await db.query("update edu_questions set answer='먼저 목표를 정하세요',status='answered' where id=$1",[saved.id]);
    for(const [actor,expected] of [[ids.member,1],[ids.other,0]]){
      await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('set role authenticated');
      const rows=(await db.query('select * from edu_questions')).rows;assert.equal(rows.length,expected);
      if(expected)assert.equal(rows[0].answer,'먼저 목표를 정하세요');
      await assert.rejects(call('create_mission_question',args),/permission denied/);
      await assert.rejects(db.query('insert into edu_questions(user_id,mission_id,enrollment_id,title,content) values($1,$2,$3,$4,$5)',[actor,mission.id,ids.enrollment,'직접 요청','권한 우회']),/permission denied/);
      await db.exec('reset role;set role service_role');
    }
    for(const [actor,enrollment,mid] of [[ids.other,ids.enrollment,mission.id],[ids.member,ids.otherEnrollment,mission.id],[ids.member,ids.enrollment,randomUUID()]])await assert.rejects(call('create_mission_question',[actor,randomUUID(),enrollment,mid,'제목','내용']),/권한/);
    await db.query("update enrollments set access_ends_at=now()-interval '1 second' where id=$1",[ids.enrollment]);
    await assert.rejects(call('create_mission_question',[ids.member,randomUUID(),ids.enrollment,mission.id,'제목','내용']),/권한/);
    await db.query('update enrollments set access_ends_at=null where id=$1',[ids.enrollment]);
    await db.query('update curriculum_lessons set is_published=false where id=$1',[ids.lesson]);
    await assert.rejects(call('create_mission_question',args),/권한/);
    assert.equal((await db.query('select count(*)::int n from edu_questions')).rows[0].n,1);
    await db.query("insert into edu_questions(user_id,title,content) values($1,'일반 문의','일반 내용')",[ids.member]);
    assert.equal((await db.query('select count(*)::int n from edu_questions where mission_id is null')).rows[0].n,1);
  }finally{await db.close();}
});

test('mission-only definition RPC permits scoped staff, denies revoked roles and preserves CAS/idempotency',async()=>{
  const {db,ids,call,values}=await database();try{
    const request=randomUUID();
    const saved=await call('save_mission_definition',[ids.staff,request,null,null,values]);
    assert.equal((await call('save_mission_definition',[ids.staff,request,null,null,values])).id,saved.id);
    await assert.rejects(call('save_mission_definition',[ids.staff,request,null,null,{...values,title:'changed'}]),/같은 요청/);
    for(const actor of [ids.denied,ids.member])await assert.rejects(call('save_mission_definition',[actor,randomUUID(),null,null,values]),/권한/);
    await assert.rejects(call('save_mission_definition',[ids.staff,randomUUID(),null,null,{...values,lesson_id:randomUUID()}]),/연결할 학습/);
    await db.query("update courses set status='archived',archived_at=now() where id=$1",[ids.course]);
    await assert.rejects(call('save_mission_definition',[ids.staff,randomUUID(),null,null,values]),/연결할 학습/);
    await db.query("update courses set status='published',archived_at=null where id=$1",[ids.course]);
    await assert.rejects(call('save_mission_definition',[ids.staff,null,saved.id,null,values]),/변경/);
    await assert.rejects(call('save_mission_definition',[ids.staff,null,saved.id,saved.updated_at,{...values,lesson_id:ids.lesson2}]),/변경/);
    const updated=await call('save_mission_definition',[ids.staff,null,saved.id,saved.updated_at,{...values,title:'Updated mission'}]);
    await assert.rejects(call('save_mission_definition',[ids.staff,null,saved.id,saved.updated_at,values]),/변경/);
    await db.query('update site_settings set value=$1 where key=$2',[{products:false,members:true},'edu_staff_permissions_'+ids.staff]);
    await assert.rejects(call('archive_mission_definitions',[ids.staff,[saved.id]]),/권한/);
    await assert.rejects(call('save_mission_definition',[ids.staff,null,saved.id,updated.updated_at,values]),/권한/);
    await db.query('update site_settings set value=$1 where key=$2',[{products:true,members:true},'edu_staff_permissions_'+ids.staff]);
    await assert.rejects(call('archive_mission_definitions',[ids.admin,[saved.id,randomUUID()]]),/목록/);
    assert.equal((await db.query('select is_published from curriculum_missions')).rows[0].is_published,true);
    assert.equal(await call('archive_mission_definitions',[ids.staff,[saved.id]]),1);
    assert.equal((await db.query('select is_published from curriculum_missions')).rows[0].is_published,false);
    await assert.rejects(call('archive_mission_definitions',[ids.admin,[saved.id,randomUUID()]]),/목록/);
  }finally{await db.close();}
});

test('draft CAS, submit transaction cleanup, owner RLS and review/resubmit preserve answers and history',async()=>{
  const {db,ids,call,values}=await database();try{
    const mission=await call('save_mission_definition',[ids.admin,randomUUID(),null,null,values]);
    const response={form_snapshot:schema,mission_snapshot:{title:values.title,instructions:values.instructions,submission_type:'text'},form_answers:{q1:'My answer'},checklist:[]};
    const draft=(actor,expected=null)=>call('save_mission_draft',[actor,ids.enrollment,mission.id,expected,mission.updated_at,'My answer','',response]);
    const submit=()=>call('submit_learning_mission',[ids.member,ids.enrollment,mission.id,response,null,null]);
    await assert.rejects(draft(ids.other),/수강권/);
    await db.query('update curriculum_lessons set is_published=false where id=$1',[ids.lesson]);
    await assert.rejects(draft(ids.member),/수강할 수 없는/);
    await assert.rejects(submit(),/현재 수강할 수 없는/);
    await db.query('update curriculum_lessons set is_published=true where id=$1',[ids.lesson]);
    const first=await draft(ids.member);
    await assert.rejects(draft(ids.member),/다른 화면/);
    const second=await draft(ids.member,first.draftRevision);
    await assert.rejects(draft(ids.member,first.draftRevision),/다른 화면/);
    // A failed submission rolls back without deleting the draft.
    await assert.rejects(call('submit_learning_mission',[ids.member,ids.enrollment,mission.id,{...response,form_answers:{q1:''}},null,null]),/필수 질문/);
    assert.equal((await db.query('select revision from edu_mission_drafts')).rows[0].revision,second.draftRevision);
    const submitted=await submit();
    assert.equal((await db.query('select count(*)::int n from edu_mission_drafts')).rows[0].n,0);
    await assert.rejects(draft(ids.member,second.draftRevision),/이미 제출/);
    await assert.rejects(submit(),/이미 제출/);
    await db.exec('reset role;set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.other]);
    assert.equal((await db.query('select * from mission_submissions')).rows.length,0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.member]);
    assert.equal((await db.query('select * from mission_submissions')).rows.length,1);
    await assert.rejects(db.query("update mission_submissions set status='approved'"),/permission denied/);
    await assert.rejects(db.query("update curriculum_missions set title='bypass'"),/permission denied/);
    await assert.rejects(call('mission_review_queue',[ids.admin,'','','old',1,null]),/permission denied/);
    await assert.rejects(call('save_mission_draft',[ids.member,ids.enrollment,mission.id,null,mission.updated_at,'','',{}]),/permission denied/);
    await db.exec('reset role;set role service_role');
    await assert.rejects(call('review_mission_submissions',[ids.denied,[submitted.submissionId],'approved','']),/권한/);
    // Even a legacy global staff setting must not expose submissions to an unscoped operator.
    await db.query('insert into site_settings values($1,$2)',['operator_preferences',{staffCanManageMembers:true}]);
    await db.exec('reset role;set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.denied]);
    assert.equal((await db.query('select * from mission_submissions')).rows.length,0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.staff]);
    assert.equal((await db.query('select * from mission_submissions')).rows.length,1);
    await db.exec('reset role;set role service_role');
    await assert.rejects(call('review_mission_submissions',[ids.staff,[submitted.submissionId,randomUUID()],'approved','']),/일부 제출/);
    assert.equal((await db.query('select status from mission_submissions where id=$1',[submitted.submissionId])).rows[0].status,'submitted');
    assert.equal((await db.query("select count(*)::int n from audit_logs where action='mission_submission.approved'")).rows[0].n,0);
    await call('review_mission_submissions',[ids.staff,[submitted.submissionId],'changes_requested','Add one example']);
    const revised=await draft(ids.member);
    assert.notEqual(revised.draftRevision,second.draftRevision);
    await assert.rejects(draft(ids.member,second.draftRevision),/다른 화면/);
    const resubmitted=await submit();
    await call('review_mission_submissions',[ids.staff,[resubmitted.submissionId],'approved','Great']);
    const rows=(await db.query('select attempt_number,status,reviewer_feedback from mission_submissions order by attempt_number')).rows;
    assert.deepEqual(rows,[{attempt_number:1,status:'changes_requested',reviewer_feedback:'Add one example'},{attempt_number:2,status:'approved',reviewer_feedback:'Great'}]);
    await assert.rejects(submit(),/이미 제출/);
  }finally{await db.close();}
});

test('review query reaches older submissions beyond 1000 with global filtering, stable pages and permission checks',async()=>{
  const {db,ids,call,values}=await database();try{
    const mission=await call('save_mission_definition',[ids.admin,randomUUID(),null,null,{...values,form_schema:{}}]);
    await db.query(`insert into mission_submissions(enrollment_id,mission_id,attempt_number,status,reviewed_at,submitted_at)
      select $1,$2,n,'rejected',now(),now()+n*interval '1 second' from generate_series(1,1101) n`,[ids.enrollment,mission.id]);
    const oldest=(await db.query('select id from mission_submissions order by attempt_number limit 1')).rows[0].id;
    await db.query("update mission_submissions set status='submitted',reviewed_at=null where id=$1",[oldest]);
    const queue=(status='',query='',sort='old',page=1,submission=null,actor=ids.staff)=>call('mission_review_queue',[actor,status,query,sort,page,submission]);
    const pending=await queue('submitted');assert.equal(pending.rows[0].id,oldest);assert.equal(pending.pagination.total,1);
    const first=await queue();const next=await queue('','','old',2);
    assert.equal(first.pagination.total,1101);assert.equal(first.rows.length,50);assert.equal(next.rows[0].attempt_number,51);
    assert.equal((await queue('','','new')).rows[0].attempt_number,1101);
    assert.equal((await queue('','missing')).pagination.total,0);
    assert.equal((await queue('','Synthetic member')).pagination.total,1101);
    assert.equal((await queue('','','old',1,oldest)).rows.length,1);
    assert.equal((await queue('','','old',1000)).pagination.page,23);
    for(const actor of [ids.denied,ids.member])await assert.rejects(queue('','','old',1,null,actor),/권한/);
    await db.query("update profiles set status='suspended' where id=$1",[ids.staff]);
    await assert.rejects(queue(),/권한/);
  }finally{await db.close();}
});

test('review API authenticates before query, validates filters, and derives actor on the server',async()=>{
  const load=(path,deps={})=>{const exports={};new Function('exports','require',ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>name in deps?deps[name]:load((name.startsWith('@/')?name.slice(2):posix.normalize(posix.join(posix.dirname(path),name)))+'.ts',deps));return exports;};
  let operator={id:randomUUID()},calls=[];
  const route=load('app/api/mission/reviews/route.ts',{
    '@/lib/server-auth': {},
    '@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'members');return operator;}},
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{rows:[]},error:null};}})},
  });
  const send=query=>route.GET(new Request('https://example.test/api/mission/reviews?'+query));
  for(const query of ['page=-1','page=1.5','page=Infinity','status=deleted','sort=unsafe','submission=bad','query='+ 'a'.repeat(201)])assert.equal((await send(query)).status,400);
  assert.equal(calls.length,0);
  assert.equal((await send('page=2&query=hello&p_actor=spoofed')).status,200);assert.equal(calls[0].args.p_actor,operator.id);assert.equal(calls[0].args.p_page,2);
  operator=null;assert.equal((await send('')).status,403);assert.equal(calls.length,1);
});
