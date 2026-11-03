import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration='20261008063228_diagnosis_release_transition_from_prod_gate.sql';

test('release transition preserves started bindings and reconciles only unused entitlements',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active',role text default 'student',full_name text);
 create table courses(id uuid primary key,title text);
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text);
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const file of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql','20261001230818_edu_diagnosis_admin_pilot.sql','20261002072505_edu_admin_diagnosis_retests.sql','20261003070134_diagnosis_admin_management.sql'])
  await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('./fixtures/diagnosis-production-start-gate.sql',import.meta.url),'utf8'));
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const call=(fn,args)=>scalar(`select ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 const begin=actor=>call('edu_diagnosis_begin',[id(actor),id(100)]);
 const context=actor=>call('edu_diagnosis_context',[id(actor)]);
 const grants=actor=>db.query('select id,offer_id,order_item_id,enrollment_id from edu_diagnosis_grants where user_id=$1 order by id',[id(actor)]).then(r=>r.rows);
 const owner=async sql=>{await db.exec('reset role');try{await db.exec(sql);}finally{await db.exec('set role service_role');}};
 const flip=next=>owner(`begin;update edu_diagnosis_offers set enabled=false;update edu_diagnosis_offers set enabled=true where id='${id(next)}';commit;`);
 await db.query("insert into courses values($1,'fixture course'),($2,'other course')",[id(100),id(101)]);
 await db.query("insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,'b13',$3,true),($4,$2,'b14',$5,false)",[id(113),id(100),id(213),id(114),id(214)]);
 await db.exec('update edu_diagnosis_control set enabled=true,learners_published=true,admin_retests_enabled=true');
 for(let actor=1;actor<=10;actor++){
  await db.query("insert into profiles(id,role) values($1,$2)",[id(actor),actor===1?'admin':'student']);
  if([3,6,8].includes(actor)){
   await db.query("insert into enrollments(id,user_id,course_id,status) values($1,$2,$3,'active')",[id(300+actor),id(actor),id(100)]);
   await db.query('insert into edu_diagnosis_grants(user_id,offer_id,enrollment_id) values($1,$2,$3)',[id(actor),id(113),id(300+actor)]);
  }else if(actor!==1){
   await db.query("insert into orders values($1,$2,'paid')",[id(400+actor),id(actor)]);
   await db.query('insert into order_items values($1,$2,$3)',[id(500+actor),id(400+actor),id(100)]);
   await call('edu_diagnosis_fulfill_order',[id(400+actor)]);
  }
 }
 await db.exec('set role service_role');
 const oldStudent=await begin(4),oldAdmin=await begin(1);
 await call('edu_diagnosis_sync_session',[id(4),oldStudent.id,id(604),7,'in_progress']);
 await call('edu_diagnosis_sync_session',[id(1),oldAdmin.id,id(601),9,'submitted']);
 const oldGrants=await grants(4),oldAdminGrants=await grants(1);
 await flip(114);
 await t.test('reproduces the pre-fix paid-grant mismatch without leaving a broken attempt',async()=>{
  await db.exec('begin');
  try{await begin(2);await assert.rejects(context(2),/DIAGNOSIS_FORBIDDEN/);}finally{await db.exec('rollback');}
 });
 await db.exec('reset role');
 await db.exec(readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
 await db.exec('update edu_diagnosis_control set new_starts_enabled=false');
 await db.exec(readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
 assert.equal(await scalar('select new_starts_enabled from edu_diagnosis_control'),false);
 await db.exec('update edu_diagnosis_control set new_starts_enabled=true');
 await db.exec('set role service_role');
 await t.test('migration defaults to allowing starts and browser roles cannot change the gate',async()=>{
  assert.equal(await scalar('select new_starts_enabled from edu_diagnosis_control'),true);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(begin(2),/permission denied/);
   await assert.rejects(db.exec('update edu_diagnosis_control set new_starts_enabled=false'),/permission denied/);
  }
  await db.exec('reset role;set role service_role');
 });
 let newStudent,newAdmin;
 await t.test('paid and manual unused grants move once; exact context and report proof work',async()=>{
  for(const actor of [2,3]){
   const before=await grants(actor),attempt=await begin(actor);if(actor===2)newStudent=attempt;
   const after=await grants(actor);assert.equal(after.length,1);assert.equal(after[0].id,before[0].id);
   assert.equal(after[0].offer_id,id(114));assert.equal((await context(actor)).releaseId,id(214));
   assert.equal((await begin(actor)).id,attempt.id);
   await call('edu_diagnosis_sync_session',[id(actor),attempt.id,id(600+actor),1,'in_progress']);
   assert.ok(await call('edu_diagnosis_report_access',[id(actor),attempt.id,id(600+actor),id(214),'b14',1]));
   assert.equal(await call('edu_diagnosis_report_access',[id(actor),attempt.id,id(600+actor),id(213),'b13',1]),null);
  }
 });
 await t.test('retired B13 continues with its original grant, revision and identity',async()=>{
  assert.equal((await begin(4)).id,oldStudent.id);assert.deepEqual(await grants(4),oldGrants);
  assert.equal((await context(4)).releaseId,id(213));assert.equal((await context(4)).revision,7);
  assert.equal(await call('edu_diagnosis_sync_session',[id(4),oldStudent.id,id(604),8,'submitted']),true);
  assert.ok(await call('edu_diagnosis_report_access',[id(4),oldStudent.id,id(604),id(213),'b13',8]));
  await assert.rejects(call('edu_diagnosis_begin',[id(4),id(101)]),/DIAGNOSIS_FORBIDDEN/);
 });
 await t.test('pause blocks new starts and restarts atomically but keeps existing work usable',async()=>{
  await owner('update edu_diagnosis_control set new_starts_enabled=false');
  const before=await scalar('select count(*)::int from edu_diagnosis_attempts'),grant=await grants(5);
  await assert.rejects(begin(5),/DIAGNOSIS_STARTS_PAUSED/);
  await assert.rejects(call('edu_diagnosis_restart',[id(1),oldAdmin.id]),/DIAGNOSIS_STARTS_PAUSED/);
  assert.equal(await scalar('select count(*)::int from edu_diagnosis_attempts'),before);assert.deepEqual(await grants(5),grant);
  assert.equal((await context(1)).attemptId,oldAdmin.id);assert.equal((await begin(4)).id,oldStudent.id);
  assert.equal(await call('edu_diagnosis_sync_session',[id(2),newStudent.id,id(602),2,'submitted']),true);
  assert.ok(await call('edu_diagnosis_report_access',[id(2),newStudent.id,id(602),id(214),'b14',2]));
  await owner('update edu_diagnosis_control set new_starts_enabled=true');
 });
 await t.test('admin restart selects active release and preserves historical report proof; replay during pause is idempotent',async()=>{
  newAdmin=await call('edu_diagnosis_restart',[id(1),oldAdmin.id]);
  assert.notEqual(newAdmin.id,oldAdmin.id);assert.equal((await context(1)).releaseId,id(214));
  assert.equal((await grants(1)).length,2);assert.ok((await grants(1)).some(g=>g.id===oldAdminGrants[0].id && g.offer_id===id(113)));
  assert.ok(await call('edu_diagnosis_report_access',[id(1),oldAdmin.id,id(601),id(213),'b13',9]));
  await owner('update edu_diagnosis_control set new_starts_enabled=false');
  assert.equal((await call('edu_diagnosis_restart',[id(1),oldAdmin.id])).id,newAdmin.id);
  await owner('update edu_diagnosis_control set new_starts_enabled=true');
 });
 await t.test('expired, refunded, revoked, closed and wrong-course entitlements cannot migrate or start',async()=>{
  await db.query("update orders set status='refunded' where user_id=$1",[id(7)]);
  await db.query('update enrollments set access_ends_at=now()-interval \'1 day\' where user_id=$1',[id(6)]);
  await db.query('update enrollments set revoked_at=now() where user_id=$1',[id(8)]);
  for(const actor of [6,7,8]){const before=await grants(actor);await assert.rejects(begin(actor),/DIAGNOSIS_FORBIDDEN/);assert.deepEqual(await grants(actor),before);}
  await owner('update edu_diagnosis_control set learners_published=false');
  await assert.rejects(begin(5),/DIAGNOSIS_FORBIDDEN/);assert.equal((await context(4)).attemptId,oldStudent.id);
  await owner('update edu_diagnosis_control set learners_published=true');
  await assert.rejects(call('edu_diagnosis_begin',[id(5),id(101)]),/DIAGNOSIS_UNAVAILABLE/);
 });
 await t.test('rollback keeps started B14 and moves only unused B14 grants back to B13',async()=>{
  // A purchase reconciled while B14 was active but never started.
  await db.query('update edu_diagnosis_grants set offer_id=$1 where user_id=$2',[id(114),id(9)]);
  const before=await grants(9),bound=await grants(2);
  await flip(113);
  assert.equal((await begin(2)).id,newStudent.id);assert.deepEqual(await grants(2),bound);
  assert.equal((await context(2)).releaseId,id(214));assert.equal((await context(2)).state,'submitted');
  await begin(9);assert.equal((await context(9)).releaseId,id(213));assert.equal((await grants(9))[0].id,before[0].id);
  const restarted=await call('edu_diagnosis_restart',[id(1),newAdmin.id]);assert.equal((await context(1)).releaseId,id(213));
  assert.equal((await call('edu_diagnosis_restart',[id(1),newAdmin.id])).id,restarted.id);
 });
 await t.test('failed restart with no active offer rolls back the current pointer',async()=>{
  const current=await context(1);await owner('update edu_diagnosis_offers set enabled=false');
  await assert.rejects(call('edu_diagnosis_restart',[id(1),current.attemptId]),/DIAGNOSIS_UNAVAILABLE/);
  assert.equal((await context(1)).attemptId,current.attemptId);assert.equal((await begin(4)).id,oldStudent.id);
 });
});
