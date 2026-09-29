import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {fixture} from './helpers/lesson-block-review.mjs';
const empty={blocks:{},checklist:[]};
const doc=(track='daily',dayNumber=1)=>({schemaVersion:1,blocks:[],checklist:[],completion:{mode:track==='daily'?'mentor':'self',requireAnswers:false,requireQuizPass:track==='learning'},progression:{track,dayNumber}});
async function setup(){
 const f=await fixture(doc());let setting=null;
 f.gate=async(lesson=f.lesson)=>(await f.db.query('select edu_lesson_progression_gate($1,$2) as result',[f.enrollment,lesson])).rows[0].result;
 f.settings=async(week,request=id(),expected=setting,actor=f.admin)=>{const result=(await f.db.query('select edu_progression_settings($1,$2,$3,$4,$5) as result',[actor,f.cohort,request,expected,week])).rows[0].result;setting=result.writeId;return result;};
 f.add=async(track,day)=>{const lesson=id(),revision=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published) values($1,$2,true)',[lesson,f.week]);await f.db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)',[f.admin,lesson,revision,doc(track,day)]);return{lesson,revision};};
 f.complete=async(lesson=f.lesson,revision=f.revision)=>{const write=id(),request=id();await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,lesson,f.enrollment,revision,write,empty]);return(await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7) as result',[f.student,lesson,f.enrollment,revision,write,request,empty])).rows[0].result;};
 return f;
}
test('source daily auto-approval advances one day at a time, stops at chosen week, and resumes after the operator extends it',async()=>{
 const f=await setup();try{
  const days=[{lesson:f.lesson,revision:f.revision}];for(let n=2;n<=7;n++)days.push(await f.add('daily',n));
  const settings=await f.settings(1);assert.equal(settings.autoApproveThroughWeek,1);
  assert.equal((await f.gate()).isUnlocked,true);assert.equal((await f.gate(days[1].lesson)).isUnlocked,false);assert.match((await f.gate(days[5].lesson)).reason,/공개하지/);
  await assert.rejects(f.complete(days[1].lesson,days[1].revision),/BLOCK_LESSON_LOCKED/);
  for(let n=0;n<5;n++){const r=await f.complete(days[n].lesson,days[n].revision);assert.equal(r.state,'approved');assert.equal(r.approvalKind,'automatic');assert.equal(r.outcome,'submitted');}
  assert.equal((await f.gate(days[5].lesson)).isUnlocked,false);assert.equal((await f.db.query('select count(*)::int as n from lesson_progress')).rows[0].n,5);
  await f.settings(2);assert.equal((await f.gate(days[5].lesson)).isUnlocked,true);await f.complete(days[5].lesson,days[5].revision);
  await f.settings(null);const seventh=await f.complete(days[6].lesson,days[6].revision);assert.equal(seventh.state,'submitted');assert.equal(seventh.approvalKind,null);
  assert.equal((await f.db.query('select count(*)::int as n from lesson_progress')).rows[0].n,6);
  await f.settings(1);assert.equal((await f.gate(days[5].lesson)).isUnlocked,false);assert.equal((await f.db.query('select count(*)::int as n from lesson_progress')).rows[0].n,6);
 }finally{await f.db.close();}
});
test('mentor approval opens next daily mission; learning lessons progress independently and require the immediately previous lesson',async()=>{
 const f=await setup();try{
  const daily2=await f.add('daily',2),learning1=await f.add('learning',1),learning2=await f.add('learning',2),learning3=await f.add('learning',3);
  const pending=await f.complete();assert.equal(pending.state,'submitted');assert.equal((await f.gate(daily2.lesson)).isUnlocked,false);
  assert.equal((await f.gate(learning1.lesson)).isUnlocked,true);assert.equal((await f.gate(learning2.lesson)).isUnlocked,false);
  await assert.rejects(f.complete(learning3.lesson,learning3.revision),/BLOCK_LESSON_LOCKED/);
  await f.complete(learning1.lesson,learning1.revision);assert.equal((await f.gate(learning2.lesson)).isUnlocked,true);assert.equal((await f.gate(daily2.lesson)).isUnlocked,false);
  const approved=(await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6) as r',[f.admin,pending.id,pending.stateId,id(),'approved',''])).rows[0].r;
  assert.equal((await f.gate(daily2.lesson)).isUnlocked,true);await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6)',[f.student,approved.id,approved.stateId,id(),'reopened','']);assert.equal((await f.gate(daily2.lesson)).isUnlocked,true);
  await f.complete(learning2.lesson,learning2.revision);assert.equal((await f.gate(learning3.lesson)).isUnlocked,true);
 }finally{await f.db.close();}
});
test('locked content cannot be read through block RPC, old content, legacy missions or direct authenticated Data API',async()=>{
 const f=await setup();try{
  const day2=await f.add('daily',2);await f.db.query('insert into lesson_contents values($1,$2),($3,$4)',[f.lesson,'first body',day2.lesson,'locked secret']);await f.db.query('insert into curriculum_missions values($1,$2,$3)',[id(),day2.lesson,'locked instructions']);
  await assert.rejects(f.db.query('select edu_read_lesson_blocks($1,$2,$3,null)',[f.student,day2.lesson,f.enrollment]),/BLOCK_LESSON_LOCKED/);
  const list=(await f.db.query('select edu_read_lesson_progression($1,$2) as r',[f.student,f.enrollment])).rows[0].r;assert.equal(list.length,2);assert.equal(list.find(x=>x.lessonId===day2.lesson).isUnlocked,false);assert.doesNotMatch(JSON.stringify(list),/body|instructions|correctIndex/);
  await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[f.student]);await f.db.exec('set role authenticated');
  assert.equal((await f.db.query('select * from lesson_contents')).rows.length,1);assert.equal((await f.db.query('select * from curriculum_missions')).rows.length,0);
  await f.db.exec('set role service_role');await f.settings(1);await f.complete();await f.db.exec('set role authenticated');assert.equal((await f.db.query('select * from lesson_contents')).rows.length,2);assert.equal((await f.db.query('select * from curriculum_missions')).rows.length,1);
  await f.db.exec('set role service_role');await f.db.query("update enrollments set revoked_at=now() where id=$1",[f.enrollment]);await f.db.exec('set role authenticated');assert.equal((await f.db.query('select * from lesson_contents')).rows.length,0);
 }finally{await f.db.close();}
});
test('cohort settings enforce product permissions, compare-and-swap, bounded weeks and same-payload retries',async()=>{
 const f=await setup();try{
  await assert.rejects(f.settings(7),/BLOCK_INVALID/);await assert.rejects(f.settings(1,id(),null,f.student),/BLOCK_FORBIDDEN/);
  const request=id();const result=await f.settings(1,request,null);assert.deepEqual(await f.settings(1,request,null),result);
  await assert.rejects(f.settings(2,request,null),/BLOCK_REQUEST_REUSED/);await assert.rejects(f.settings(2,id(),null),/BLOCK_DRAFT_CHANGED/);
  await f.settings(2);await assert.rejects(f.db.query('select edu_read_lesson_progression($1,$2)',[f.other,f.enrollment]),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated']) assert.equal((await f.db.query('select has_table_privilege($1,$2,$3) as ok',[role,'edu_cohort_progression_settings','UPDATE'])).rows[0].ok,false);
 }finally{await f.db.close();}
});
test('mapping duplicates and invalid progression fail closed, imported opening floor stays capped, and automatic approval can be reopened',async()=>{
 const f=await setup();try{
  await assert.rejects(f.add('daily',1),/BLOCK_PROGRESSION_DUPLICATE/);await assert.rejects(f.add('daily',31),/BLOCK_INVALID/);
  const day6=await f.add('daily',6);await f.db.query('insert into edu_enrollment_progression_grants values($1,6)',[f.enrollment]);assert.equal((await f.gate(day6.lesson)).isUnlocked,true);
  await f.settings(1);assert.equal((await f.gate(day6.lesson)).isUnlocked,false);
  const approved=await f.complete();const reopened=(await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6) as r',[f.student,approved.id,approved.stateId,id(),'reopened',''])).rows[0].r;assert.equal(reopened.state,'reopened');
  assert.equal((await f.db.query('select count(*)::int as n from lesson_progress')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('restoring an archived duplicate blocks ambiguous reads; automatic approvals appear in the approved review queue only',async()=>{
 const f=await setup();try{
  await f.settings(1);await f.complete();
  const approved=(await f.db.query("select edu_list_block_submissions($1,'approved',1) as r",[f.admin])).rows[0].r;
  assert.equal(approved.total,1);assert.equal(approved.rows[0].submission.approvalKind,'automatic');
  assert.equal((await f.db.query("select edu_list_block_submissions($1,'submitted',1) as r",[f.admin])).rows[0].r.total,0);
  await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[f.lesson]);
  const replacement=await f.add('daily',1);assert.equal((await f.gate(replacement.lesson)).isUnlocked,true);
  await f.db.query('update curriculum_lessons set archived_at=null where id=$1',[f.lesson]);
  await assert.rejects(f.gate(replacement.lesson),/BLOCK_PROGRESSION_DUPLICATE/);
  await assert.rejects(f.db.query('select edu_read_lesson_progression($1,$2)',[f.student,f.enrollment]),/BLOCK_PROGRESSION_DUPLICATE/);
 }finally{await f.db.close();}
});
test('separate-learning wrong quiz answers never unlock the next day and database policy cannot lower its pass requirement',async()=>{
 const f=await setup();try{
  const first=await f.add('learning',1),next=await f.add('learning',2),revision=id();
  const document={...doc('learning',1),blocks:[{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'q',prompt:'확인',options:['가','나'],correctIndex:1}]}}]};
  await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,first.lesson,first.revision,revision,document]);
  const bad={blocks:{quiz:{q:0}},checklist:[]},write=id();
  await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,first.lesson,f.enrollment,revision,write,bad]);
  await assert.rejects(f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7)',[f.student,first.lesson,f.enrollment,revision,write,id(),bad]),/BLOCK_QUIZ_NOT_PASSED/);
  assert.equal((await f.gate(next.lesson)).isUnlocked,false);
  for(const invalid of [{...document,completion:{...document.completion,requireQuizPass:false}},{...document,blocks:[{...document.blocks[0],quiz:{...document.blocks[0].quiz,passPercent:50}}]}])await assert.rejects(f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,first.lesson,revision,id(),invalid]),/BLOCK_INVALID/);
  const good={blocks:{quiz:{q:1}},checklist:[]},write2=id();await f.db.query('select edu_save_block_draft($1,$2,$3,$4,$5,$6,$7)',[f.student,first.lesson,f.enrollment,revision,write,write2,good]);await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7)',[f.student,first.lesson,f.enrollment,revision,write2,id(),good]);assert.equal((await f.gate(next.lesson)).isUnlocked,true);
 }finally{await f.db.close();}
});
