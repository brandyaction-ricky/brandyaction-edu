import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=readFileSync(new URL('../supabase/migrations/20261007013956_diagnosis_new_starts_gate_minimal.sql',import.meta.url),'utf8');
test('minimal production gate preserves existing release behavior',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active',role text default 'student',full_name text);
 create table courses(id uuid primary key,title text);
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text);
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const f of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql','20261001230818_edu_diagnosis_admin_pilot.sql','20261002072505_edu_admin_diagnosis_retests.sql','20261003070134_diagnosis_admin_management.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 const scalar=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
 const begin=actor=>scalar('select edu_diagnosis_begin($1,$2)',[id(actor),id(100)]);
 const context=actor=>scalar('select edu_diagnosis_context($1)',[id(actor)]);
 const owner=async q=>{await db.exec('reset role');try{await db.exec(q);}finally{await db.exec('set role service_role');}};
 await db.query("insert into courses values($1,'fixture')",[id(100)]);
 await db.query("insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,'b13',$3,true),($4,$2,'b13-v3',$5,false)",[id(113),id(100),id(213),id(114),id(214)]);
 await db.exec('update edu_diagnosis_control set enabled=true,learners_published=true,admin_retests_enabled=true');
 for(const actor of [1,2,3,4]){
  await db.query('insert into profiles(id,role) values($1,$2)',[id(actor),actor===1?'admin':'student']);
  if(actor!==1)await db.query("insert into enrollments(id,user_id,course_id,status) values($1,$2,$3,'active')",[id(300+actor),id(actor),id(100)]);
 }
 await db.exec('set role service_role');
 const existing=await begin(2),admin=await begin(1);
 await scalar('select edu_diagnosis_sync_session($1,$2,$3,1,\'in_progress\')',[id(2),existing.id,id(602)]);
 await db.exec('reset role');
 const before=await db.query("select proname,prosrc from pg_proc where proname in ('edu_diagnosis_begin','edu_diagnosis_restart') order by proname");
 await db.exec(sql);
 await t.test('installs without changing grants or attempts, and reapplication preserves definitions',async()=>{
  assert.equal(await scalar('select new_starts_enabled from edu_diagnosis_control'),true);
  assert.equal(await scalar('select count(*)::int from edu_diagnosis_attempts'),2);
  const a=await db.query("select proname,prosrc from pg_proc where proname in ('edu_diagnosis_begin','edu_diagnosis_restart') order by proname");
  await db.exec(sql);assert.deepEqual((await db.query("select proname,prosrc from pg_proc where proname in ('edu_diagnosis_begin','edu_diagnosis_restart') order by proname")).rows,a.rows);
  assert.equal(before.rows.length,2);
 });
 await db.exec('set role service_role');
 await t.test('pause denies new starts/restarts while original attempt and report binding remain usable',async()=>{
  await owner('update edu_diagnosis_control set new_starts_enabled=false');
  await assert.rejects(begin(3),/DIAGNOSIS_STARTS_PAUSED/);
  await assert.rejects(scalar('select edu_diagnosis_restart($1,$2)',[id(1),admin.id]),/DIAGNOSIS_STARTS_PAUSED/);
  assert.equal((await begin(2)).id,existing.id);assert.equal((await context(2)).releaseId,id(213));
  assert.equal(await scalar('select count(*)::int from edu_diagnosis_attempts'),2);
 });
 await t.test('offer flip preserves old student and routes fresh unstarted enrollment to new offer',async()=>{
  await owner(`begin;update edu_diagnosis_offers set enabled=false where id='${id(113)}';update edu_diagnosis_offers set enabled=true where id='${id(114)}';update edu_diagnosis_control set new_starts_enabled=true;commit;`);
  assert.equal((await begin(2)).id,existing.id);assert.equal((await context(2)).releaseId,id(213));
  const fresh=await begin(3);assert.notEqual(fresh.id,existing.id);assert.equal((await context(3)).releaseId,id(214));
  assert.equal(await scalar('select offer_id from edu_diagnosis_attempts where id=$1',[existing.id]),id(113));
  assert.ok(await scalar('select edu_diagnosis_report_access($1,$2,$3,$4,$5,1)',[id(2),existing.id,id(602),id(213),'b13']));
 });
 await t.test('old admin restart semantics remain unchanged after retired offer',async()=>{
  await assert.rejects(scalar('select edu_diagnosis_restart($1,$2)',[id(1),admin.id]),/DIAGNOSIS_UNAVAILABLE/);
  assert.equal((await context(1)).attemptId,admin.id);
 });
 await t.test('browser roles cannot call begin/restart or alter the gate',async()=>{
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(begin(4),/permission denied/);
   await assert.rejects(db.exec('update edu_diagnosis_control set new_starts_enabled=false'),/permission denied/);
  }
  await db.exec('reset role');
 });
});
