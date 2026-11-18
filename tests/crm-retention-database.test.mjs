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
