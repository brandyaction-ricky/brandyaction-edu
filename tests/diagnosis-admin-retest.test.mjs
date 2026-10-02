import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('admin retests preserve history, current identity and student limits', async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active',role text default 'student');
 create table courses(id uuid primary key,title text);
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text);
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const file of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql','20261001230818_edu_diagnosis_admin_pilot.sql','20261002072505_edu_admin_diagnosis_retests.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.query("insert into profiles(id,role) values($1,'admin'),($2,'student'),($3,'staff')",[id(1),id(2),id(3)]);
 await db.query("insert into courses values($1,'AI 문샷 챌린지')",[id(10)]);
 await db.query("insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,'pilot',$3,true)",[id(11),id(10),id(12)]);
 await db.exec('update edu_diagnosis_control set enabled=true');
 await db.query("insert into orders values($1,$2,'pending'),($3,$2,'pending')",[id(20),id(2),id(21)]);
 await db.query('insert into order_items values($1,$2,$3),($4,$5,$3)',[id(22),id(20),id(10),id(23),id(21)]);
 // Seed a legitimate pre-pilot paid grant. Pilot must still deny this student.
 await db.query("update orders set status='paid' where id=$1",[id(20)]);
 await db.exec('update edu_diagnosis_control set admin_only=true;set role service_role');
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const begin=actor=>scalar('select edu_diagnosis_begin($1,$2)',[actor,id(10)]);
 const proof=(actor,attempt)=>scalar("select edu_diagnosis_report_access($1,$2,$3,$4,'pilot',0)",[actor,attempt,id(40),id(12)]);
 let attempt;
 await t.test('no purchase needed; one grant, one attempt, one outbox after repeated start',async()=>{
  assert.equal((await scalar('select edu_diagnosis_available($1)',[id(1)])).length,1);
  attempt=await begin(id(1));assert.equal((await begin(id(1))).id,attempt.id);
  assert.equal(await scalar('select count(*)::int from edu_diagnosis_grants where admin_trial'),1);
  assert.equal(await scalar('select count(*)::int from edu_diagnosis_attempts'),1);
  assert.equal(await scalar('select count(*)::int from edu_diagnosis_outbox'),1);
  const grant=(await db.query('select order_item_id,enrollment_id from edu_diagnosis_grants where admin_trial')).rows[0];
  assert.deepEqual(grant,{order_item_id:null,enrollment_id:null});
  assert.equal(await scalar('select count(*)::int from enrollments'),0);
  assert.equal((await scalar('select edu_diagnosis_context($1)',[id(1)])).adminTest,false);
  assert.equal((await scalar('select edu_diagnosis_context($1)',[id(1)])).canRestart,false);
  await assert.rejects(scalar('select edu_diagnosis_restart($1,$2)',[id(1),attempt.id]),/DIAGNOSIS_DISABLED/);
  await db.exec('reset role;update edu_diagnosis_control set admin_retests_enabled=true;set role service_role');
 });
 await t.test('restarts from every state retain old identities; retries cannot create extra attempts',async()=>{
  let old=attempt, sequence=1000;
  for(const state of ['in_progress','submitted','processing','ready','needs_review']){
   await db.query('update edu_diagnosis_attempts set state=$1,remote_revision=12,remote_response_id=$3,report_id=$4 where id=$2',[state,old.id,id(sequence++),state==='ready'?id(sequence++):null]);
   const next=await scalar('select edu_diagnosis_restart($1,$2)',[id(1),old.id]);
   assert.notEqual(next.id,old.id);
   const preserved=(await db.query('select state,remote_revision,is_current from edu_diagnosis_attempts where id=$1',[old.id])).rows[0];
   assert.deepEqual(preserved,{state,remote_revision:12,is_current:false});
   assert.equal((await scalar('select edu_diagnosis_restart($1,$2)',[id(1),old.id])).id,next.id);
   const current=await scalar('select edu_diagnosis_context($1)',[id(1)]);
   assert.equal(current.attemptId,next.id);assert.equal(current.adminTest,true);assert.equal(current.revision,-1);
   assert.equal(await scalar("select edu_diagnosis_sync_session($1,$2,$3,13,'in_progress')",[id(1),old.id,id(990)]),false);
   await assert.rejects(scalar('select edu_diagnosis_restart($1,$2)',[id(2),next.id]),/DIAGNOSIS_FORBIDDEN/);
   old=next;
  }
  assert.equal(await scalar('select count(*)::int from edu_diagnosis_attempts where is_current'),1);
  await assert.rejects(scalar('select edu_diagnosis_restart($1,$2)',[id(1),attempt.id]),/DIAGNOSIS_CONFLICT/);
 });
 await t.test('paid student and staff denied by all DB entry points before remote IO',async()=>{
  for(const actor of [id(2),id(3)]){
   assert.deepEqual(await scalar('select edu_diagnosis_available($1)',[actor]),[]);
   for(const fn of ['edu_diagnosis_read','edu_diagnosis_context'])await assert.rejects(scalar(`select ${fn}($1)`,[actor]),/DIAGNOSIS_FORBIDDEN/);
   await assert.rejects(begin(actor),/DIAGNOSIS_FORBIDDEN/);
   assert.equal(await scalar("select edu_diagnosis_has_access($1,'myin-n6')",[actor]),false);
  }
  await db.query("update orders set status='paid' where id=$1",[id(21)]);
  assert.equal(await scalar('select count(*)::int from edu_diagnosis_grants where not admin_trial'),1);
 });
 await t.test('proof is exact-bound and role downgrade immediately revokes access',async()=>{
  await db.query("update edu_diagnosis_attempts set remote_response_id=$1,remote_revision=0,state='in_progress' where id=$2",[id(40),attempt.id]);
  assert.ok(await proof(id(1),attempt.id));assert.equal(await proof(id(2),attempt.id),null);
  await db.query("update profiles set role='staff' where id=$1",[id(1)]);
  assert.equal(await proof(id(1),attempt.id),null);await assert.rejects(begin(id(1)),/DIAGNOSIS_FORBIDDEN/);
  await db.query("update profiles set role='admin',status='suspended' where id=$1",[id(1)]);
  assert.equal(await proof(id(1),attempt.id),null);
  await db.query("update profiles set status='active' where id=$1",[id(1)]);
 });
 await t.test('disabled control and browser database roles cannot use pilot access',async()=>{
  await db.exec('reset role;update edu_diagnosis_control set enabled=false;set role service_role');
  assert.equal(await proof(id(1),attempt.id),null);assert.deepEqual(await scalar('select edu_diagnosis_available($1)',[id(1)]),[]);
  await assert.rejects(begin(id(1)),/DIAGNOSIS_DISABLED/);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(begin(id(1)),/permission denied/);
   await assert.rejects(scalar('select edu_diagnosis_actor_allowed($1)',[id(1)]),/permission denied/);
   await assert.rejects(scalar('select count(*) from edu_diagnosis_grants'),/permission denied/);
  }
  await db.exec('reset role;update edu_diagnosis_control set enabled=true,admin_only=false;set role service_role');
 });
 await t.test('explicit future public mode retains paid entitlement checks; trial never gives staff access',async()=>{
  assert.equal((await scalar('select edu_diagnosis_available($1)',[id(2)])).length,1);
  const paid=await begin(id(2));assert.ok(paid.id);
  assert.equal((await begin(id(2))).id,paid.id);
  await assert.rejects(scalar('select edu_diagnosis_restart($1,$2)',[id(2),paid.id]),/DIAGNOSIS_FORBIDDEN/);
  assert.equal((await scalar('select edu_diagnosis_context($1)',[id(2)])).adminTest,false);
  await db.query("update orders set status='refunded' where user_id=$1",[id(2)]);
  assert.equal(await scalar("select edu_diagnosis_has_access($1,'myin-n6')",[id(2)]),false);
  await db.query("update profiles set role='staff' where id=$1",[id(1)]);
  assert.equal(await proof(id(1),attempt.id),null);
 });
});
