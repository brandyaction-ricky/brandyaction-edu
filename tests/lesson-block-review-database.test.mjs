import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { fixture, document, answers } from './helpers/lesson-block-review.mjs';
const mentor={...document,completion:{mode:'mentor',requireAnswers:true,requireQuizPass:true}};
async function start(){const f=await fixture(mentor);await f.draft();f.initial=await f.submit();f.decide=async(s=f.initial,decision='approved',feedback='',actor=f.admin,request=id(),expected=s.stateId)=>(await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6) as result',[actor,s.id,expected,request,decision,feedback])).rows[0].result;f.read=async(actor=f.student,enroll=f.enrollment)=>(await f.db.query('select edu_read_lesson_blocks($1,$2,$3,null) as result',[actor,f.lesson,enroll])).rows[0].result;return f;}
test('mentor decision is immutable, credits progress once, and checks current-state token and request identity',async()=>{
 const f=await start();try{
  assert.equal(f.initial.state,'submitted');await assert.rejects(f.decide(undefined,'approved','',f.other),/BLOCK_FORBIDDEN/);
  await assert.rejects(f.decide(undefined,'approved','',f.admin,id(),id()),/BLOCK_REVIEW_CHANGED/);
  const request=id(),r=await f.decide(undefined,'approved','잘 실행했습니다.',f.admin,request);assert.equal(r.state,'approved');assert.equal(r.stateId,request);
  const progress=(await f.db.query('select * from lesson_progress')).rows[0];assert.equal(progress.progress_percent,100);
  assert.deepEqual(await f.decide(undefined,'approved','잘 실행했습니다.',f.admin,request),r);
  await assert.rejects(f.decide(undefined,'changes_requested','다르게 작성해 주세요.'),/BLOCK_REVIEW_CHANGED/);
  await assert.rejects(f.decide(undefined,'approved','변경 피드백',f.admin,request),/BLOCK_REQUEST_REUSED/);
  assert.equal((await f.db.query('select count(*)::int as n from edu_lesson_block_reviews')).rows[0].n,1);
  assert.equal((await f.read()).submission.state,'approved');
  await assert.rejects(f.db.query("update edu_lesson_block_reviews set feedback='overwrite'"),/permission denied/);
  await assert.rejects(f.db.query('delete from edu_lesson_block_submissions'),/permission denied/);
 }finally{await f.db.close();}
});
test('revision request unlocks a fresh draft token, retains old answers, and resubmits a new immutable attempt',async()=>{
 const f=await start();try{
  await assert.rejects(f.decide(undefined,'changes_requested',' \n '),/BLOCK_INVALID/);
  const request=id();await f.decide(undefined,'changes_requested','고객 사례를 추가해 주세요.',f.admin,request);
  await assert.rejects(f.draft({...answers,blocks:{...answers.blocks,q:'old tab overwrite'}}),/BLOCK_DRAFT_CHANGED/);
  const read=await f.read();assert.equal(read.draft.writeId,request);assert.deepEqual(read.draft.values,answers);f.setWrite(read.draft.writeId);
  const revised={...answers,blocks:{...answers.blocks,q:'수정한 답변'}};await f.draft(revised);const second=await f.submit(id(),revised);assert.notEqual(second.id,f.initial.id);assert.equal(second.state,'submitted');
  await assert.rejects(f.decide(f.initial,'approved','',f.admin,id(),request),/BLOCK_REVIEW_CHANGED/);
  const history=(await f.db.query('select edu_read_block_submission($1,$2,$3) as result',[f.student,f.initial.id,f.enrollment])).rows[0].result;
  assert.equal(history.isLatest,false);assert.equal(history.previousSubmissions[0].id,second.id);assert.equal(history.lessonTitle,'시험 수업');assert.deepEqual(history.values,answers);assert.equal(history.history[0].feedback,'고객 사례를 추가해 주세요.');
  assert.equal((await f.read()).submissions.length,2);await f.decide(second);assert.equal((await f.read()).submission.state,'approved');
 }finally{await f.db.close();}
});
test('learner can reopen pending or approved work without erasing earned completion; stale decisions fail',async()=>{
 const f=await start();try{
  const approved=await f.decide(),before=(await f.db.query('select completed_at from lesson_progress')).rows[0].completed_at;
  const request=id(),reopened=await f.decide(approved,'reopened','',f.student,request);assert.equal(reopened.state,'reopened');
  assert.deepEqual(await f.decide(approved,'reopened','',f.student,request),reopened);
  assert.equal((await f.db.query('select completed_at from lesson_progress')).rows[0].completed_at.getTime(),before.getTime());
  const read=await f.read();f.setWrite(read.draft.writeId);const second=await f.submit();assert.notEqual(second.id,approved.id);
  await f.decide(second,'reopened','',f.student);await assert.rejects(f.decide(second),/BLOCK_REVIEW_CHANGED/);
  await assert.rejects(f.decide(second,'reopened','',f.other),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});
test('review scope, inactive actors, entitlement revocation, self-completion and private records are enforced in the DB',async()=>{
 const f=await start();try{
  const staff=id();await f.db.query("insert into profiles(id,role,status) values($1,'staff','active')",[staff]);
  await f.db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{products:true,members:false}]);
  await assert.rejects(f.decide(undefined,'approved','',staff),/BLOCK_FORBIDDEN/);
  await f.db.query('update site_settings set value=$1 where key=$2',[{members:true},'edu_staff_permissions_'+staff]);
  await f.db.query("update profiles set status='inactive' where id=$1",[staff]);await assert.rejects(f.decide(undefined,'approved','',staff),/BLOCK_FORBIDDEN/);
  await f.db.query("update profiles set status='active' where id=$1",[staff]);
  await f.db.query("update enrollments set status='refunded' where id=$1",[f.enrollment]);await assert.rejects(f.decide(undefined,'approved','',staff),/BLOCK_FORBIDDEN/);
  await f.db.query("update enrollments set status='active' where id=$1",[f.enrollment]);await f.decide(undefined,'approved','',staff);
  await assert.rejects(f.db.query('select edu_read_block_submission($1,$2,$3)',[f.other,f.initial.id,f.enrollment]),/BLOCK_FORBIDDEN/);
  await assert.rejects(f.db.query('select edu_read_block_submission($1,$2,null)',[f.student,f.initial.id]),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated']){
   for(const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal((await f.db.query('select has_table_privilege($1,$2,$3) as ok',[role,'edu_lesson_block_reviews',privilege])).rows[0].ok,false);
   for(const fn of ['edu_decide_lesson_blocks(uuid,uuid,uuid,uuid,text,text)','edu_read_block_submission(uuid,uuid,uuid)','edu_list_block_submissions(uuid,text,integer)'])assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) as ok',[role,fn,'EXECUTE'])).rows[0].ok,false);
  }
 }finally{await f.db.close();}
 const self=await fixture();try{await self.draft();const s=await self.submit();await assert.rejects(self.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6)',[self.admin,s.id,s.stateId,id(),'approved','']),/BLOCK_REVIEW_CHANGED/);}finally{await self.db.close();}
});
test('review queue filters latest attempts, pages deterministically, and never includes draft answers or private answer keys',async()=>{
 const f=await start();try{
  await f.decide(undefined,'changes_requested','보완');const r=await f.read();f.setWrite(r.draft.writeId);await f.submit();
  for(let i=0;i<21;i++){
   const enrollment=id(),write=id();await f.db.query('insert into enrollments select $1,user_id,course_id,status,revoked_at,access_starts_at,access_ends_at from enrollments where id=$2',[enrollment,f.enrollment]);
   await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,f.lesson,enrollment,f.revision,write,answers]);
   await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7)',[f.student,f.lesson,enrollment,f.revision,write,id(),answers]);
  }
  const list=async(state,page)=>(await f.db.query('select edu_list_block_submissions($1,$2,$3) as result',[f.admin,state,page])).rows[0].result;
  const first=await list('submitted',1),second=await list('submitted',2);assert.equal(first.total,22);assert.equal(first.rows.length,20);assert.equal(second.rows.length,2);
  assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,22);assert.equal((await list('changes_requested',1)).total,0);
  assert.doesNotMatch(JSON.stringify(first),/correctIndex|나의 답변|values/);
  await assert.rejects(f.db.query('select edu_list_block_submissions($1,$2,$3)',[f.student,'',1]),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});
