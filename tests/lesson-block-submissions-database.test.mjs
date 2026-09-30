import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import {fixture,document,answers} from './helpers/lesson-block-review.mjs';
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
  const legacy=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published,archived_at) select $1,week_id,true,null from curriculum_lessons where id=$2',[legacy,f.lesson]);
  await f.db.exec('set role authenticated');await f.db.query('insert into lesson_progress(enrollment_id,lesson_id,completed_at) values($1,$2,now())',[f.enrollment,legacy]);
 }finally{await f.db.close();}
});
