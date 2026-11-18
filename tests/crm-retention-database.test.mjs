import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { setup as careSetup } from './helpers/learning-care.mjs';
const read=name=>fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const sql=read('20261112070212_retention_automation.sql');
async function setup(t){
 const f=await careSetup(t);await f.db.exec(`reset role;
 create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
 alter table enrollments add column created_at timestamptz default now()-interval '12 days';
 create table crm_tags(id uuid primary key);
 create table crm_templates(id uuid primary key,channel text,purpose text,content text,alimtalk_template_id text,is_active boolean);
 create table crm_message_logs(id uuid primary key default gen_random_uuid());
 grant select,insert,update on crm_templates,crm_tags,crm_message_logs to service_role;
 `);
 await f.db.exec(read('202608160007_crm_automation_engine.sql').split('create or replace function public.crm_enqueue_automation')[0]+'commit;');
 await f.db.exec(sql);
 await f.db.query("update profiles set role='student',phone='01000001234' where id=$1",[f.student]);
 await f.db.query("update enrollments set access_starts_at=now()-interval '12 days' where id=$1",[f.enrollment]);
 await f.db.query("update cohorts set status='in_progress',operation_start_at=now()-interval '10 days' where id=$1",[f.cohort]);
 const learning=await f.add('learning',1);f.learning=learning.lesson;
 f.template=id();f.inactive=id();f.stalled=id();
 await f.db.query("insert into crm_templates values($1,'alimtalk','transactional','함께 이어가요','approved-template',true)",[f.template]);
 for(const [automation,kind] of [[f.inactive,'member_inactive'],[f.stalled,'learning_stalled']])
  await f.db.query("insert into crm_automations(id,name,trigger_type,template_id,trigger_cohort_id,threshold_days,is_active) values($1,'가상 독려',$2,$3,$4,3,true)",[automation,kind,f.template,f.cohort]);
 await f.db.exec('set role service_role');
 f.complete=async(lesson,ago='now()')=>{
  await f.db.exec('reset role; alter table lesson_progress disable trigger user');
  try{await f.db.query(`insert into lesson_progress(enrollment_id,lesson_id,progress_percent,completed_at) values($1,$2,100,${ago})`,[f.enrollment,lesson]);}
  finally{await f.db.exec('alter table lesson_progress enable trigger user; set role service_role');}
 };
 f.scan=async()=>Number((await f.db.query('select edu_scan_retention_automations() n')).rows[0].n);
 f.runs=async()=> (await f.db.query('select * from crm_automation_runs order by automation_id')).rows;
 f.claim=async run=>(await f.db.query('select edu_authorize_retention_run($1,$2,$3,$4) r',[run,f.template,'함께 이어가요','approved-template'])).rows[0].r;
 f.visit=async()=> f.db.query("insert into edu_member_visits(user_id,visit_day,first_seen_at,last_seen_at) values($1,(now() at time zone 'Asia/Seoul')::date-5,now()-interval '5 days',now()-interval '5 days')",[f.student]);
 return f;
}
test('no visit is never inactive; first completion clock uses later course/grant date; existing triggers remain valid',async t=>{
 const f=await setup(t);assert.equal(await f.scan(),1);let runs=await f.runs();assert.equal(runs[0].automation_id,f.stalled);
 assert.equal(await f.scan(),0);
 const clock=(await f.db.query('select edu_private.edu_retention_clock($1,$2) c',[f.enrollment,'learning_stalled'])).rows[0].c;
 assert.ok(Math.abs(Date.now()-new Date(clock).getTime()-10*86400000)<10000);
 await f.db.query("update enrollments set created_at=now()-interval '2 days' where id=$1",[f.enrollment]);
 assert.equal(await f.claim(runs[0].id),null);
 await f.db.query("insert into crm_automations(name,trigger_type,template_id,is_active) values('기존 가입','member_joined',$1,true)",[f.template]);
 await f.visit();assert.equal(await f.scan(),1);runs=await f.runs();assert.equal(runs.filter(r=>r.automation_id===f.inactive).length,1);
});
test('two conditions and concurrent claims reserve one account/day; repeat scans and claim replay never resend',async t=>{
 const f=await setup(t);await f.visit();assert.equal(await f.scan(),2);const runs=await f.runs();
 const results=await Promise.all(runs.map(r=>f.claim(r.id)));assert.equal(results.filter(Boolean).length,1);
 assert.equal((await f.runs()).filter(r=>r.status==='skipped').length,1);
 assert.equal(await f.claim(runs[0].id),null);assert.equal(await f.scan(),0);
 assert.equal((await f.db.query('select count(*)::int n from crm_retention_daily_receipts')).rows[0].n,1);
});
test('completion, visit, revoked access, phone and rule edits between scan and claim prevent sending',async t=>{
 const f=await setup(t);await f.visit();await f.scan();let runs=await f.runs();
 await f.complete(f.learning);
 for(const run of runs)assert.equal(await f.claim(run.id),null); // course finished
 await f.db.exec('reset role');
 await f.db.query('delete from lesson_progress where enrollment_id=$1',[f.enrollment]);
 await f.db.exec('set role service_role');
 await f.db.query("update enrollments set created_at=now()-interval '8 days' where id=$1",[f.enrollment]);
 await f.scan();runs=(await f.runs()).filter(r=>r.status==='pending');assert.ok(runs.length);
 await f.db.query('update crm_automations set threshold_days=4 where id=$1',[f.stalled]);
 for(const run of runs)assert.equal(await f.claim(run.id),null);
 await f.db.query("update edu_member_visits set last_seen_at=first_seen_at+interval '1 minute' where user_id=$1",[f.student]);
 await f.scan();runs=(await f.runs()).filter(r=>r.status==='pending');assert.ok(runs.length);
 await f.db.query("update profiles set phone=null where id=$1",[f.student]);
 for(const run of runs)assert.equal(await f.claim(run.id),null);
});
test('draft changes and daily missions/OT never reset last normal-lesson completion; grant after start wins',async t=>{
 const f=await setup(t);const another=await f.add('learning',2);
 await f.complete(f.learning,"now()-interval '5 days'");
 await f.complete(f.lesson); // daily mission
 const before=(await f.db.query('select edu_private.edu_retention_clock($1,$2) c',[f.enrollment,'learning_stalled'])).rows[0].c;
 assert.ok(Math.abs(Date.now()-new Date(before).getTime()-5*86400000)<10000);
 await f.db.query('update lesson_progress set updated_at=now() where enrollment_id=$1',[f.enrollment]);
 assert.equal(new Date((await f.db.query('select edu_private.edu_retention_clock($1,$2) c',[f.enrollment,'learning_stalled'])).rows[0].c).toISOString(),new Date(before).toISOString());
 await f.db.query('update curriculum_lessons set is_published=false where id=$1',[f.learning]);
 assert.equal(new Date((await f.db.query('select edu_private.edu_retention_clock($1,$2) c',[f.enrollment,'learning_stalled'])).rows[0].c).toISOString(),new Date(before).toISOString());
 assert.equal(await f.scan(),1);const [run]=await f.runs();assert.ok(await f.claim(run.id));
 await f.db.query("update crm_automation_runs set status='failed',error_message='공급자 결과 미확인' where id=$1",[run.id]);
 assert.equal(await f.scan(),0);assert.equal(await f.claim(run.id),null);
 assert.ok(another.lesson);
});
test('private receipt/clock/scan/authorize RPCs reject anon/authenticated; validation is enforced in DB',async t=>{
 const f=await setup(t);
 for(const role of ['anon','authenticated']){
  await f.db.exec('reset role; set role '+role);
  for(const query of ['select * from crm_retention_daily_receipts','select edu_scan_retention_automations()',`select edu_authorize_retention_run('${id()}','${f.template}','x','x')`])await assert.rejects(f.db.query(query),/permission denied/);
 }
 await f.db.exec('reset role');
 await assert.rejects(f.db.query("insert into crm_automations(name,trigger_type,template_id,is_active) values('기수 없음','learning_stalled',$1,true)",[f.template]),/crm_retention_scope/);
});

test('new visit and revoked access independently invalidate queued recipients',async t=>{
 const f=await setup(t);await f.visit();await f.scan();const runs=await f.runs();
 await f.db.query("insert into edu_member_visits(user_id,visit_day,first_seen_at,last_seen_at) values($1,(now() at time zone 'Asia/Seoul')::date,now(),now())",[f.student]);
 assert.equal(await f.claim(runs.find(r=>r.automation_id===f.inactive).id),null);
 await f.db.query("update enrollments set revoked_at=now() where id=$1",[f.enrollment]);
 assert.equal(await f.claim(runs.find(r=>r.automation_id===f.stalled).id),null);
 assert.equal((await f.db.query('select count(*)::int n from crm_retention_daily_receipts')).rows[0].n,0);
});

async function reminderSetup(t) {
  const f = await setup(t);
  await f.db.exec(`reset role;
    alter table courses add column status text not null default 'published';
    alter table cohorts add column archived_at timestamptz;
    alter table cohorts add column price integer not null default 10000;
  `);
  await f.db.query("update profiles set role='student' where id=$1", [f.other]);
  await f.db.exec(read('20261118135006_edu_learning_reminder_requests.sql'));
  await f.db.exec('set role service_role');
  f.reminder = async ({ user = f.student, action = 'list', request = null, enrollment = null, kind = null, days = null } = {}) =>
    (await f.db.query('select edu_learning_reminders($1,$2,$3,$4,$5,$6) as info', [user,action,request,enrollment,kind,days])).rows[0].info;
  return f;
}

test('students independently request each condition once, cancel, and explicitly request again without queuing messages', async t => {
  const f = await reminderSetup(t);
  const enrollment = f.enrollment;
  const progress = { action:'request', request:id(), enrollment, kind:'learning_stalled', days:3 };
  const visit = { action:'request', request:id(), enrollment, kind:'member_inactive', days:4 };
  let settings = await f.reminder();
  assert.equal(settings.maskedPhone, '010-****-1234');
  assert.deepEqual(settings.courses[0].choices.map(choice => choice.eligible), [false, true]);
  await assert.rejects(f.reminder(visit), /LEARNING_REMINDER_FORBIDDEN/);
  await f.visit();
  await Promise.all([f.reminder(progress), f.reminder({ ...progress, request:id() }), f.reminder(visit)]);
  settings = await f.reminder();
  const [visitChoice, progressChoice] = settings.courses[0].choices;
  assert.equal(visitChoice.request.id, visit.request);
  assert.equal(progressChoice.request.status, 'pending');
  assert.equal(Date.parse(progressChoice.request.dueAt) - Date.parse(progressChoice.request.requestedAt), 3 * 86400000);
  assert.equal((await f.db.query('select count(*)::int n from edu_learning_reminder_requests')).rows[0].n, 2);

  await f.reminder({ action:'cancel', request:visit.request });
  await f.reminder(visit);
  settings = await f.reminder();
  assert.deepEqual(settings.courses[0].choices.map(choice => choice.request.status), ['cancelled','pending']);
  const fresh = id();
  settings = await f.reminder({ ...visit, request:fresh, days:2 });
  assert.equal(settings.courses[0].choices[0].request.id, fresh);
  assert.equal(settings.courses[0].choices[0].request.days, 2);
  await f.reminder({ action:'cancel', request:visit.request });
  assert.equal((await f.reminder()).courses[0].choices[0].request.status, 'pending');
  assert.equal((await f.runs()).length, 0);
  assert.equal((await f.db.query('select count(*)::int n from crm_message_logs')).rows[0].n, 0);
  assert.deepEqual((await f.db.query('select distinct consent_version from edu_learning_reminder_requests')).rows, [{ consent_version:'request-only-v1' }]);
});

test('role, ownership, active paid access, and database grants prevent requests from outside an eligible seat', async t => {
  const f = await reminderSetup(t);
  const data = { action:'request', request:id(), enrollment:f.enrollment, kind:'learning_stalled', days:3 };
  await assert.rejects(f.reminder({ ...data, user:f.admin }), /LEARNING_REMINDER_FORBIDDEN/);
  await assert.rejects(f.reminder({ ...data, user:f.other }), /LEARNING_REMINDER_FORBIDDEN/);
  await assert.rejects(f.reminder({ ...data, days:0 }), /LEARNING_REMINDER_INVALID/);
  await assert.rejects(f.reminder({ ...data, days:366 }), /LEARNING_REMINDER_INVALID/);
  await f.reminder(data);
  assert.deepEqual((await f.reminder({ user:f.other, action:'cancel', request:data.request })).courses, []);
  assert.equal((await f.reminder()).courses[0].choices[1].request.status, 'pending');

  for (const check of [
    { change:'update cohorts set price=0', reset:'update cohorts set price=10000' },
    { change:"update courses set category='free'", reset:"update courses set category='paid_class'" },
    { change:'update cohorts set archived_at=now()', reset:'update cohorts set archived_at=null' },
    { change:'update enrollments set revoked_at=now()', reset:'update enrollments set revoked_at=null' },
    { change:"update enrollments set access_ends_at=now()-interval '1 minute'", reset:'update enrollments set access_ends_at=null' },
  ]) {
    await f.db.exec(check.change);
    assert.deepEqual((await f.reminder()).courses, []);
    await assert.rejects(f.reminder({ ...data, request:id() }), /LEARNING_REMINDER_FORBIDDEN/);
    await f.db.exec(check.reset);
  }
  for (const role of ['anon','authenticated']) {
    await f.db.exec('reset role; set role ' + role);
    await assert.rejects(f.reminder(), /permission denied/);
    await assert.rejects(f.db.query('select * from edu_learning_reminder_requests'), /permission denied/);
  }
});

test('new visits and real normal completion close their own one-shot requests, and an elapsed request can be replaced', async t => {
  const f = await reminderSetup(t);
  await f.add('learning',2);
  await f.visit();
  const progress = { action:'request', request:id(), enrollment:f.enrollment, kind:'learning_stalled', days:3 };
  const visit = { action:'request', request:id(), enrollment:f.enrollment, kind:'member_inactive', days:3 };
  await f.reminder(progress);
  await f.reminder(visit);
  await f.db.query("insert into edu_member_visits(user_id,visit_day,first_seen_at,last_seen_at) values($1,(now() at time zone 'Asia/Seoul')::date,now(),now())", [f.student]);
  assert.deepEqual((await f.reminder()).courses[0].choices.map(choice => choice.request.status), ['activity','pending']);
  await f.complete(f.learning);
  assert.deepEqual((await f.reminder()).courses[0].choices.map(choice => choice.request.status), ['activity','activity']);
  const newId = id();
  assert.equal((await f.reminder({ ...visit, request:newId })).courses[0].choices[0].request.id, newId);
  await f.db.query(`update edu_learning_reminder_requests set
    requested_at = now() - case when id=$1 then interval '4 days' else interval '6 days' end,
    due_at = now() - case when id=$1 then interval '1 day' else interval '3 days' end
    where id in ($1,$2)`, [newId, visit.request]);
  await f.db.exec('reset role; delete from edu_member_visits where visit_day=(now() at time zone \'Asia/Seoul\')::date; set role service_role');
  assert.equal((await f.reminder()).courses[0].choices[0].request.status, 'elapsed');
  assert.equal((await f.reminder({ ...visit, request:id() })).courses[0].choices[0].request.status, 'pending');
  assert.equal((await f.runs()).length, 0);
});
