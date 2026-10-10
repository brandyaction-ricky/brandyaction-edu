import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID as id} from 'node:crypto';
import {setup as care} from './helpers/learning-care.mjs';
const read=n=>fs.readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
async function setup(t,{push=false,kakao=false}={}) {
 const f=await care(t);
 Object.assign(f,await f.add("learning",1));
 await f.db.exec(`reset role; alter table profiles add column contact_email text; alter table edu_member_messages add column deleted_at timestamptz; grant update(deleted_at) on edu_member_messages to service_role; alter table edu_questions add column answer text;`);
 await f.db.exec(read('20260928200320_edu_web_push_delivery.sql'));
 const latest=read('20261005005414_diagnosis_report_ready_push.sql');
 await f.db.exec(latest.slice(latest.indexOf('alter table public.edu_push_events'),latest.indexOf('create function public.edu_finish_report_watch')));
 await f.db.exec("create function edu_private.report_push_allowed(uuid,text) returns boolean language sql as $$ select true $$; grant execute on function edu_private.report_push_allowed(uuid,text) to service_role;");
 await f.db.exec(read('20261008111200_learning_care_delivery_channels.sql'));
 await f.db.exec("create table auth.identities(user_id uuid,provider text); revoke all on auth.identities from service_role,anon,authenticated;");
 await f.db.exec(read('20261010042840_learning_care_kakao_mobile_routing.sql'));
 if(kakao)await f.db.query("insert into auth.identities values($1,'kakao')",[f.student]);
 await f.db.exec('update edu_push_control set enabled=true; set role service_role;');
 await f.db.query("update profiles set email='learner@example.test',phone='010-1234-5678' where id=$1",[f.student]);
 const rpc=async(n,args=[])=>(await f.db.query(`select ${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args)).rows[0].r;
 if(push)await rpc('edu_register_push',[f.student,'https://fcm.googleapis.com/fcm/send/'+f.student,'A'.repeat(87),'B'.repeat(22)]);
 const template=id();
 const reach=()=>rpc('edu_care_channel_reach',[f.admin,[f.student]]);
 const send=async({request=id(),mode='push_first',channels=['push','email','alimtalk'],routes,actor=f.admin,content='함께 이어가요',recipients=[f.student]}={})=>{
  if(!routes){const [r]=await reach();let chosen=channels.filter(c=>r[c]);if(r.mobileOnly)chosen=chosen.includes('alimtalk')?['alimtalk']:chosen.includes('sms')?['sms']:[];else if(mode==='push_first'&&chosen.includes('push'))chosen=['push'];routes=[{memberId:f.student,channels:chosen.sort()}];}
  return rpc('edu_send_learning_care_channels',[actor,request,f.cohort,f.lesson,recipients,content,mode,channels,template,routes]);
 };
 return {...f,rpc,reach,send,template,claim:()=>rpc('edu_claim_care_channels',[true,true,template,true])};
}
test('push-first creates only opted-in care push; plain inbox messages remain silent; receipt replay never duplicates',async t=>{
 const f=await setup(t,{push:true}),request=id();
 const reach=await f.reach();assert.equal(reach[0].push,true);assert.equal(reach[0].phoneMasked,'010****5678');assert.doesNotMatch(JSON.stringify(reach),/learner@example|010-1234/);
 const first=await f.send({request});assert.equal(first.deliveries.length,1);assert.equal(first.deliveries[0].channel,'push');
 const replay=await f.send({request});assert.deepEqual(replay,first);await assert.rejects(f.send({request,mode:'all'}),/MESSAGE_REQUEST_REUSED/);await assert.rejects(f.send({request,content:'changed'}),/MESSAGE_REQUEST_REUSED/);
 await f.rpc('edu_send_member_message',[f.admin,id(),'일반 메시지',[f.other],null,null]);
 assert.equal((await f.db.query('select count(*)::int n from edu_push_events')).rows[0].n,1);
 const [job]=await f.rpc('edu_claim_push',[15]);assert.equal((await f.rpc('edu_read_push_delivery',[job.id,job.lease])).path,'/my/messages');
 await f.rpc('edu_finish_push',[job.id,job.lease,'sent','ACCEPTED']);assert.equal((await f.rpc('edu_care_delivery_receipt',[f.admin,request])).deliveries[0].status,'sent');
 assert.deepEqual(await f.claim(),[]);
});
test('no push uses email and alimtalk; contact changes prevent external send; accepted is not delivered',async t=>{
 const f=await setup(t),request=id(),r=await f.send({request});assert.deepEqual(r.deliveries.map(d=>d.channel),['alimtalk','email']);
 const jobs=await f.claim();assert.equal(jobs.length,2);assert.deepEqual(await f.claim(),[]);
 for(const job of jobs){const data=await f.rpc('edu_read_care_channel',[job.id,job.lease]);assert.ok(data.destination);assert.equal(data.content,'함께 이어가요');}
 await f.db.query("update profiles set phone='01099998888' where id=$1",[f.student]);
 for(const job of jobs){const data=await f.rpc('edu_read_care_channel',[job.id,job.lease]);await f.rpc('edu_finish_care_channel',[job.id,job.lease,data?'accepted':'skipped',data?'ACCEPTED':'RECIPIENT_CHANGED','provider-receipt']);}
 // Match the actual old/new phone values, not random UUIDs that happen to contain "010".
 const receipt=await f.rpc('edu_care_delivery_receipt',[f.admin,request]);assert.deepEqual(receipt.deliveries.map(d=>d.status),['skipped','accepted']);assert.doesNotMatch(JSON.stringify(receipt),/learner@example|010-?1234-?5678|010-?9999-?8888|provider-receipt/);
});
test('changed channel route rolls back inbox and all queues; no retroactive delivery for legacy sends',async t=>{
 const f=await setup(t);await assert.rejects(f.send({routes:[{memberId:f.student,channels:['push']}]}),/CARE_CHANNELS_CHANGED/);
 assert.equal((await f.db.query('select count(*)::int n from edu_member_messages')).rows[0].n,0);
 const request=id();await f.rpc('edu_send_learning_care',[f.admin,request,f.cohort,f.lesson,[f.student],'함께 이어가요']);await assert.rejects(f.send({request}),/MESSAGE_REQUEST_REUSED/);
});
test('uncertain provider lease expires to unknown and is never automatically resent',async t=>{
 const f=await setup(t);await f.send({channels:['email']});const [job]=await f.claim();
 await f.db.query("update edu_care_deliveries set lease_until=now()-interval '1 minute' where id=$1",[job.id]);
 assert.deepEqual(await f.claim(),[]);assert.equal((await f.db.query('select status from edu_care_deliveries where id=$1',[job.id])).rows[0].status,'unknown');
 assert.equal(await f.rpc('edu_finish_care_channel',[job.id,job.lease,'accepted','LATE','late']),false);
});
test('read rechecks completion, revocation, deleted message and actor permission for both external and push',async t=>{
 const f=await setup(t,{push:true});await f.send({mode:'all'});const jobs=await f.claim(),[push]=await f.rpc('edu_claim_push',[15]);
 const check=async expected=>{for(const job of jobs)assert.equal(!!await f.rpc('edu_read_care_channel',[job.id,job.lease]),expected);assert.equal(!!await f.rpc('edu_read_push_delivery',[push.id,push.lease]),expected);};
 await check(true);await f.db.query('update enrollments set revoked_at=now() where id=$1',[f.enrollment]);await check(false);await f.db.query('update enrollments set revoked_at=null where id=$1',[f.enrollment]);
 await f.db.exec('update edu_member_messages set deleted_at=now()');await check(false);await f.db.exec('update edu_member_messages set deleted_at=null');
 await f.db.query("update profiles set status='withdrawn' where id=$1",[f.admin]);await check(false);await f.db.query("update profiles set status='active' where id=$1",[f.admin]);
 await f.submitCell();await check(false);
});
test('disabled providers skip pending jobs; recipients without contacts still get the inbox; role boundary',async t=>{
 const f=await setup(t),request=id();await f.send({request});assert.deepEqual(await f.rpc('edu_claim_care_channels',[false,false,null,false]),[]);
 assert.ok((await f.rpc('edu_care_delivery_receipt',[f.admin,request])).deliveries.every(d=>d.status==='skipped'));
 await assert.rejects(f.rpc('edu_care_channel_reach',[f.student,[f.student]]),/BLOCK_FORBIDDEN/);
 await assert.rejects(f.rpc('edu_care_delivery_receipt',[f.student,request]),/BLOCK_FORBIDDEN/);
 await f.db.exec('set role authenticated');await assert.rejects(f.rpc('edu_claim_care_channels',[true,true,null,true]),/permission denied/);
});
test('empty contacts and explicit inbox-only produce no external queue',async t=>{
 const f=await setup(t);await f.db.query('update profiles set email=null,phone=null where id=$1',[f.student]);const r=await f.send();assert.equal(r.count,1);assert.deepEqual(r.deliveries,[]);
});
test('SMS is queued when Alimtalk is not selected; contact change invalidates the pending SMS',async t=>{
 const f=await setup(t),request=id();const r=await f.send({request,channels:['email','sms'],routes:[{memberId:f.student,channels:['email','sms']}]});
 assert.deepEqual(r.deliveries.map(d=>d.channel),['email','sms']);const jobs=await f.claim();assert.equal(jobs.length,2);
 for(const job of jobs){const data=await f.rpc('edu_read_care_channel',[job.id,job.lease]);assert.ok(data.destination);}
 await f.db.query("update profiles set phone='01055556666' where id=$1",[f.student]);
 const read=await Promise.all(jobs.map(j=>f.rpc('edu_read_care_channel',[j.id,j.lease])));assert.equal(read.filter(Boolean).length,1);assert.equal(read.find(Boolean).channel,'email');
});
test('Alimtalk wins over SMS unless all channels were explicitly selected',async t=>{
 const f=await setup(t);const r=await f.send({channels:['email','alimtalk','sms'],routes:[{memberId:f.student,channels:['alimtalk','email']}]});assert.deepEqual(r.deliveries.map(d=>d.channel),['alimtalk','email']);
});

test('mission conversion cancels queued delivery and rejects new channel requests atomically',async t=>{
 const f=await setup(t);await f.send();const [job]=await f.claim();assert.ok(await f.rpc('edu_read_care_channel',[job.id,job.lease]));
 await f.db.exec('reset role');
 await f.db.query("update edu_lesson_block_versions set document=jsonb_set(document,'{progression,track}','\"daily\"'::jsonb) where id=$1",[f.revision]);
 await f.db.exec('set role service_role');
 assert.equal(await f.rpc('edu_read_care_channel',[job.id,job.lease]),null);
 const other=await setup(t);
 await other.db.exec('reset role');
 await other.db.query("update edu_lesson_block_versions set document=jsonb_set(document,'{progression,track}','\"daily\"'::jsonb) where id=$1",[other.revision]);
 await other.db.exec('set role service_role');
 await assert.rejects(other.send(),/CARE_RECIPIENT_CHANGED/);
 assert.equal((await other.db.query('select count(*)::int n from edu_member_messages')).rows[0].n,0);
});

// Apply the policy at lookup, enqueue and just-before-send, not only in the UI.
test('Kakao accounts use one mobile channel even with push/email and all selected',async t=>{
 for(const mode of ['push_first','all']){
  const f=await setup(t,{push:true,kakao:true});const [r]=await f.reach();
  assert.equal(r.mobileOnly,true);assert.equal(r.push,false);assert.equal(r.email,false);assert.equal(r.emailMasked,null);
  const result=await f.send({mode,channels:['push','email','alimtalk','sms']});
  assert.deepEqual(result.deliveries.map(d=>d.channel),['alimtalk']);
  assert.equal((await f.db.query('select count(*)::int n from edu_push_events')).rows[0].n,0);
 }
});
test('Kakao SMS works without Alimtalk; missing phone never falls back to inaccessible email',async t=>{
 const f=await setup(t,{push:true,kakao:true});
 assert.deepEqual((await f.send({channels:['push','email','sms']})).deliveries.map(d=>d.channel),['sms']);
 const noPhone=await setup(t,{push:true,kakao:true});await noPhone.db.query('update profiles set phone=null where id=$1',[noPhone.student]);
 assert.deepEqual((await noPhone.send({channels:['push','email','alimtalk','sms']})).deliveries,[]);
});
test('forged Kakao email/push or duplicate mobile routes roll back the whole request',async t=>{
 const f=await setup(t,{push:true,kakao:true});
 for(const channels of [['email'],['push'],['alimtalk','sms']])await assert.rejects(f.send({mode:'all',channels:['push','email','alimtalk','sms'],routes:[{memberId:f.student,channels}]}),/CARE_CHANNELS_CHANGED/);
 assert.equal((await f.db.query('select count(*)::int n from edu_member_messages')).rows[0].n,0);
});
test('linking Kakao after enqueue blocks email and care push before provider dispatch',async t=>{
 const f=await setup(t,{push:true});await f.send({mode:'all',channels:['push','email']});
 const [job]=await f.claim(),[push]=await f.rpc('edu_claim_push',[15]);
 await f.db.exec('reset role');await f.db.query("insert into auth.identities values($1,'kakao')",[f.student]);await f.db.exec('set role service_role');
 assert.equal(await f.rpc('edu_read_care_channel',[job.id,job.lease]),null);
 assert.equal(await f.rpc('edu_read_push_delivery',[push.id,push.lease]),null);
});
test('Kakao lookup exposes only policy boolean to service; auth tables remain private',async t=>{
 const f=await setup(t,{kakao:true});
 assert.equal(await f.rpc('edu_private.care_mobile_only',[f.student]),true);
 await assert.rejects(f.db.query('select * from auth.identities'),/permission denied/);
 await f.db.exec('set role authenticated');await assert.rejects(f.rpc('edu_private.care_mobile_only',[f.student]),/permission denied/);
});
