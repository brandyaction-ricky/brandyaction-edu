import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID as id } from 'node:crypto';
import { setup } from './helpers/learning-care.mjs';
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
test('snapshot excludes revoked, withdrawn and operators, retains expired history, and keeps cohort beyond 100 rows',async t=>{
 const f=await setup(t);
 for(let n=0;n<105;n++){const member=id();await f.db.query("insert into profiles(id,role,status,full_name) values($1,'student','active',$2)",[member,'합성 '+n]);await f.db.query("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[id(),member,f.course,f.cohort]);}
 assert.equal((await f.snapshot()).rows.length,106);
 await f.db.query("update enrollments set revoked_at=now() where id=$1",[f.enrollment]);assert.equal((await f.snapshot()).rows.length,105);assert.equal((await f.personal()).rows.length,0);
 await f.db.query("update enrollments set revoked_at=null,access_ends_at=now()-interval '1 second' where id=$1",[f.enrollment]);assert.equal((await f.personal()).rows.length,0);
 await f.db.query("update enrollments set access_ends_at=null where id=$1",[f.enrollment]);await f.db.query("update profiles set role='admin' where id=$1",[f.student]);assert.equal((await f.snapshot()).rows.length,105);
 await f.db.query("update profiles set role='member',status='withdrawn' where id=$1",[f.student]);await assert.rejects(f.personal(),/CARE_FORBIDDEN/);
 assert.equal((await f.snapshot(f.admin,id())).rows.length,0);
});
test('cohort choices include empty new cohorts and completed cohorts; default prefers the current cohort',async t=>{
 const f=await setup(t),next=id(),past=id();
 await f.db.query("update cohorts set status='in_progress',operation_start_at=now()-interval '3 days' where id=$1",[f.cohort]);
 await f.db.query("insert into cohorts(id,course_id,name,status,operation_start_at) values($1,$2,'5기','upcoming',now()+interval '30 days')",[next,f.course]);
 await f.db.query("insert into cohorts(id,course_id,name,status,operation_start_at,operation_end_at) values($1,$2,'3기','completed',now()-interval '90 days',now()-interval '30 days')",[past,f.course]);
 const initial=await f.snapshot(f.admin,null);
 assert.equal(initial.cohortId,f.cohort);assert.equal(initial.cohorts.length,3);
 assert.equal(initial.cohorts.find(c=>c.id===next).memberCount,0);
 assert.equal(initial.cohorts.find(c=>c.id===past).status,'completed');
 assert.equal((await f.snapshot(f.admin,next)).rows.length,0);
 await f.db.query('update enrollments set cohort_id=$1 where id=$2',[past,f.enrollment]);
 assert.equal((await f.snapshot(f.admin,f.cohort)).rows.length,0);
 const history=await f.snapshot(f.admin,past);
 assert.equal(history.rows.length,1);assert.equal(history.rows[0].memberId,f.student);
 assert.equal(history.rows[0].contactEligible,true); // cohort end never revokes lifetime access
});
test('expired access remains in admin history, never becomes a send target or learner access grant',async t=>{
 const f=await setup(t);await f.approve(await f.submitCell());
 await f.db.query("update enrollments set status='expired',access_ends_at=now()-interval '1 day' where id=$1",[f.enrollment]);
 const snapshot=await f.snapshot();assert.equal(snapshot.rows.length,1);
 assert.equal(snapshot.rows[0].cells[0].state,'completed');assert.equal(snapshot.rows[0].contactEligible,false);
 assert.equal((await f.personal()).rows.length,0);await assert.rejects(f.send(),/CARE_RECIPIENT_CHANGED/);
 await f.db.query("update enrollments set status='refunded' where id=$1",[f.enrollment]);assert.equal((await f.snapshot()).rows.length,0);
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

test('batch projection matches legacy gates for grants, archived completions, untracked ordering and graduates',async t=>{
 const f=await setup(t), daily2=await f.add('daily',2), daily6=await f.add('daily',6), learn1=await f.add('learning',1), learn2=await f.add('learning',2), learn3=await f.add('learning',3);
 const untracked=[];
 for(const day of [0,4,5]){const lesson=id();await f.db.query('insert into curriculum_lessons(id,week_id,is_published,day_number) values($1,$2,true,$3)',[lesson,f.week,day]);await f.db.query('insert into edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published) values($1,$2,true)',[f.cohort,lesson]);untracked.push(lesson);}
 await f.parity();
 // Seed historical completed rows as an owner; the live completion-write gate
 // remains unchanged and is tested by the submission tests above.
 await f.db.exec('reset role; alter table lesson_progress disable trigger user;');
 for(const lesson of [daily2.lesson,learn1.lesson,untracked[2]])await f.db.query('insert into lesson_progress(enrollment_id,lesson_id,progress_percent,completed_at) values($1,$2,100,now())',[f.enrollment,lesson]);
 await f.db.exec('alter table lesson_progress enable trigger user; set role service_role;');
 await f.parity();
 await f.db.query('update curriculum_lessons set archived_at=now() where id in ($1,$2)',[daily2.lesson,learn1.lesson]);await f.parity();
 await f.db.query('insert into edu_enrollment_progression_grants(enrollment_id,daily_open_through) values($1,8)',[f.enrollment]);await f.parity();
 await f.db.query('select edu_progression_settings($1,$2,$3,null,1)',[f.admin,f.cohort,id()]);await f.parity();
 await f.db.query("update cohorts set status='completed' where id=$1",[f.cohort]);await f.parity();
 const graduate=(await f.snapshot()).rows[0].cells;assert.equal(graduate.find(c=>c.lessonId===daily6.lesson).state,'not_submitted');assert.equal(graduate.find(c=>c.lessonId===learn3.lesson).state,'not_submitted');
 await f.db.query('update edu_cohort_week_visibility set is_published=false where cohort_id=$1',[f.cohort]);await f.parity();
 await f.db.query('update edu_cohort_week_visibility set is_published=true where cohort_id=$1',[f.cohort]);
 await f.db.exec('reset role');await f.db.query('insert into edu_ongoing_rules values($1)',[learn2.lesson]);await f.db.exec('set role service_role');await f.parity();
});

test('batch projection keeps invalid, duplicate and unpublished mapping behavior',async t=>{
 const f=await setup(t), second=await f.add('daily',2), hidden=await f.add('learning',2,false);
 const setProgression=async value=>{await f.db.exec('reset role');await f.db.query("update edu_lesson_block_versions set document=jsonb_set(document,'{progression}',$2) where id=$1",[second.revision,JSON.stringify(value)]);await f.db.exec('set role service_role');await f.parity();};
 for(const value of [{track:'unknown',dayNumber:2},{track:'daily',dayNumber:31},{track:'learning'},{track:'learning',dayNumber:2},null])await setProgression(value);
 await f.db.query('update curriculum_lessons set archived_at=now() where id=$1',[hidden.lesson]);await setProgression({track:'learning',dayNumber:2});
});

test('117 learner / 60 item dashboard resolves cells without per-cell gate queries',async t=>{
 const f=await setup(t);
 for(let n=2;n<=30;n++)await f.add('daily',n);
 for(let n=1;n<=30;n++)await f.add('learning',n);
 await f.parity();
 for(let n=1;n<117;n++){const member=id();await f.db.query("insert into profiles(id,role,status,full_name) values($1,'student','active',$2)",[member,'검수 회원 '+n]);await f.db.query("insert into enrollments values($1,$2,$3,'active',null,now()-interval '1 day',null,$4)",[id(),member,f.course,f.cohort]);}
 // A structural regression check: no hidden 7,020 gate calls in the snapshot.
 await f.db.exec("reset role; create or replace function edu_lesson_progression_gate(p_enrollment uuid,p_lesson uuid) returns jsonb language plpgsql stable as $$ begin raise exception 'UNEXPECTED_PER_CELL_GATE'; end; $$; set role service_role;");
 const start=performance.now();
 const result=(await f.db.query('select edu_admin_learning_care($1,$2) as r',[f.admin,f.cohort])).rows[0].r;
 t.diagnostic(`117 × 60 projection: ${Math.round(performance.now()-start)}ms`);
 assert.equal(result.rows.length,117);assert.equal(result.rows.flatMap(r=>r.cells).length,7020);
 assert.ok(result.rows.every(r=>r.cells.filter(c=>c.state==='not_submitted').length===2));
});
