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
 create table mission_submissions(id uuid primary key,status text);
 create table site_settings(key text primary key,value jsonb);
 create table enrollments(id uuid primary key,user_id uuid);
 create table edu_ongoing_completions(id uuid primary key,enrollment_id uuid,lesson_id uuid);
 create table edu_questions(id uuid primary key,user_id uuid,answer text);
 create table edu_lesson_block_submissions(id uuid primary key,enrollment_id uuid,outcome text,lesson_id uuid default gen_random_uuid());
 create table edu_lesson_block_reviews(id uuid primary key,submission_id uuid,decision text);
 grant select,insert,update on all tables in schema public to service_role;`);
 await db.exec(migration('20260928194336_edu_member_messages.sql'));
 await db.exec(migration('20260928200320_edu_web_push_delivery.sql'));
 await db.exec(`alter table enrollments add column course_id uuid, add column order_item_id uuid, add column status text default 'active', add column revoked_at timestamptz, add column access_starts_at timestamptz default '2000-01-01', add column access_ends_at timestamptz;
 create table courses(id uuid primary key,title text);
 create table orders(id uuid primary key,user_id uuid references profiles(id),status text);
 create table order_items(id uuid primary key,order_id uuid references orders(id),course_id uuid references courses(id));
 grant select,insert,update on all tables in schema public to service_role;`);
 for(const f of ['20261001062935_edu_diagnosis_entitlements.sql','20261001070447_edu_diagnosis_session_bridge.sql','20261001084748_edu_diagnosis_report_access.sql','20261001230818_edu_diagnosis_admin_pilot.sql','20261002072505_edu_admin_diagnosis_retests.sql','20261003070134_diagnosis_admin_management.sql','20261002102249_learner_feedback_question_push.sql','20261005005414_diagnosis_report_ready_push.sql'])await db.exec(migration(f));
 const admin=id(),student=id(),other=id(),enrollment=id();
 for(const [who,role] of [[admin,'admin'],[student,'member'],[other,'member']])await db.query("insert into profiles values($1,$2,'active','가상 사용자','fixture@example.test')",[who,role]);
 await db.query('insert into enrollments(id,user_id) values($1,$2)',[enrollment,student]);
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
 const course=id(),offer=id();
 await owner("insert into courses values($1,'fixture')",[course]);
 await owner("insert into edu_diagnosis_offers(id,course_id,package_version,release_id,enabled) values($1,$2,'fixture',$3,true)",[offer,course,id()]);
 await owner("update enrollments set course_id=$1 where id=$2",[course,enrollment]);
 await owner('update edu_diagnosis_control set enabled=true,learners_published=true,admin_retests_enabled=true');
 const begin=async(actor=student)=>{const a=await rpc('edu_diagnosis_begin',[actor,course]);await rpc('edu_diagnosis_sync_session',[actor,a.id,id(),1,'in_progress']);return a.id;};
 const submit=async(attempt,actor=student)=>{const c=await rpc('edu_diagnosis_context',[actor]);await rpc('edu_diagnosis_sync_session',[actor,attempt,c.responseId,2,'submitted']);};
 const claimReport=()=>rpc('edu_claim_report_watches',[20]);
 const finishReport=(job,state='ready')=>rpc('edu_finish_report_watch',[job.attemptId,job.lease,state]);
 return{begin,submit,claimReport,finishReport,course,offer,db,rpc,owner,enable,admin,student,other,enrollment,endpoint,register,send,claim,read,finish,count};
}
test('submit schedules even with page closed; repeated completion creates exactly one push per device',async t=>{
 const h=await setup(t);await h.enable();await h.register();await h.register(h.student,h.endpoint+'2');
 const attempt=await h.begin();assert.deepEqual(await h.claimReport(),[]);await h.submit(attempt);
 const [job]=await h.claimReport();assert.equal(job.attemptId,attempt);assert.deepEqual(await h.claimReport(),[]);
 assert.equal(await h.finishReport(job),true);assert.equal(await h.finishReport(job),false);
 assert.equal(await h.count('edu_push_events'),1);assert.equal(await h.count('edu_push_deliveries'),2);
 const deliveries=await h.claim();assert.equal((await h.read(deliveries[0])).path,'/my/diagnosis');
 await h.owner("update enrollments set status='revoked'");assert.equal(await h.read(deliveries[0]),null);
});
test('pending, review and errors do not notify; expired lease retries with fenced completion',async t=>{
 const h=await setup(t);await h.enable();await h.register();await h.submit(await h.begin());
 let [job]=await h.claimReport();await h.finishReport(job,'processing');assert.equal(await h.count('edu_push_events'),0);assert.deepEqual(await h.claimReport(),[]);
 for(const state of ['needs_review','unavailable']){await h.owner('update edu_diagnosis_report_watches set next_check_at=now()');[job]=await h.claimReport();await h.finishReport(job,state);assert.equal(await h.count('edu_push_events'),0);}
 await h.owner('update edu_diagnosis_report_watches set next_check_at=now()');[job]=await h.claimReport();
 await h.owner("update edu_diagnosis_report_watches set lease_until=now()-interval '1 second'");const [retry]=await h.claimReport();assert.notEqual(retry.lease,job.lease);assert.equal(await h.finishReport(job),false);assert.equal(await h.finishReport(retry),true);
});
test('revocation before finish and admin retest cancel old notifications, with no historical backfill',async t=>{
 const h=await setup(t);await h.enable();await h.register();await h.submit(await h.begin());const [job]=await h.claimReport();
 await h.owner("update profiles set status='inactive' where id=$1",[h.student]);await h.finishReport(job);assert.equal(await h.count('edu_push_events'),0);
 await h.register(h.admin,h.endpoint+'admin');const a=await h.begin(h.admin);await h.submit(a,h.admin);const [adminJob]=await h.claimReport();
 await h.rpc('edu_diagnosis_restart',[h.admin,a]);await h.finishReport(adminJob);assert.equal(await h.count('edu_push_events'),0);
 const rows=(await h.db.query('select state from edu_diagnosis_report_watches')).rows;assert.ok(rows.every(r=>r.state==='cancelled'));
});
test('queue is server-only; disabled transport pauses and other notification types stay disabled',async t=>{
 const h=await setup(t);await h.enable();await h.register();const attempt=await h.begin();await h.submit(attempt);await h.send();assert.equal(await h.count('edu_push_events'),0);
 await h.owner('update edu_push_control set enabled=false');assert.deepEqual(await h.claimReport(),[]);await h.enable();const [job]=await h.claimReport();await h.owner('update edu_push_control set enabled=false');assert.equal(await h.finishReport(job),false);assert.equal(await h.count('edu_push_events'),0);
 for(const role of ['anon','authenticated']){await h.db.exec('reset role;set role '+role);for(const sql of ['select * from edu_diagnosis_report_watches','select edu_claim_report_watches(20)',`select edu_finish_report_watch('${attempt}','${id()}','ready')`,`select edu_watch_diagnosis_report('${h.student}','${attempt}')`])await assert.rejects(()=>h.db.exec(sql),/permission denied/);}
});
