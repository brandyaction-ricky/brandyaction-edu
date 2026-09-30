import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const migration = name => fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
async function setup(t) {
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema edu_private; grant usage on schema edu_private to service_role;
 create table profiles(id uuid primary key,role text,status text,full_name text,email text);
 create table site_settings(key text primary key,value jsonb);
 create table enrollments(id uuid primary key,user_id uuid);
 create table edu_ongoing_completions(id uuid primary key,enrollment_id uuid,lesson_id uuid);
 create table edu_questions(id uuid primary key,user_id uuid,answer text);
 create table edu_lesson_block_submissions(id uuid primary key,enrollment_id uuid,outcome text,lesson_id uuid default gen_random_uuid());
 create table edu_lesson_block_reviews(id uuid primary key,submission_id uuid,decision text);
 grant select,insert,update on all tables in schema public to service_role;`);
 await db.exec(migration('20260928194336_edu_member_messages.sql'));
 await db.exec(migration('20260928200320_edu_web_push_delivery.sql'));
 const admin=id(),student=id(),other=id(),enrollment=id();
 for(const [who,role] of [[admin,'admin'],[student,'member'],[other,'member']])await db.query("insert into profiles values($1,$2,'active','가상 사용자','fixture@example.test')",[who,role]);
 await db.query('insert into enrollments values($1,$2)',[enrollment,student]);
 await db.exec('set role service_role');
 const rpc=async(name,args=[]) => (await db.query(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args)).rows[0].r;
 const owner=async(sql,args=[])=>{await db.exec('reset role');try{return args.length?await db.query(sql,args):await db.exec(sql);}finally{await db.exec('set role service_role');}};
 const enable=()=>owner('update edu_push_control set enabled=true');
 const endpoint='https://fcm.googleapis.com/fcm/send/synthetic';
 const register=(actor=student,url=endpoint,key='A'.repeat(87))=>rpc('edu_register_push',[actor,url,key,'B'.repeat(22)]);
 const send=(actor=admin,to=[student],request=id())=>rpc('edu_send_member_message',[actor,request,'가상 개인 메시지',to,null,null]);
 const claim=()=>rpc('edu_claim_push',[15]);
 const read=job=>rpc('edu_read_push_delivery',[job.id,job.lease]);
 const finish=(job,outcome='sent',code='ACCEPTED')=>rpc('edu_finish_push',[job.id,job.lease,outcome,code]);
 const count=async table=>(await db.query(`select count(*)::integer n from ${table}`)).rows[0].n;
 return{db,rpc,owner,enable,admin,student,other,enrollment,endpoint,register,send,claim,read,finish,count};
}
test('push is paused by default; disabled sends still save messages without queueing or retroactive delivery',async t=>{
 const h=await setup(t);await assert.rejects(()=>h.register(),/PUSH_DISABLED/);await h.send();assert.equal(await h.count('edu_member_messages'),1);assert.equal(await h.count('edu_push_events'),0);assert.deepEqual(await h.claim(),[]);
 await h.enable();await h.register();assert.deepEqual(await h.claim(),[]);
 await assert.rejects(()=>h.db.exec('update edu_push_control set enabled=false'),/permission denied/);
});
test('atomic messages produce one queue item per opted-in recipient/device, including idempotent request replay',async t=>{
 const h=await setup(t);await h.enable();await h.register();await h.register(h.student,h.endpoint+'2');const request=id();
 await h.send(h.admin,[h.student,h.other],request);await h.send(h.admin,[h.other,h.student],request);
 assert.equal(await h.count('edu_push_events'),2);assert.equal(await h.count('edu_push_deliveries'),2);
 const jobs=await h.claim();assert.equal(jobs.length,2);assert.deepEqual(await h.claim(),[]);
 assert.equal((await h.read(jobs[0])).path,'/my/messages');assert.equal(await h.finish(jobs[0]),true);assert.equal(await h.finish(jobs[0]),false);
 await h.owner(`create function fail_push() returns trigger language plpgsql as $$begin raise exception 'fixture failure';end;$$;create trigger fail_push before insert on edu_push_deliveries for each row execute function fail_push();`);
 await assert.rejects(()=>h.send(),/fixture failure/);assert.equal(await h.count('edu_member_messages'),2);assert.equal(await h.count('edu_push_events'),2);
});
test('device rebind rotates ownership; old leases cannot send or disable the new account device',async t=>{
 const h=await setup(t);await h.enable();const first=await h.register();assert.deepEqual(await h.register(),first);await h.send();const[job]=await h.claim();
 const next=await h.register(h.other);assert.notEqual(first.binding,next.binding);assert.equal(await h.read(job),null);
 assert.equal((await h.rpc('edu_push_device',[h.student,h.endpoint,true])).enabled,false);
 assert.equal((await h.rpc('edu_push_device',[h.other,h.endpoint,false])).enabled,true);
 await h.finish(job,'expired','HTTP_410');assert.equal((await h.rpc('edu_push_device',[h.other,h.endpoint,false])).enabled,true);
 await assert.rejects(()=>h.register(h.other,h.endpoint,'C'.repeat(87)),/PUSH_ENDPOINT_CHANGED/);
 await h.rpc('edu_push_device',[h.other,h.endpoint,true]);const third=await h.register(h.other);assert.notEqual(third.binding,next.binding);
});
test('expired provider subscriptions disable only matching devices; retries back off and exhaust after six attempts',async t=>{
 const h=await setup(t);await h.enable();await h.register();await h.send();let[job]=await h.claim();
 await h.finish(job,'retry','HTTP_503');assert.deepEqual(await h.claim(),[]);
 for(let n=1;n<6;n++){await h.owner("update edu_push_deliveries set available_at=now()-interval '1 second'");[job]=await h.claim();assert.ok(job);await h.finish(job,'retry','TRANSPORT_ERROR');}
 assert.equal((await h.db.query('select status from edu_push_deliveries')).rows[0].status,'failed');assert.deepEqual(await h.claim(),[]);
 await h.send();[job]=await h.claim();await h.finish(job,'expired','HTTP_410');assert.equal((await h.rpc('edu_push_device',[h.student,h.endpoint,false])).enabled,false);
});
test('expired worker leases recover once and stale acknowledgements cannot finish a newer attempt',async t=>{
 const h=await setup(t);await h.enable();await h.register();await h.send();const[first]=await h.claim();
 await h.owner("update edu_push_deliveries set lease_until=now()-interval '1 second'");const[second]=await h.claim();assert.notEqual(first.lease,second.lease);assert.equal(await h.finish(first),false);assert.equal(await h.finish(second),true);
 await h.send();await h.claim();await h.owner("update edu_push_deliveries set attempts=6,lease_until=now()-interval '1 second' where status='processing'");assert.deepEqual(await h.claim(),[]);
 assert.equal((await h.db.query("select last_code from edu_push_deliveries where status='failed'")).rows[0].last_code,'LEASE_EXHAUSTED');
});
test('paused, inactive, expired and revoked-admin deliveries never yield transport credentials',async t=>{
 const h=await setup(t);await h.enable();await h.register();await h.send();let[job]=await h.claim();
 await h.owner('update edu_push_control set enabled=false');assert.equal(await h.read(job),null);assert.deepEqual(await h.claim(),[]);
 await h.enable();await h.owner("update profiles set status='inactive' where id=$1",[h.student]);assert.equal(await h.read(job),null);assert.deepEqual(await h.claim(),[]);
 await h.owner("update profiles set status='active' where id=$1",[h.student]);await h.send();await h.owner("update edu_push_events set created_at=now()-interval '25 hours'");assert.deepEqual(await h.claim(),[]);
 await h.register(h.admin,h.endpoint+'admin');await h.db.query('insert into edu_questions values($1,$2,null)',[id(),h.student]);[job]=await h.claim();assert.equal((await h.read(job)).path,'/admin/questions');
 await h.owner("update profiles set role='member' where id=$1",[h.admin]);assert.equal(await h.read(job),null);assert.deepEqual(await h.claim(),[]);
});
test('question and mentor events queue only real transitions for correct recipients',async t=>{
 const h=await setup(t);await h.enable();await h.register();await h.register(h.admin,h.endpoint+'admin');const question=id(),submission=id();
 await h.db.query('insert into edu_questions values($1,$2,null)',[question,h.student]);
 await h.db.query("update edu_questions set answer='답변' where id=$1",[question]);await h.db.query("update edu_questions set answer='답변' where id=$1",[question]);
 await h.db.query('insert into edu_lesson_block_submissions(id,enrollment_id,outcome) values($1,$2,$3)',[submission,h.enrollment,'submitted']);
 await h.db.query('insert into edu_lesson_block_submissions(id,enrollment_id,outcome) values($1,$2,$3)',[id(),h.enrollment,'completed']);
 await h.db.query('insert into edu_lesson_block_reviews values($1,$2,$3)',[id(),submission,'approved']);
 await h.db.query('insert into edu_lesson_block_reviews values($1,$2,$3)',[id(),submission,'changes_requested']);
 await h.db.query('insert into edu_lesson_block_reviews values($1,$2,$3)',[id(),submission,'reopened']);
 const rows=(await h.db.query('select user_id,kind from edu_push_events')).rows;assert.equal(rows.length,5);
 assert.match((await h.db.query("select path from edu_push_events where kind='review' limit 1")).rows[0].path,/^\/learn\//);
 assert.equal(rows.filter(r=>r.user_id===h.admin).length,2);assert.equal(rows.filter(r=>r.user_id===h.student).length,3);
});
test('ten-device limit, active account and direct browser role restrictions are enforced in SQL',async t=>{
 const h=await setup(t);await h.enable();for(let n=0;n<10;n++)await h.register(h.student,h.endpoint+n);await assert.rejects(()=>h.register(),/PUSH_DEVICE_LIMIT/);
 await h.owner("update profiles set status='inactive' where id=$1",[h.other]);await assert.rejects(()=>h.register(h.other),/MESSAGE_FORBIDDEN/);
 for(const role of ['anon','authenticated']){await h.db.exec('reset role;set role '+role);for(const sql of ['select * from edu_push_subscriptions','select * from edu_push_events','select * from edu_push_deliveries','select * from edu_push_control','select edu_claim_push(15)',`select edu_register_push('${h.student}','${h.endpoint}','${'A'.repeat(87)}','${'B'.repeat(22)}')`,`select edu_private.enqueue_push('${h.student}','message','fake','/my/messages')`])await assert.rejects(()=>h.db.exec(sql),/permission denied/);}
});

test('a submission already automatically or manually reviewed never alerts a mentor as pending work',async t=>{
 const h=await setup(t);await h.enable();await h.register(h.admin);const submission=id();
 await h.db.query('insert into edu_lesson_block_submissions(id,enrollment_id,outcome) values($1,$2,$3)',[submission,h.enrollment,'submitted']);
 await h.db.query('insert into edu_lesson_block_reviews values($1,$2,$3)',[id(),submission,'auto_approved']);
 const[job]=await h.claim();assert.ok(job);assert.equal(await h.read(job),null);
});
