import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture } from './helpers/lesson-block-review.mjs';
const doc=(track='daily',day=1)=>({schemaVersion:1,blocks:[{id:'q',type:'text',content:'원문'}],checklist:[],progression:{track,dayNumber:day},completion:{mode:track==='daily'?'mentor':'self',requireAnswers:false,requireQuizPass:track==='learning'}});
const values={blocks:{},checklist:[]};
async function setup(t){
 const f=await fixture(doc());t.after(()=>f.db.close());
 await f.db.exec(`reset role;alter table profiles add column email text;alter table profiles add column phone text;
 alter table cohorts add column name text;alter table curriculum_lessons add column day_number integer;
 create table edu_ongoing_completions(id uuid primary key,enrollment_id uuid,lesson_id uuid);
 grant select on edu_ongoing_completions to service_role;
 update profiles set role='student',full_name='수강생',email='learner@example.test' where role='member';`);
 for(const name of ['20260928194336_edu_member_messages.sql','20260928224050_admin_learning_search_and_progress.sql','20260928230237_message_progress_recipient_groups.sql'])await f.db.exec(fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await f.db.exec('set role service_role');
 f.scope={cohortId:f.cohort,track:'daily',day:1};
 f.recipients=async(scope=f.scope,after=null,search='',actor=f.admin)=>(await f.db.query('select edu_message_progress_recipients($1,$2,$3,$4) as r',[actor,search,after,scope])).rows[0].r;
 f.cohorts=async(actor=f.admin)=>(await f.db.query('select edu_message_progress_cohorts($1) as r',[actor])).rows[0].r;
 f.send=async(targets=[f.student],scope=f.scope,request=id(),actor=f.admin)=>(await f.db.query('select edu_send_progress_message($1,$2,$3,$4,$5) as r',[actor,request,'학습 안내',targets,scope])).rows[0].r;
 f.add=async(track,day)=>{const lesson=id(),revision=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published) values($1,$2,true)',[lesson,f.week]);await f.db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)',[f.admin,lesson,revision,doc(track,day)]);return{lesson,revision};};
 f.complete=async(lesson=f.lesson,revision=f.revision,track='daily')=>{const write=id();await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,lesson,f.enrollment,revision,write,values]);const s=(await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7) as r',[f.student,lesson,f.enrollment,revision,write,id(),values])).rows[0].r;if(track==='daily')await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6)',[f.admin,s.id,s.stateId,id(),'approved','확인']);};
 f.progress=async(member=null)=>(await f.db.query("select edu_admin_learning_progress($1,$2,'',1,null) as r",[f.admin,member])).rows[0].r;
 f.enroll=async(member=f.student,cohort=f.cohort)=>{const enrollment=id();await f.db.query("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[enrollment,member,f.course,cohort]);return enrollment;};
 return f;
}

test('current-day recipients match the admin track summary and exclude completed or wrong-cohort learners',async t=>{
 const f=await setup(t),daily2=await f.add('daily',2),learning=await f.add('learning',1);
 assert.deepEqual((await f.cohorts()).rows.map(r=>r.id),[f.cohort]);
 assert.deepEqual((await f.recipients()).rows.map(r=>r.id),[f.student]);
 await f.complete();
 let row=(await f.progress()).rows[0];assert.equal(row.tracks[0].currentDay,2);assert.equal(row.tracks[1].currentDay,1);
 assert.equal((await f.recipients()).rows.length,0);assert.equal((await f.recipients({...f.scope,day:2})).rows.length,1);
 assert.equal((await f.recipients({...f.scope,track:'learning'})).rows.length,1);
 await f.complete(learning.lesson,learning.revision,'learning');assert.equal((await f.recipients({...f.scope,track:'learning'})).rows.length,0);
 await f.complete(daily2.lesson,daily2.revision);assert.equal((await f.recipients({...f.scope,day:2})).rows.length,0);
 assert.equal((await f.progress()).rows[0].tracks[0].finished,true);
 assert.equal((await f.recipients({...f.scope,cohortId:id()})).rows.length,0);
});

test('selection and send recheck active access, deduplicate members and reject an entire changed group',async t=>{
 const f=await setup(t);await f.enroll();await f.enroll(f.other);
 assert.equal((await f.recipients()).rows.length,2);
 await f.db.query("update enrollments set access_ends_at=now()-interval '1 second' where user_id=$1",[f.other]);
 await assert.rejects(f.send([f.student,f.other]),/MESSAGE_PROGRESS_CHANGED/);
 assert.equal((await f.db.query('select count(*)::int as n from edu_message_batches')).rows[0].n,0);
 assert.equal((await f.recipients()).rows.length,1);
 const request=id(),receipt=await f.send([f.student,f.student],f.scope,request);assert.equal(receipt.count,1);
 await f.db.query("update enrollments set status='revoked' where user_id=$1",[f.student]);
 assert.deepEqual(await f.send([f.student],f.scope,request),receipt);
 await assert.rejects(f.send([f.student],{...f.scope,day:2},request),/MESSAGE_REQUEST_REUSED/);
 await assert.rejects(f.send(),/MESSAGE_PROGRESS_CHANGED/);
 assert.equal((await f.cohorts()).rows.length,0);
 const historic=(await f.progress(f.student)).rows[0];assert.equal(historic.accessActive,false);assert.equal(historic.tracks[0].nextDay,null);
});

test('progress that changes after selection is rejected while a lost successful receipt replays exactly',async t=>{
 const f=await setup(t);await f.add('daily',2);
 assert.equal((await f.recipients()).rows.length,1);
 const request=id(),receipt=await f.send([f.student],f.scope,request);
 await f.complete();
 await assert.rejects(f.send(),/MESSAGE_PROGRESS_CHANGED/);
 assert.deepEqual(await f.send([f.student],f.scope,request),receipt);
 assert.equal((await f.db.query('select count(*)::int as n from edu_member_messages')).rows[0].n,1);
});

test('waiting learners match their pending day but invalid duplicate mappings and withdrawn profiles do not',async t=>{
 const f=await setup(t);
 for(let day=1;day<=5;day++){const l=day===1?f:await f.add('daily',day);await f.complete(l.lesson,l.revision);}
 const sixth=await f.add('daily',6);await f.db.query('select edu_progression_settings($1,$2,$3,null,1)',[f.admin,f.cohort,id()]);
 const track=(await f.progress()).rows[0].tracks[0];assert.equal(track.waiting,true);assert.equal(track.currentDay,6);
 assert.equal((await f.recipients({...f.scope,day:6})).rows.length,1);
 await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[sixth.lesson]);await f.add('daily',6);await f.db.query('update curriculum_lessons set archived_at=null where id=$1',[sixth.lesson]);assert.equal((await f.progress()).rows[0].status,'error');assert.equal((await f.recipients({...f.scope,day:6})).rows.length,0);
 await assert.rejects(f.send([f.student],{...f.scope,day:6}),/MESSAGE_PROGRESS_CHANGED/);
 await f.db.query("update profiles set status='withdrawn' where id=$1",[f.student]);assert.equal((await f.cohorts()).rows.length,0);
});

test('filtering is before pagination, literal search stays scoped, and staff/admin are excluded',async t=>{
 const f=await setup(t);
 for(let n=0;n<28;n++){const member=id();await f.db.query("insert into profiles(id,role,status,full_name,email) values($1,'student','active',$2,$3)",[member,'대상 100% '+n,`student${n}@example.test`]);await f.enroll(member);}
 await f.enroll(f.admin);const staff=id();await f.db.query("insert into profiles(id,role,status,full_name) values($1,'staff','active','대상 직원')",[staff]);await f.enroll(staff);
 const a=await f.recipients(),b=await f.recipients(f.scope,a.nextCursor);assert.equal(a.rows.length,25);assert.equal(b.rows.length,4);assert.equal(b.nextCursor,null);assert.equal(new Set([...a.rows,...b.rows].map(r=>r.id)).size,29);
 assert.ok(![...a.rows,...b.rows].some(r=>[f.admin,staff].includes(r.id)));
 assert.equal((await f.recipients(f.scope,null,'student27@')).rows.length,1);assert.equal((await f.recipients(f.scope,null,'100%')).rows.length,25);assert.equal((await f.recipients(f.scope,null,'_')).rows.length,0);
 await assert.rejects(f.send([staff]),/MESSAGE_PROGRESS_CHANGED/);
});

test('group endpoints are private and enforce current member permission and strict scope input',async t=>{
 const f=await setup(t);
 await assert.rejects(f.recipients(f.scope,null,'',f.student),/MESSAGE_FORBIDDEN/);await assert.rejects(f.cohorts(f.student),/MESSAGE_FORBIDDEN/);await assert.rejects(f.send([f.other],f.scope,id(),f.student),/MESSAGE_FORBIDDEN/);
 for(const scope of [null,{},[],{...f.scope,day:0},{...f.scope,day:31},{...f.scope,day:1.1},{...f.scope,day:'1'},{...f.scope,track:'other'},{...f.scope,cohortId:'bad'},{...f.scope,actor:f.admin}])await assert.rejects(f.recipients(scope),/MESSAGE_INVALID/);
 const staff=id();await f.db.query("insert into profiles(id,role,status) values($1,'staff','active')",[staff]);await assert.rejects(f.cohorts(staff),/MESSAGE_FORBIDDEN/);
 await f.db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{members:true}]);assert.equal((await f.cohorts(staff)).rows.length,1);await f.send([f.student],f.scope,id(),staff);
 await f.db.query("update site_settings set value='{}' where key=$1",['edu_staff_permissions_'+staff]);await assert.rejects(f.send([f.student],f.scope,id(),staff),/MESSAGE_FORBIDDEN/);
 for(const role of ['anon','authenticated'])for(const fn of ['edu_enrollment_track_summary(uuid)','edu_assert_message_progress(jsonb)','edu_member_matches_message_progress(uuid,jsonb)','edu_message_progress_cohorts(uuid)','edu_message_progress_recipients(uuid,text,uuid,jsonb)','edu_send_progress_message(uuid,uuid,text,uuid[],jsonb)'])assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) as allowed',[role,fn,'execute'])).rows[0].allowed,false);
});
