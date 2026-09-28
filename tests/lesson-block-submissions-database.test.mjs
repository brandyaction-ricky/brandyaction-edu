import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const root=new URL('../supabase/migrations/',import.meta.url);
const base=fs.readFileSync(new URL('20260928141603_lesson_block_documents_and_drafts.sql',root),'utf8');
const migration=fs.readFileSync(new URL('20260928155416_lesson_block_submissions_and_completion.sql',root),'utf8');
const document={schemaVersion:1,blocks:[{id:'q',type:'question',question:{label:'필수 질문',kind:'text',required:true}},{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'a',prompt:'확인',options:['가','나'],correctIndex:1}]}}],checklist:[{id:'c',label:'실행 확인',required:true}]};
const answers={blocks:{q:'나의 답변',quiz:{a:1}},checklist:['c']};
async function fixture(doc=document){
 const db=new PGlite(),admin=id(),student=id(),other=id(),course=id(),week=id(),lesson=id(),enrollment=id(),revision=id();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table profiles(id uuid primary key,role text,status text);
 create table site_settings(key text primary key,value jsonb);
 create table courses(id uuid primary key,archived_at timestamptz);
 create table curriculum_weeks(id uuid primary key,course_id uuid references courses,is_published boolean,archived_at timestamptz);
 create table curriculum_lessons(id uuid primary key,week_id uuid references curriculum_weeks,is_published boolean,archived_at timestamptz);
 create table enrollments(id uuid primary key,user_id uuid references profiles,course_id uuid references courses,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
 create table lesson_progress(id uuid primary key default gen_random_uuid(),enrollment_id uuid references enrollments,lesson_id uuid references curriculum_lessons,progress_percent integer not null default 0,completed_at timestamptz,updated_at timestamptz default now(),unique(enrollment_id,lesson_id));
 grant select,insert,update on all tables in schema public to service_role;
 grant select,insert,update on lesson_progress to authenticated;`);
 await db.exec(base);await db.exec(migration);
 await db.query("insert into profiles values($1,'admin','active'),($2,'member','active'),($3,'member','active')",[admin,student,other]);
 await db.query('insert into courses(id) values($1)',[course]);await db.query('insert into curriculum_weeks values($1,$2,true,null)',[week,course]);await db.query('insert into curriculum_lessons values($1,$2,true,null)',[lesson,week]);
 await db.query("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null)",[enrollment,student,course]);
 await db.exec('set role service_role');
 await db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)',[admin,lesson,revision,doc]);
 let currentWrite=null;
 const draft=async(values=answers)=>{const write=id();await db.query('select edu_save_block_draft($1,$2,$3,$4,$5,$6,$7)',[student,lesson,enrollment,revision,currentWrite,write,values]);currentWrite=write;return write;};
 const submit=async(request=id(),values=answers,actor=student,write=currentWrite)=>(await db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7) as receipt',[actor,lesson,enrollment,revision,write,request,values])).rows[0].receipt;
 return{db,admin,student,other,lesson,enrollment,revision,draft,submit,getWrite:()=>currentWrite};
}
test('submission atomically preserves the acknowledged answers, grades and progress; repeated requests cannot duplicate or overwrite',async()=>{
 const f=await fixture();const {db}=f;
 try{
  const write=await f.draft(),request=id();
  await assert.rejects(f.submit(request,answers,f.other),/BLOCK_FORBIDDEN/);
  await assert.rejects(f.submit(request,answers,f.student,id()),/BLOCK_DRAFT_CHANGED/);
  await assert.rejects(f.submit(request,{...answers,blocks:{q:'tampered'}}),/BLOCK_DRAFT_CHANGED/);
  const receipt=await f.submit(request);assert.equal(receipt.outcome,'completed');assert.equal(receipt.writeId,write);assert.equal(receipt.assessment.quizzes[0].correct,1);assert.doesNotMatch(JSON.stringify(receipt),/correctIndex|나의 답변/);
  assert.deepEqual(await f.submit(request),receipt);assert.deepEqual(await f.submit(id()),receipt);
  await assert.rejects(f.submit(request,{...answers,checklist:[]}),/BLOCK_REQUEST_REUSED/);
  const progress=(await db.query('select * from lesson_progress')).rows;assert.equal(progress.length,1);assert.equal(progress[0].progress_percent,100);assert.ok(progress[0].completed_at);
  assert.equal((await db.query('select count(*)::int as n from edu_lesson_block_submissions')).rows[0].n,1);
  await assert.rejects(f.draft({...answers,blocks:{q:'later'}}),/BLOCK_ALREADY_SUBMITTED/);
  const read=(await db.query('select edu_read_lesson_blocks($1,$2,$3,null) as value',[f.student,f.lesson,f.enrollment])).rows[0].value;assert.deepEqual(read.submission,receipt);assert.deepEqual(read.draft.values,answers);
  await db.query("update enrollments set status='refunded' where id=$1",[f.enrollment]);await assert.rejects(f.submit(request),/BLOCK_FORBIDDEN/);
 }finally{await db.close();}
});
test('database rejects bypassed requirements and direct legacy progress writes, and detects a changed lesson or draft',async()=>{
 const f=await fixture();const {db}=f;
 try{
  for(const values of [{...answers,checklist:[]},{...answers,blocks:{q:'  ',quiz:{a:1}}},{...answers,blocks:{q:'x',quiz:{a:0}}}]){
   await f.draft(values);await assert.rejects(f.submit(id(),values),/BLOCK_REQUIREMENTS_MISSING|BLOCK_QUIZ_NOT_PASSED/);
  }
  await db.exec('set role authenticated');
  await assert.rejects(db.query('insert into lesson_progress(enrollment_id,lesson_id,progress_percent,completed_at) values($1,$2,100,now())',[f.enrollment,f.lesson]),/BLOCK_COMPLETION_REQUIRED/);
  await db.query('insert into lesson_progress(enrollment_id,lesson_id,progress_percent) values($1,$2,20)',[f.enrollment,f.lesson]);
  await assert.rejects(db.query('update lesson_progress set progress_percent=100 where lesson_id=$1',[f.lesson]),/BLOCK_COMPLETION_REQUIRED/);
  await db.exec('set role service_role');
  const stale=await f.draft();await f.draft({...answers,blocks:{...answers.blocks,q:'other tab'}});
  await assert.rejects(f.submit(id(),answers,f.student,stale),/BLOCK_DRAFT_CHANGED/);
  await db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,id(),document]);
  await assert.rejects(f.submit(),/BLOCK_CONTENT_CHANGED/);
  assert.equal((await db.query('select count(*)::int as n from edu_lesson_block_submissions')).rows[0].n,0);
 }finally{await db.close();}
});
test('daily checklist-only submission waits for mentor and never gives progress or bypasses private-table permissions',async()=>{
 const f=await fixture({...document,completion:{mode:'mentor',requireAnswers:false,requireQuizPass:false}}),values={blocks:{},checklist:['c']};
 try{
  await f.draft(values);const receipt=await f.submit(id(),values);assert.equal(receipt.outcome,'submitted');assert.equal(receipt.assessment.quizzes[0].passed,false);
  assert.equal((await f.db.query('select count(*)::int as n from lesson_progress')).rows[0].n,0);
  await assert.rejects(f.db.query('insert into lesson_progress(enrollment_id,lesson_id,completed_at) values($1,$2,now())',[f.enrollment,f.lesson]),/BLOCK_COMPLETION_REQUIRED/);
  await assert.rejects(f.db.query("update edu_lesson_block_submissions set outcome='completed' where id=$1",[receipt.id]),/permission denied/);
  for(const role of ['anon','authenticated']){
   for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await f.db.query('select has_table_privilege($1,$2,$3) as ok',[role,'edu_lesson_block_submissions',privilege])).rows[0].ok,false);
   assert.equal((await f.db.query("select has_function_privilege($1,'edu_submit_lesson_blocks(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)','EXECUTE') as ok",[role])).rows[0].ok,false);
  }
 }finally{await f.db.close();}
});
test('content-only completion records an empty saved draft and legacy lessons remain usable',async()=>{
 const f=await fixture({schemaVersion:1,blocks:[],checklist:[]}),values={blocks:{},checklist:[]};
 try{
  await f.draft(values);assert.equal((await f.submit(id(),values)).outcome,'completed');
  const legacy=id();await f.db.query('insert into curriculum_lessons select $1,week_id,true,null from curriculum_lessons where id=$2',[legacy,f.lesson]);
  await f.db.exec('set role authenticated');await f.db.query('insert into lesson_progress(enrollment_id,lesson_id,completed_at) values($1,$2,now())',[f.enrollment,legacy]);
 }finally{await f.db.close();}
});
