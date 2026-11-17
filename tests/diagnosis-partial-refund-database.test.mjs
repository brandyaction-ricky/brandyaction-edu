import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=file=>readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
const patch=sql('20261110101544_n6_partial_refund_access.sql');

test('partial refunds preserve active purchased N6 rights and frozen sessions, without opening refunded or unrelated rights',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active',role text default 'student',full_name text,email text,phone text,contact_email text,created_at timestamptz default now());
 create table courses(id uuid primary key,title text);
 create table cohorts(id uuid primary key,course_id uuid references courses(id),name text,cohort_code text,created_at timestamptz default now());
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text,order_number text,customer_name text,customer_email text,customer_phone text,created_at timestamptz default now());
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id),cohort_id uuid references cohorts(id));
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),cohort_id uuid references cohorts(id),order_item_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz default '2000-01-01',access_ends_at timestamptz);
 create table site_settings(key text primary key,value jsonb);create table crm_tags(id uuid primary key,name text);create table crm_member_tags(member_id uuid,tag_id uuid);
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const file of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql','20261001230818_edu_diagnosis_admin_pilot.sql','20261002072505_edu_admin_diagnosis_retests.sql','20261003070134_diagnosis_admin_management.sql','20261006070359_member_payment_directory_search.sql','20261006095152_diagnosis_admin_member_lookup.sql','20261008063228_diagnosis_release_transition_from_prod_gate.sql','20261020080824_edu_n6_cohort_publication.sql'])await db.exec(sql(file));
 const scalar=async(q,args=[])=>Object.values((await db.query(q,args)).rows[0])[0];
 const call=(fn,args)=>scalar(`select ${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
 const begin=user=>call('edu_diagnosis_begin',[id(user),id(100)]);
 const access=user=>call('edu_diagnosis_has_access',[id(user),'myin-n6',null]);
 const read=user=>call('edu_diagnosis_context',[id(user)]);
 await db.query("insert into courses values($1,'N6'),($2,'Other')",[id(100),id(101)]);
 await db.query("insert into cohorts(id,course_id,name) values($1,$2,'5'),($3,$2,'6')",[id(110),id(100),id(111)]);
 await db.query("insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,'v1',$3,true)",[id(120),id(100),id(130)]);
 await db.exec('update edu_diagnosis_control set enabled=true,learners_published=true');
 for(let user=1;user<=5;user++){
  await db.query('insert into profiles(id) values($1)',[id(user)]);
  await db.query("insert into orders(id,user_id,status) values($1,$2,'paid')",[id(200+user),id(user)]);
  await db.query('insert into order_items values($1,$2,$3,$4)',[id(300+user),id(200+user),id(100),id(110)]);
  await db.query("insert into enrollments(id,user_id,course_id,cohort_id,order_item_id,status) values($1,$2,$3,$4,$5,'active')",[id(400+user),id(user),id(100),id(110),id(300+user)]);
 }
 await db.exec('set role service_role');
 const first=await begin(1);
 await call('edu_diagnosis_sync_session',[id(1),first.id,id(500),7,'in_progress']);
 await db.query("update orders set status='partially_refunded' where user_id=$1",[id(1)]);
 await t.test('reproduces the live regression before applying the patch',async()=>{
  assert.equal(await access(1),false);await assert.rejects(begin(1),/DIAGNOSIS_FORBIDDEN/);
  assert.equal(await call('edu_diagnosis_student_eligible',[id(1)]),false);
 });
 const snapshot=()=>db.query('select * from edu_diagnosis_attempts order by id').then(r=>r.rows);
 const grants=()=>db.query('select * from edu_diagnosis_grants order by id').then(r=>r.rows);
 const before=await snapshot(),beforeGrants=await grants();
 await db.exec('reset role');await db.exec(patch);await db.exec('set role service_role');
 const report=()=>call('edu_diagnosis_report_access',[id(1),first.id,id(500),id(130),'v1',7]);
 await t.test('restores the same in-progress attempt and report authorization without changing stored identities',async()=>{
  assert.equal(await access(1),true);assert.equal((await begin(1)).id,first.id);
  assert.equal((await read(1)).revision,7);assert.ok(await report());
  assert.equal(await call('edu_diagnosis_student_eligible',[id(1)]),true);
  assert.deepEqual(await call('edu_diagnosis_student_cohorts',[id(1)]),id(110));
  assert.equal((await call('edu_diagnosis_available',[id(1)])).length,1);
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await grants(),beforeGrants);
 });
 await t.test('partially refunded purchases can start lazily once and keep publication gating',async()=>{
  await db.query("update orders set status='partially_refunded' where user_id=$1",[id(2)]);
  const a=await begin(2);assert.equal((await begin(2)).id,a.id);assert.equal(await access(2),true);
  await db.exec('reset role;update edu_diagnosis_control set learners_published=false;set role service_role');
  await db.query("update orders set status='partially_refunded' where user_id=$1",[id(3)]);
  await assert.rejects(begin(3),/DIAGNOSIS_FORBIDDEN/);
  assert.equal((await begin(1)).id,first.id);
  await db.exec('reset role;update edu_diagnosis_control set learners_published=true;set role service_role');
 });
 for(const [label,change] of [
  ['full refund',"update orders set status='refunded' where user_id='"+id(1)+"'"],
  ['cancelled',"update orders set status='cancelled' where user_id='"+id(1)+"'"],
  ['pending',"update orders set status='pending' where user_id='"+id(1)+"'"],
  ['revoked enrollment',"update enrollments set status='revoked' where user_id='"+id(1)+"'"],
  ['revoked timestamp',"update enrollments set revoked_at=now() where user_id='"+id(1)+"'"],
  ['expired enrollment',"update enrollments set access_ends_at=now()-interval '1 day' where user_id='"+id(1)+"'"],
  ['future enrollment',"update enrollments set access_starts_at=now()+interval '1 day' where user_id='"+id(1)+"'"],
  ['wrong enrollment owner',"update enrollments set user_id='"+id(4)+"' where user_id='"+id(1)+"'"],
  ['wrong course',"update enrollments set course_id='"+id(101)+"' where user_id='"+id(1)+"'"],
  ['wrong cohort',"update enrollments set cohort_id='"+id(111)+"' where user_id='"+id(1)+"'"],
  ['missing linked enrollment',"update enrollments set order_item_id=null where user_id='"+id(1)+"'"],
  ['inactive member',"update profiles set status='suspended' where id='"+id(1)+"'"]
 ])await t.test(label+' is denied for partial refunds',async()=>{
  await db.exec('begin');try{await db.exec(change);assert.equal(await access(1),false);assert.equal(await report(),null);await assert.rejects(read(1),/DIAGNOSIS_FORBIDDEN/);}finally{await db.exec('rollback');}
 });
 await t.test('unrefunded paid order keeps prior access independent of expired curriculum',async()=>{
  await db.query("update enrollments set status='expired',access_ends_at='2000-01-01' where user_id=$1",[id(4)]);
  assert.ok(await begin(4));assert.equal(await access(4),true);
 });
 await t.test('another purchase cannot authorize a refunded frozen attempt; retired offer remains usable after partial refund',async()=>{
  await db.exec('reset role;update edu_diagnosis_offers set enabled=false');
  await db.query("insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,'v2',$3,true)",[id(121),id(100),id(131)]);
  await db.exec('set role service_role');
  assert.equal((await begin(1)).id,first.id);assert.ok(await report());
  assert.equal((await read(1)).releaseId,id(130));
  await db.query("update orders set status='partially_refunded' where user_id=$1",[id(5)]);
  await db.query('insert into edu_diagnosis_grants(user_id,offer_id,order_item_id) values($1,$2,$3)',[id(5),id(120),id(305)]);
  await begin(5);assert.equal((await read(5)).releaseId,id(131));
  await db.query("update orders set status='refunded' where user_id=$1",[id(1)]);assert.equal(await report(),null);
 });
 await t.test('migration can be reapplied and does not grant browser roles access',async()=>{
  const current=await snapshot(),currentGrants=await grants();await db.exec('reset role');await db.exec(patch);
  assert.deepEqual(await snapshot(),current);assert.deepEqual(await grants(),currentGrants);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(call('edu_diagnosis_order_item_allowed',[id(301),id(1),id(100)]),/permission denied/);
   await assert.rejects(begin(1),/permission denied/);
  }
 });
});
