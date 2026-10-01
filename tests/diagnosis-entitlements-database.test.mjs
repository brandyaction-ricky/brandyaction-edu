import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=readFileSync(new URL('../supabase/migrations/20261001062935_edu_diagnosis_entitlements.sql',import.meta.url),'utf8');
async function setup(t,{enabled=true}={}) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,status text default 'active');
 create table courses(id uuid primary key);
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text);
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
 create table enrollments(id uuid primary key,user_id uuid references profiles(id),course_id uuid references courses(id),order_item_id uuid references order_items(id),status text,revoked_at timestamptz);
 grant select,insert,update on all tables in schema public to service_role;`);
 await db.exec(migration);
 const user=id(),other=id(),course=id(),offer=id(),release=id(),order=id(),item=id();
 await db.query('insert into profiles(id) values($1),($2)',[user,other]);await db.query('insert into courses values($1)',[course]);
 await db.query('insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,$3,$4,true)',[offer,course,'v1',release]);
 if(enabled)await db.exec('update edu_diagnosis_control set enabled=true');
 await db.query("insert into orders values($1,$2,'pending')",[order,user]);await db.query('insert into order_items values($1,$2,$3)',[item,order,course]);
 await db.exec('set role service_role');
 const rpc=async(name,args=[]) =>(await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
 const begin=(actor=user,c=course)=>rpc('edu_diagnosis_begin',[actor,c]);
 const pay=()=>db.query("update orders set status='paid' where id=$1",[order]);
 const owner=async(sql,args=[])=>{await db.exec('reset role');try{return args.length?await db.query(sql,args):await db.exec(sql);}finally{await db.exec('set role service_role');}};
 return {db,rpc,begin,pay,owner,user,other,course,offer,release,order,item};
}
test('disabled rollout changes no payment behavior and cannot start a diagnosis',async t=>{
 const h=await setup(t,{enabled:false});await h.pay();assert.equal((await h.db.query('select * from edu_diagnosis_grants')).rows.length,0);await assert.rejects(h.begin(),/DIAGNOSIS_DISABLED/);
});
test('paid fulfillment and 20 simultaneous starts produce one grant, attempt and durable event',async t=>{
 const h=await setup(t);await assert.rejects(h.begin(),/DIAGNOSIS_FORBIDDEN/);await h.pay();await h.rpc('edu_diagnosis_fulfill_order',[h.order]);
 const results=await Promise.all(Array.from({length:20},()=>h.begin()));assert.equal(new Set(results.map(r=>r.id)).size,1);
 for(const table of ['edu_diagnosis_grants','edu_diagnosis_attempts','edu_diagnosis_outbox'])assert.equal((await h.db.query('select * from '+table)).rows.length,1);
 await assert.rejects(h.begin(h.other),/DIAGNOSIS_FORBIDDEN/);assert.equal((await h.rpc('edu_diagnosis_read',[h.other])).state,'not_started');
});
test('same account keeps the first release and response across packages and refunded repurchases',async t=>{
 const h=await setup(t);await h.pay();const first=await h.begin();
 const course=id(),offer=id(),order=id(),item=id();await h.owner('insert into courses values($1)',[course]);
 await h.owner("insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,'v2',$3,true)",[offer,course,id()]);
 await h.db.query("insert into orders values($1,$2,'pending')",[order,h.user]);await h.db.query('insert into order_items values($1,$2,$3)',[item,order,course]);await h.db.query("update orders set status='paid' where id=$1",[order]);
 await h.db.query("update orders set status='refunded' where id=$1",[h.order]);
 await assert.rejects(h.begin(h.user,h.course),/DIAGNOSIS_FORBIDDEN/);assert.equal((await h.begin(h.user,course)).id,first.id);
 const a=(await h.db.query('select * from edu_diagnosis_attempts')).rows[0];assert.equal(a.offer_id,h.offer);
 await assert.rejects(h.owner("update edu_diagnosis_offers set package_version='changed' where id=$1",[h.offer]),/DIAGNOSIS_OFFER_IMMUTABLE/);
});
test('manual enrollment grants work independently of cohort and revoke when source revokes',async t=>{
 const h=await setup(t),enrollment=id();await h.db.query("insert into enrollments values($1,$2,$3,null,'active',null)",[enrollment,h.user,h.course]);await h.begin();
 await h.db.query("update enrollments set revoked_at=now() where id=$1",[enrollment]);await assert.rejects(h.rpc('edu_diagnosis_read',[h.user]),/DIAGNOSIS_FORBIDDEN/);
});
test('paid enrollment cannot bypass refunded order through the manual enrollment path',async t=>{
 const h=await setup(t);await h.pay();await h.db.query("insert into enrollments values($1,$2,$3,$4,'active',null)",[id(),h.user,h.course,h.item]);await h.begin();
 await h.db.query("update orders set status='partially_refunded' where id=$1",[h.order]);await assert.rejects(h.begin(),/DIAGNOSIS_FORBIDDEN/);
});
test('stale leases cannot acknowledge after reclaim; retries reuse the same remote identity',async t=>{
 const h=await setup(t);await h.pay();const a=await h.begin(),[j]=await h.rpc('edu_diagnosis_claim',[5]);assert.equal((await h.rpc('edu_diagnosis_claim',[5])).length,0);
 const payload=await h.rpc('edu_diagnosis_dispatch',[j.id,j.lease]);assert.equal(payload.attemptId,a.id);assert.equal(payload.subject,h.user);assert.equal(payload.releaseId,h.release);
 await h.db.query("update edu_diagnosis_outbox set lease_until=now()-interval '1 second' where id=$1",[j.id]);const[k]=await h.rpc('edu_diagnosis_claim',[5]);assert.notEqual(k.lease,j.lease);assert.equal(await h.rpc('edu_diagnosis_ack',[j.id,j.lease,id()]),false);
 assert.deepEqual(await h.rpc('edu_diagnosis_dispatch',[k.id,k.lease]),payload);assert.equal(await h.rpc('edu_diagnosis_ack',[k.id,k.lease,id()]),true);assert.equal((await h.rpc('edu_diagnosis_read',[h.user])).state,'in_progress');
});
test('refund before or during dispatch stops access and never accepts a remote response',async t=>{
 const h=await setup(t);await h.pay();await h.begin();const[j]=await h.rpc('edu_diagnosis_claim',[5]);await h.rpc('edu_diagnosis_dispatch',[j.id,j.lease]);await h.db.query("update orders set status='refunded' where id=$1",[h.order]);assert.equal(await h.rpc('edu_diagnosis_ack',[j.id,j.lease,id()]),false);
 const row=(await h.db.query('select * from edu_diagnosis_outbox')).rows[0];assert.equal(row.last_code,'ACCESS_REVOKED');assert.equal(row.state,'needs_review');
});
test('bounded retries back off and surface needs-review instead of an endless spinner',async t=>{
 const h=await setup(t);await h.pay();await h.begin();
 for(let n=1;n<=8;n++){const[j]=await h.rpc('edu_diagnosis_claim',[5]);assert.equal(j.tries,n);await h.rpc('edu_diagnosis_retry',[j.id,j.lease,'REMOTE_UNAVAILABLE']);assert.equal((await h.rpc('edu_diagnosis_claim',[5])).length,0);await h.db.exec("update edu_diagnosis_outbox set available_at=now()-interval '1 second'");}
 assert.equal((await h.rpc('edu_diagnosis_read',[h.user])).state,'needs_review');
});
test('abandoned final lease and emergency disable fail closed',async t=>{
 const h=await setup(t);await h.pay();await h.begin();let[j]=await h.rpc('edu_diagnosis_claim',[1]);await h.owner('update edu_diagnosis_control set enabled=false');assert.equal(await h.rpc('edu_diagnosis_dispatch',[j.id,j.lease]),null);
 await h.owner('update edu_diagnosis_control set enabled=true');await h.db.exec("update edu_diagnosis_outbox set tries=8,lease_until=now()-interval '1 second'");assert.deepEqual(await h.rpc('edu_diagnosis_claim',[1]),[]);assert.equal((await h.rpc('edu_diagnosis_read',[h.user])).state,'needs_review');
});
test('browser database roles cannot read, create rights, run a worker or impersonate another user',async t=>{
 const h=await setup(t);await h.pay();await h.begin();
 for(const role of ['anon','authenticated']){await h.db.exec('reset role;set role '+role);
 for(const table of ['edu_diagnosis_control','edu_diagnosis_offers','edu_diagnosis_grants','edu_diagnosis_attempts','edu_diagnosis_outbox'])await assert.rejects(h.db.query('select * from '+table),/permission denied/);
 for(const [fn,args] of [['edu_diagnosis_read',[h.user]],['edu_diagnosis_begin',[h.user,h.course]],['edu_diagnosis_claim',[1]],['edu_diagnosis_fulfill_order',[h.order]]])await assert.rejects(h.rpc(fn,args),/permission denied/);
 }
});
