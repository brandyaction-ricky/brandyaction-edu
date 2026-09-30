import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {fixture,document,answers} from './helpers/lesson-block-review.mjs';
const migration=readFileSync(new URL('../supabase/migrations/20260928184735_ongoing_lesson_periods.sql',import.meta.url),'utf8');
const doc={...document,completion:{mode:'self',requireAnswers:true,requireQuizPass:true}};
async function setup(cadence='daily',input=doc,configure=true){
 const f=await fixture(input);try{await f.db.exec('reset role');await f.db.exec(migration);await f.db.exec('set role service_role');
 const query=async(sql,args)=>(await f.db.query(sql,args)).rows[0]?.result;
 if(configure)await query('select edu_configure_ongoing($1,$2,$3,$4) as result',[f.admin,f.lesson,cadence,id()]);
 const unlock=()=>f.db.query('insert into edu_enrollment_progression_grants values($1,29)',[f.enrollment]);
 const read=(period=null,actor=f.student)=>query('select edu_read_ongoing($1,$2,$3,$4) as result',[actor,f.lesson,f.enrollment,period]);
 const save=async({period,revision=f.revision,expected=null,request=id(),values=answers,actor=f.student}={})=>query('select edu_save_ongoing($1,$2,$3,$4,$5,$6,$7,$8) as result',[actor,f.lesson,f.enrollment,period,revision,expected,request,values]);
 const complete=({period,revision=f.revision,write,request=id(),actor=f.student})=>query('select edu_complete_ongoing($1,$2,$3,$4,$5,$6,$7) as result',[actor,f.lesson,f.enrollment,period,revision,write,request]);
 return {...f,query,unlock,read,save,complete};}catch(error){await f.db.close();throw error;}
}
test('KST daily, Sunday weekly, leap month and year boundaries are exact and timezone independent',async()=>{
 const f=await setup();try{
 const cases=[['daily','2026-09-28T14:59:59Z','2026-09-27T15:00:00.000Z','2026-09-28T15:00:00.000Z'],['daily','2026-09-28T15:00:00Z','2026-09-28T15:00:00.000Z','2026-09-29T15:00:00.000Z'],['weekly','2026-10-03T14:59:59Z','2026-09-26T15:00:00.000Z','2026-10-03T15:00:00.000Z'],['weekly','2026-10-03T15:00:00Z','2026-10-03T15:00:00.000Z','2026-10-10T15:00:00.000Z'],['monthly','2028-02-28T20:00:00Z','2028-01-31T15:00:00.000Z','2028-02-29T15:00:00.000Z'],['monthly','2026-12-31T15:00:00Z','2026-12-31T15:00:00.000Z','2027-01-31T15:00:00.000Z']];
 for(const timezone of ['UTC','America/Los_Angeles']){await f.db.exec(`set timezone='${timezone}'`);for(const [cadence,now,start,end] of cases){const [row]=(await f.db.query('select * from edu_ongoing_period($1,$2)',[cadence,now])).rows;assert.equal(row.starts_at.toISOString(),start);assert.equal(row.ends_at.toISOString(),end);}}
 await assert.rejects(f.db.query('select * from edu_ongoing_period($1,now())',['bad']),/ONGOING_INVALID/);
 }finally{await f.db.close();}
});
test('period answers save, retry and complete once; later edits preserve original completed answers and never alter course progress',async()=>{
 const f=await setup();try{
 await assert.rejects(f.read(),/BLOCK_LESSON_LOCKED/);await f.unlock();const first=await f.read(),period=first.periodStart;assert.equal(first.draft,null);assert.equal(first.completion,null);const request=id();
 const saved=await f.save({period,request});assert.deepEqual(await f.save({period,request}),saved);await assert.rejects(f.save({period,request,values:{blocks:{},checklist:[]}}),/BLOCK_REQUEST_REUSED/);
 await assert.rejects(f.save({period,expected:null}),/BLOCK_DRAFT_CHANGED/);
 const completeId=id(),receipt=await f.complete({period,write:saved.writeId,request:completeId});assert.deepEqual(await f.complete({period,write:saved.writeId,request:completeId}),receipt);await assert.rejects(f.complete({period,write:saved.writeId}),/ONGOING_ALREADY_COMPLETED/);
 const edited={...answers,blocks:{...answers.blocks,q:'완료 후 새 메모'}};await f.save({period,expected:saved.writeId,values:edited});const next=await f.read();assert.equal(next.draft.values.blocks.q,'완료 후 새 메모');assert.equal(next.completion.values.blocks.q,answers.blocks.q);assert.equal(next.history.length,1);
 assert.equal((await f.db.query('select count(*)::int as n from lesson_progress')).rows[0].n,0);
 await assert.rejects(f.draft(),/ONGOING_PERIOD_REQUIRED/);await assert.rejects(f.db.query('select edu_configure_ongoing($1,$2,$3,$4)',[f.admin,f.lesson,'weekly',id()]),/ONGOING_CADENCE_FIXED/);
 }finally{await f.db.close();}
});
test('current round keeps its question version after author edits; future and expired periods cannot receive new writes',async()=>{
 const f=await setup();try{
 await f.unlock();const current=await f.read(),period=current.periodStart;const saved=await f.save({period});
 const revision=id(),changed={...doc,blocks:[{id:'new',type:'text',content:'새 기간 질문'}],checklist:[]};await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,revision,changed]);
 assert.equal((await f.read()).revision,f.revision);assert.deepEqual((await f.read()).document,doc);
 await f.save({period,expected:saved.writeId,values:answers});await assert.rejects(f.save({period,revision,expected:saved.writeId}),/BLOCK_DRAFT_CHANGED|BLOCK_CONTENT_CHANGED/);
 for(const offset of [-86400000,86400000])await assert.rejects(f.save({period:new Date(Date.parse(period)+offset).toISOString()}),/ONGOING_PERIOD_CHANGED/);
 await assert.rejects(f.read('2020-01-01T00:00:00Z'),/BLOCK_NOT_FOUND/);
 const direct=(await f.db.query('select edu_read_lesson_blocks($1,$2,$3,$4) as result',[f.student,f.lesson,f.enrollment,f.revision])).rows[0].result;assert.deepEqual(direct.document,doc);
 }finally{await f.db.close();}
});
test('server enforces required answers, checklist and quiz before credit',async()=>{
 const f=await setup();try{
 await f.unlock();const {periodStart:period}=await f.read();let expected=null;
 for(const [values,error] of [[{blocks:{},checklist:[]},/BLOCK_REQUIREMENTS_MISSING/],[{blocks:{quiz:{a:1}},checklist:['c']},/BLOCK_REQUIREMENTS_MISSING/],[{blocks:{q:'答',quiz:{a:0}},checklist:['c']},/BLOCK_QUIZ_NOT_PASSED/]]){const saved=await f.save({period,expected,values});expected=saved.writeId;await assert.rejects(f.complete({period,write:expected}),error);}
 assert.equal((await f.db.query('select count(*)::int as n from edu_ongoing_completions')).rows[0].n,0);
 }finally{await f.db.close();}
});
test('enrollment ownership, revocation, active profiles and public table/function permissions are enforced',async()=>{
 const f=await setup();try{
 await f.unlock();const {periodStart:period}=await f.read();await assert.rejects(f.read(null,f.other),/BLOCK_FORBIDDEN/);await assert.rejects(f.save({period,actor:f.other}),/BLOCK_FORBIDDEN/);
 await f.db.query("update profiles set status='inactive' where id=$1",[f.student]);await assert.rejects(f.read(),/BLOCK_FORBIDDEN/);await f.db.query("update profiles set status='active' where id=$1",[f.student]);
 await f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]);await assert.rejects(f.read(),/BLOCK_FORBIDDEN/);
 for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.read(),/permission denied/);for(const table of ['edu_ongoing_rules','edu_ongoing_rounds','edu_ongoing_writes','edu_ongoing_completions'])await assert.rejects(f.db.query('select * from '+table),/permission denied/);}
 }finally{await f.db.close();}
});

test('previous periods retain answers and paginate without loss while a new period starts empty',async()=>{
 const f=await setup();try{
  await f.unlock();const current=await f.read(),start=current.periodStart;
  await f.db.query(`insert into edu_ongoing_rounds(enrollment_id,lesson_id,period_start,period_end,revision,values,write_id)
   select $1,$2,$3::timestamptz-n*interval '1 day',$3::timestamptz-(n-1)*interval '1 day',$4,$5,gen_random_uuid() from generate_series(1,105) n`,[f.enrollment,f.lesson,start,f.revision,answers]);
  const first=await f.read();assert.equal(first.draft,null);assert.equal(first.history.length,100);
  const history=await f.query('select edu_ongoing_history($1,$2,$3,null) as result',[f.student,f.lesson,f.enrollment]);assert.equal(history.items.length,100);assert.ok(history.nextBefore);
  const rest=await f.query('select edu_ongoing_history($1,$2,$3,$4) as result',[f.student,f.lesson,f.enrollment,history.nextBefore]);assert.equal(rest.items.length,5);assert.equal(rest.nextBefore,null);
  assert.equal(new Set([...history.items,...rest.items].map(x=>x.periodStart)).size,105);
  const past=await f.read(rest.items.at(-1).periodStart);assert.deepEqual(past.draft.values,answers);assert.notEqual(past.periodStart,past.currentPeriodStart);
  await assert.rejects(f.save({period:past.periodStart,expected:past.draft.writeId}),/ONGOING_PERIOD_CHANGED/);
  await assert.rejects(f.complete({period:past.periodStart,write:past.draft.writeId}),/ONGOING_PERIOD_CHANGED/);
  await f.db.query(`insert into edu_ongoing_completions(id,enrollment_id,lesson_id,period_start,revision,write_id,values,assessment)
    select gen_random_uuid(),enrollment_id,lesson_id,period_start,revision,write_id,values,'{}'::jsonb from edu_ongoing_rounds where period_start=$1`,[past.periodStart]);
  assert.deepEqual((await f.read()).stats,{completed:1,opportunities:106,rate:1});
  await assert.rejects(f.query('select edu_ongoing_history($1,$2,$3,null) as result',[f.other,f.lesson,f.enrollment]),/BLOCK_FORBIDDEN/);
 }finally{await f.db.close();}
});
test('weekly and monthly achievement counts calendar periods rather than elapsed hours',async()=>{
 for(const cadence of ['weekly','monthly']){
 const f=await setup(cadence);try{
  await f.unlock();const current=await f.read();
  await f.db.query(`insert into edu_ongoing_rounds(enrollment_id,lesson_id,period_start,period_end,revision,values,write_id)
   values($1,$2,$3::timestamptz-$6::interval,$3,$4,$5,gen_random_uuid())`,[f.enrollment,f.lesson,current.periodStart,f.revision,answers,cadence==='weekly'?'7 days':'1 month']);
  await f.db.exec(`insert into edu_ongoing_completions(id,enrollment_id,lesson_id,period_start,revision,write_id,values,assessment)
   select gen_random_uuid(),enrollment_id,lesson_id,period_start,revision,write_id,values,'{}'::jsonb from edu_ongoing_rounds`);
  assert.deepEqual((await f.read()).stats,{completed:1,opportunities:2,rate:50});
  const write=await f.save({period:current.periodStart});await f.complete({period:current.periodStart,write:write.writeId});assert.deepEqual((await f.read()).stats,{completed:2,opportunities:2,rate:100});
 }finally{await f.db.close();}}
});
test('only authors configure unused self-completed lessons and cross-product moves are blocked',async()=>{
 const f=await setup('daily',doc,false);try{
  await assert.rejects(f.query('select edu_ongoing_settings($1,$2) as result',[f.student,f.lesson]),/BLOCK_FORBIDDEN/);
  assert.equal(await f.query('select edu_ongoing_settings($1,$2) as result',[f.admin,f.lesson]),null);
  await f.draft();await assert.rejects(f.query('select edu_configure_ongoing($1,$2,$3,$4) as result',[f.admin,f.lesson,'daily',id()]),/ONGOING_EXISTING_RECORDS/);
 }finally{await f.db.close();}
 const g=await setup();try{
  assert.equal((await g.query('select edu_ongoing_settings($1,$2) as result',[g.admin,g.lesson])).cadence,'daily');
  const otherCourse=id(),otherWeek=id(),sameWeek=id();await g.db.query('insert into courses(id) values($1)',[otherCourse]);await g.db.query('insert into curriculum_weeks values($1,$2,true,null),($3,$4,true,null)',[otherWeek,otherCourse,sameWeek,g.course]);
  await assert.rejects(g.db.query('update curriculum_lessons set week_id=$1 where id=$2',[otherWeek,g.lesson]),/ONGOING_COURSE_FIXED/);
  await assert.rejects(g.db.query('update curriculum_weeks set course_id=$1 where id=$2',[otherCourse,g.week]),/ONGOING_COURSE_FIXED/);
  await g.db.query('update curriculum_lessons set week_id=$1 where id=$2',[sameWeek,g.lesson]);
  for(const invalid of [{...doc,progression:{track:'learning',dayNumber:1}},{...doc,completion:{...doc.completion,mode:'mentor'}}])await assert.rejects(g.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[g.admin,g.lesson,g.revision,id(),invalid]),/ONGOING_INVALID/);
 }finally{await g.db.close();}
});
test('ongoing attachments require the owned ready file and remain uploadable on the pinned question version',async()=>{
 const mediaDoc={...doc,blocks:[{id:'proof',type:'question',question:{label:'실행 이미지',kind:'image',required:true}}],checklist:[]};
 const f=await setup('daily',mediaDoc);try{
  await f.unlock();const {periodStart:period}=await f.read();
  const prepare=async()=>(await f.db.query('select edu_prepare_answer_file($1,$2,$3,$4,$5,$6,$7) as result',[f.student,f.lesson,f.enrollment,f.revision,'proof',id(),{name:'기록.png',kind:'image',extension:'png',contentType:'image/png',size:20}])).rows[0].result;
  const file=await prepare(),values={blocks:{proof:{imageId:file.id}},checklist:[]};
  await assert.rejects(f.save({period,values}),/BLOCK_FILE_INVALID/);await f.db.query('select edu_complete_answer_file($1,$2,$3)',[f.student,file.id,'a'.repeat(64)]);
  const write=await f.save({period,values});await f.complete({period,write:write.writeId});
  const revision=id();await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,revision,{...mediaDoc,blocks:[{id:'new',type:'text',content:'새 기간 질문'}]}]);
  assert.ok((await prepare()).id); // Current period is still tied to the earlier questions.
  await assert.rejects(f.save({period,expected:write.writeId,values:{blocks:{proof:{imageId:id()}},checklist:[]}}),/BLOCK_FILE_INVALID/);
  await assert.rejects(f.db.query('select edu_read_answer_file($1,$2,null)',[f.other,file.id]),/BLOCK_FORBIDDEN/);
  assert.equal((await f.query('select edu_read_answer_file($1,$2,null) as result',[f.student,file.id])).id,file.id);
 }finally{await f.db.close();}
});
test('the actual approved day 28 record unlocks ongoing practice without an artificial open-through grant',async()=>{
 const f=await setup();try{
  const daily=id(),revision=id(),write=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published) values($1,$2,true)',[daily,f.week]);
  await f.db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)',[f.admin,daily,revision,{...doc,progression:{track:'daily',dayNumber:28},completion:{mode:'mentor',requireAnswers:true,requireQuizPass:true}}]);
  await f.db.query('insert into edu_enrollment_progression_grants values($1,28)',[f.enrollment]);await assert.rejects(f.read(),/BLOCK_LESSON_LOCKED/);
  await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,daily,f.enrollment,revision,write,answers]);
  const submitted=await f.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7) as result',[f.student,daily,f.enrollment,revision,write,id(),answers]);
  await assert.rejects(f.read(),/BLOCK_LESSON_LOCKED/);
  await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6)',[f.admin,submitted.id,submitted.stateId,id(),'approved','확인 완료']);
  assert.equal((await f.read()).cadence,'daily');
 }finally{await f.db.close();}
});
