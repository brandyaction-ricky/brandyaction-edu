import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture } from './helpers/lesson-block-review.mjs';
const read = name => fs.readFileSync(new URL('../supabase/migrations/' + name, import.meta.url),'utf8');
const doc = (track='daily',day=1) => ({schemaVersion:1,blocks:[{id:'q',type:'text',content:'PRIVATE CONTENT'}],checklist:[],progression:{track,dayNumber:day},completion:{mode:track==='daily'?'mentor':'self',requireAnswers:false,requireQuizPass:track==='learning'}});
async function setup(t) {
 const f = await fixture(doc()); t.after(()=>f.db.close());
 await f.db.exec(`reset role;
 alter table profiles add column email text; alter table profiles add column phone text;
 alter table courses add column category text default 'paid_class';
 alter table cohorts add column name text default '가상 기수'; alter table cohorts add column status text default 'active'; alter table cohorts add column operation_end_at timestamptz;
 alter table curriculum_weeks add column week_number integer default 1;
 alter table curriculum_lessons add column day_number integer default 1;
 create table edu_ongoing_rules(lesson_id uuid primary key);
 create table edu_ongoing_completions(id uuid primary key,enrollment_id uuid,lesson_id uuid);
 create table edu_questions(id uuid primary key,user_id uuid,course_id uuid,status text,is_archived boolean default false);
 grant select on edu_ongoing_rules,edu_ongoing_completions,edu_questions to service_role;
 update profiles set full_name='합성 회원',email='qa@example.test' where role='member';`);
 await f.db.exec(read('20260928194336_edu_member_messages.sql'));
 await f.db.exec('alter table edu_member_messages add column is_notice boolean not null default false');
 await f.db.exec(read('20260929012022_member_visits.sql'));
 await f.db.exec(read('20261001024207_alumni_read_mode.sql').split('-- Project the same')[0]+'commit;');
 await f.db.exec(read('20261001180000_cohort_curriculum_visibility.sql').split('-- Direct PostgREST')[0]+'commit;');
 await f.db.exec(read('20261002102250_learner_feedback_completion_gate.sql'));
 await f.db.exec(read('20261008052124_learning_care_dashboard.sql'));
 await f.db.exec('set role service_role');
 f.snapshot = async(actor=f.admin,cohort=f.cohort)=>(await f.db.query('select edu_admin_learning_care($1,$2) as r',[actor,cohort])).rows[0].r;
 f.personal = async(actor=f.student)=>(await f.db.query('select edu_member_learning_care($1) as r',[actor])).rows[0].r;
 f.send = async({actor=f.admin,request=id(),recipients=[f.student],lesson=f.lesson,cohort=f.cohort,content='함께 이어가요'}={})=>(await f.db.query('select edu_send_learning_care($1,$2,$3,$4,$5,$6) as r',[actor,request,cohort,lesson,recipients,content])).rows[0].r;
 f.add = async(track,day,published=true)=>{const lesson=id(),revision=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published,day_number) values($1,$2,true,$3)',[lesson,f.week,day]);await f.db.query('insert into edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published) values($1,$2,$3)',[f.cohort,lesson,published]);await f.db.query('select edu_save_lesson_blocks($1,$2,null,$3,$4)',[f.admin,lesson,revision,doc(track,day)]);return{lesson,revision};};
 f.submitCell=async(lesson=f.lesson,revision=f.revision)=>{const values={blocks:{},checklist:[]},write=id();await f.db.query('select edu_save_block_draft($1,$2,$3,$4,null,$5,$6)',[f.student,lesson,f.enrollment,revision,write,values]);return(await f.db.query('select edu_submit_lesson_blocks($1,$2,$3,$4,$5,$6,$7) as r',[f.student,lesson,f.enrollment,revision,write,id(),values])).rows[0].r;};
 f.approve=async(s,decision='approved')=>(await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6) as r',[f.admin,s.id,s.stateId,id(),decision,'합성 피드백'])).rows[0].r;
 return f;
}
test('care distinguishes no submission, review waiting, completion, prerequisite and cohort release',async t=>{
 const f=await setup(t), second=await f.add('daily',2), hidden=await f.add('daily',3,false), learning=await f.add('learning',1);
 let cells=(await f.snapshot()).rows[0].cells;
 assert.equal(cells.find(c=>c.lessonId===f.lesson).state,'not_submitted');assert.equal(cells.find(c=>c.lessonId===second.lesson).state,'locked');assert.equal(cells.find(c=>c.lessonId===hidden.lesson).published,false);
 const submitted=await f.submitCell();assert.equal((await f.snapshot()).rows[0].cells.find(c=>c.lessonId===f.lesson).state,'submitted');
 await assert.rejects(f.send(),/CARE_RECIPIENT_CHANGED/);
 await f.approve(submitted);cells=(await f.snapshot()).rows[0].cells;assert.equal(cells.find(c=>c.lessonId===f.lesson).state,'completed');assert.equal(cells.find(c=>c.lessonId===second.lesson).state,'not_submitted');
 await f.submitCell(learning.lesson,learning.revision);assert.equal((await f.snapshot()).rows[0].cells.find(c=>c.lessonId===learning.lesson).state,'completed');
 const personal=await f.personal();assert.ok(!personal.rows[0].cells.some(c=>c.lessonId===hidden.lesson));assert.doesNotMatch(JSON.stringify(personal),/PRIVATE CONTENT|qa@example|memberId|lastContactAt/);
});
test('care handles change requests, daily cap and corrupt mappings without false progress',async t=>{
 const f=await setup(t);await f.approve(await f.submitCell(),'changes_requested');
 assert.equal((await f.snapshot()).rows[0].cells[0].state,'changes_requested');
 const sixth=await f.add('daily',6);await f.db.query('select edu_progression_settings($1,$2,$3,null,1)',[f.admin,f.cohort,id()]);
 assert.equal((await f.snapshot()).rows[0].cells.find(c=>c.lessonId===sixth.lesson).state,'scheduled');
 await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[f.lesson]);await f.add('daily',1);await f.db.query('update curriculum_lessons set archived_at=null where id=$1',[f.lesson]);
 assert.equal((await f.snapshot()).rows[0].cells.find(c=>c.lessonId===f.lesson).state,'error');await assert.rejects(f.send(),/CARE_RECIPIENT_CHANGED/);
});
test('snapshot excludes revoked, expired, withdrawn and operators, and keeps complete cohort beyond 100 rows',async t=>{
 const f=await setup(t);
 for(let n=0;n<105;n++){const member=id();await f.db.query("insert into profiles(id,role,status,full_name) values($1,'student','active',$2)",[member,'합성 '+n]);await f.db.query("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[id(),member,f.course,f.cohort]);}
 assert.equal((await f.snapshot()).rows.length,106);
 await f.db.query("update enrollments set revoked_at=now() where id=$1",[f.enrollment]);assert.equal((await f.snapshot()).rows.length,105);assert.equal((await f.personal()).rows.length,0);
 await f.db.query("update enrollments set revoked_at=null,access_ends_at=now()-interval '1 second' where id=$1",[f.enrollment]);assert.equal((await f.personal()).rows.length,0);
 await f.db.query("update enrollments set access_ends_at=null where id=$1",[f.enrollment]);await f.db.query("update profiles set role='admin' where id=$1",[f.student]);assert.equal((await f.snapshot()).rows.length,105);
 await f.db.query("update profiles set role='member',status='withdrawn' where id=$1",[f.student]);await assert.rejects(f.personal(),/CARE_FORBIDDEN/);
 assert.equal((await f.snapshot(f.admin,id())).rows.length,0);
});
test('send rechecks recipients, rolls back changed group, and replays receipt without duplicate delivery',async t=>{
 const f=await setup(t), request=id();
 await assert.rejects(f.send({recipients:[f.student,f.other]}),/CARE_RECIPIENT_CHANGED/);
 assert.equal((await f.db.query('select count(*)::int as n from edu_member_messages')).rows[0].n,0);
 const receipt=await f.send({request,recipients:[f.student,f.student]});assert.equal(receipt.count,1);
 await assert.rejects(f.send(),/CARE_RECIPIENT_CHANGED/);
 await f.db.query("update enrollments set revoked_at=now() where id=$1",[f.enrollment]);
 assert.deepEqual(await f.send({request}),receipt);
 await assert.rejects(f.send({request,content:'changed'}),/MESSAGE_REQUEST_REUSED/);
 await assert.rejects(f.send({request,lesson:id()}),/MESSAGE_REQUEST_REUSED/);
 assert.equal((await f.db.query('select count(*)::int as n from edu_learning_care_sends')).rows[0].n,1);
 assert.equal((await f.db.query('select count(*)::int as n from edu_member_messages')).rows[0].n,1);
});
test('new endpoints enforce actor permissions and service-only execution, own data only for students',async t=>{
 const f=await setup(t);await assert.rejects(f.snapshot(f.student),/BLOCK_FORBIDDEN/);await assert.rejects(f.send({actor:f.student}),/BLOCK_FORBIDDEN/);
 assert.deepEqual((await f.personal(f.other)).rows,[]);
 const staff=id();await f.db.query("insert into profiles(id,role,status) values($1,'staff','active')",[staff]);await assert.rejects(f.snapshot(staff),/BLOCK_FORBIDDEN/);
 await f.db.query('insert into site_settings values($1,$2)',['edu_staff_permissions_'+staff,{members:true}]);assert.equal((await f.snapshot(staff)).rows.length,1);
 for(const role of ['anon','authenticated'])for(const fn of ['edu_private.edu_learning_care_cells(uuid)','edu_admin_learning_care(uuid,uuid)','edu_member_learning_care(uuid)','edu_send_learning_care(uuid,uuid,uuid,uuid,uuid[],text)'])assert.equal((await f.db.query('select has_function_privilege($1,$2,$3) as allowed',[role,fn,'execute'])).rows[0].allowed,false);
 assert.equal((await f.db.query("select relrowsecurity from pg_class where relname='edu_learning_care_sends'")).rows[0].relrowsecurity,true);
});
