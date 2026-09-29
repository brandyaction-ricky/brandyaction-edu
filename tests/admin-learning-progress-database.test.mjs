import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture } from './helpers/lesson-block-review.mjs';
const migration=fs.readFileSync(new URL('../supabase/migrations/20260928224050_admin_learning_search_and_progress.sql',import.meta.url),'utf8');
const doc=(track='daily',day=1)=>({schemaVersion:1,blocks:[{id:'q',type:'text',content:'비공개 원문'}],checklist:[],progression:{track,dayNumber:day},completion:{mode:track==='daily'?'mentor':'self',requireAnswers:false,requireQuizPass:track==='learning'}});
const values={blocks:{},checklist:[]};
async function setup(){
 const f=await fixture(doc());
 await f.db.exec('reset role; alter table profiles add column email text; alter table profiles add column phone text; alter table cohorts add column name text; alter table curriculum_lessons add column day_number integer; set role service_role;');
 await f.db.query('update profiles set full_name=$1,email=$2,phone=$3 where id=$4',['시험 100% 회원','learner@example.test','01000000001',f.student]);
 await f.db.query('update cohorts set name=$1 where id=$2',['가상 기수',f.cohort]);
 await f.db.exec('reset role');await f.db.exec(migration);await f.db.exec('set role service_role');
 f.search=async(p={})=>(await f.db.query('select edu_search_block_submissions($1,$2,$3,$4,$5,$6,$7,$8) as r',[p.actor||f.admin,p.state??'',p.page??1,p.query??'',p.track??'',p.day??null,p.sort??'latest',p.member??null])).rows[0].r;
 f.progress=async(p={})=>(await f.db.query('select edu_admin_learning_progress($1,$2,$3,$4,$5) as r',[p.actor||f.admin,p.member??null,p.query??'',p.page??1,p.cohort??null])).rows[0].r;
 f.add=async(track,day)=>{const lesson=id(),revision=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published,day_number) values($1,$2,true,$3)',[lesson,f.week,day+100]);await f.db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)',[f.admin,lesson,revision,doc(track,day)]);return{lesson,revision};};
 f.send=async(lesson=f.lesson,revision=f.revision,enrollment=f.enrollment)=>{const write=id();await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,lesson,enrollment,revision,write,values]);return(await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7) as r',[f.student,lesson,enrollment,revision,write,id(),values])).rows[0].r;};
 f.approve=async(s)=>(await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6) as r',[f.admin,s.id,s.stateId,id(),'approved','확인'])).rows[0].r;
 return f;
}
test('submission search uses names/email/phone/id literally and the submitted version for day filters',async()=>{
 const f=await setup();try{
  const submitted=await f.send();const learning=await f.add('learning',1);await f.send(learning.lesson,learning.revision);
  for(const query of ['100%','learner@','00000001',f.student])assert.equal((await f.search({query})).total,2);
  assert.equal((await f.search({query:'_'})).total,0);assert.equal((await f.search({member:id()})).total,0);
  assert.equal((await f.search({state:'completed',track:'learning',day:1})).total,1);
  assert.equal((await f.search({state:'submitted',track:'daily',day:1})).total,1);
  await f.db.query('select edu_save_lesson_blocks($1,$2,$3,$4,$5)',[f.admin,f.lesson,f.revision,id(),doc('daily',2)]);
  const result=await f.search({day:1,track:'daily'});assert.equal(result.rows[0].id,submitted.id);assert.equal(result.rows[0].dayNumber,1);
  assert.equal((await f.search({day:2,track:'daily'})).total,0);
  assert.doesNotMatch(JSON.stringify(result),/비공개 원문|correctIndex|01000000001|document|values/);
 }finally{await f.db.close();}
});
test('latest attempts are selected before status filtering and search spans all pages in stable order',async()=>{
 const f=await setup();try{
  const first=await f.send();await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6)',[f.admin,first.id,first.stateId,id(),'changes_requested','보완']);
  const current=(await f.db.query('select edu_read_lesson_blocks($1,$2,$3,null) as r',[f.student,f.lesson,f.enrollment])).rows[0].r;
  const write=id();await f.db.query('select edu_save_block_draft($1,$2,$3,$4,$5,$6,$7)',[f.student,f.lesson,f.enrollment,f.revision,current.draft.writeId,write,values]);
  const latest=(await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7) as r',[f.student,f.lesson,f.enrollment,f.revision,write,id(),values])).rows[0].r;
  for(let i=0;i<22;i++){const enrollment=id();await f.db.query('insert into enrollments select $1,user_id,course_id,status,revoked_at,access_starts_at,access_ends_at,cohort_id from enrollments where id=$2',[enrollment,f.enrollment]);await f.send(f.lesson,f.revision,enrollment);}
  assert.equal((await f.search({state:'changes_requested'})).total,0);
  const a=await f.search({query:'learner',page:1}),b=await f.search({query:'learner',page:2});assert.equal(a.total,23);assert.equal(a.rows.length,20);assert.equal(b.rows.length,3);
  assert.equal(new Set([...a.rows,...b.rows].map(r=>r.id)).size,23);assert.equal(b.rows.at(-1).id,latest.id);
  assert.equal((await f.search({sort:'oldest'})).rows[0].id,latest.id);assert.deepEqual(await f.search({sort:'day_asc'}),await f.search({sort:'day_desc'}));
  assert.equal((await f.search({page:999})).total,23);assert.equal((await f.search({page:999})).rows.length,0);
 }finally{await f.db.close();}
});
test('operator progress separates both tracks and follows actual approval/access gates per enrollment',async()=>{
 const f=await setup();try{
  const daily2=await f.add('daily',2),learning=await f.add('learning',1);await f.send(learning.lesson,learning.revision);
  let row=(await f.progress()).rows[0];assert.deepEqual(row.tracks.map(t=>[t.track,t.completed,t.total,t.nextDay]),[['daily',0,2,1],['learning',1,1,null]]);
  await f.approve(await f.send());row=(await f.progress()).rows[0];assert.equal(row.tracks[0].nextDay,2);assert.equal(row.tracks[1].finished,true);
  const other=id();await f.db.query('insert into enrollments select $1,user_id,course_id,status,revoked_at,access_starts_at,access_ends_at,cohort_id from enrollments where id=$2',[other,f.enrollment]);
  const result=await f.progress({member:f.student,cohort:f.cohort});assert.equal(result.total,2);assert.equal(result.rows.find(r=>r.enrollmentId===other).tracks[0].completed,0);
  await f.db.query("update enrollments set status='revoked' where id=$1",[f.enrollment]);assert.equal((await f.progress()).total,1);
  const inactive=(await f.progress({member:f.student})).rows.find(r=>r.enrollmentId===f.enrollment);assert.equal(inactive.accessActive,false);assert.equal(inactive.tracks[0].nextDay,null);assert.equal(inactive.tracks[0].completed,1);
  assert.equal((await f.progress({query:'not found'})).total,0);assert.equal((await f.progress({cohort:id()})).total,0);
  await f.db.query('update curriculum_lessons set is_published=false where id=$1',[daily2.lesson]);assert.equal((await f.progress()).rows[0].tracks[0].total,1);
 }finally{await f.db.close();}
});
test('week caps report waiting and ambiguous track mappings never present invented zero progress',async()=>{
 const f=await setup();try{
  for(let day=1;day<=5;day++){const l=day===1?f:await f.add('daily',day);await f.approve(await f.send(l.lesson,l.revision));}
  await f.add('daily',6);await f.db.query('select edu_progression_settings($1,$2,$3,null,1)',[f.admin,f.cohort,id()]);
  let track=(await f.progress()).rows[0].tracks[0];assert.equal(track.completed,5);assert.equal(track.total,6);assert.equal(track.currentDay,6);assert.equal(track.nextDay,null);assert.equal(track.waiting,true);
  await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[f.lesson]);await f.add('daily',1);await f.db.query('update curriculum_lessons set archived_at=null where id=$1',[f.lesson]);
  const row=(await f.progress()).rows[0];assert.equal(row.status,'error');assert.deepEqual(row.tracks,[]);
 }finally{await f.db.close();}
});
test('new read functions enforce members permission, input bounds and service-only execution',async()=>{
 const f=await setup();try{
  await assert.rejects(f.search({actor:f.student}),/BLOCK_FORBIDDEN/);await assert.rejects(f.progress({actor:f.student}),/BLOCK_FORBIDDEN/);
  for(const params of [{page:0},{page:100001},{query:'x'.repeat(101)},{track:'fake'},{day:-1},{day:31},{sort:'sql;'}])await assert.rejects(f.search(params),/BLOCK_INVALID/);
  for(const params of [{page:0},{query:'x'.repeat(101)}])await assert.rejects(f.progress(params),/BLOCK_INVALID/);
  const staff=id();await f.db.query("insert into profiles(id,role,status) values($1,'staff','active')",[staff]);await assert.rejects(f.progress({actor:staff}),/BLOCK_FORBIDDEN/);
  await f.db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{members:true}]);assert.equal((await f.progress({actor:staff})).total,1);
  await f.db.query("update profiles set status='inactive' where id=$1",[staff]);await assert.rejects(f.search({actor:staff}),/BLOCK_FORBIDDEN/);
  for(const role of ['anon','authenticated'])for(const fn of ['edu_search_block_submissions(uuid,text,integer,text,text,integer,text,uuid)','edu_admin_learning_progress(uuid,uuid,text,integer,uuid)'])assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) as allowed',[role,fn,'execute'])).rows[0].allowed,false);
 }finally{await f.db.close();}
});
test('day sorting changes actual mixed-day order, while progress pages retain totals and independent member scope',async()=>{
 const f=await setup();try{
  const first=await f.send();await f.approve(first);const second=await f.add('daily',2);const submitted=await f.send(second.lesson,second.revision);
  assert.deepEqual((await f.search({sort:'day_asc'})).rows.map(r=>r.dayNumber),[1,2]);assert.deepEqual((await f.search({sort:'day_desc'})).rows.map(r=>r.dayNumber),[2,1]);
  assert.equal((await f.search({day:2})).rows[0].id,submitted.id);
  for(let n=0;n<21;n++){const enrollment=id();await f.db.query('insert into enrollments select $1,user_id,course_id,status,revoked_at,access_starts_at,access_ends_at,cohort_id from enrollments where id=$2',[enrollment,f.enrollment]);}
  const firstPage=await f.progress(),secondPage=await f.progress({page:2});assert.equal(firstPage.total,22);assert.equal(firstPage.rows.length,20);assert.equal(secondPage.rows.length,2);assert.equal(new Set([...firstPage.rows,...secondPage.rows].map(r=>r.enrollmentId)).size,22);
  assert.equal((await f.progress({page:99})).total,22);assert.equal((await f.progress({page:99})).rows.length,0);
  assert.equal((await f.progress({member:f.other})).total,0);
  await f.db.query("update profiles set status='withdrawn' where id=$1",[f.student]);assert.equal((await f.progress({member:f.student})).total,0);
 }finally{await f.db.close();}
});
