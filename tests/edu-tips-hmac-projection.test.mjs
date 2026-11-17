import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id,customer,epoch} from './helpers/edu-tips-erasure.mjs';
import {installProjectionSchema} from './helpers/edu-tips-projection.mjs';
import {candidate} from './helpers/edu-tips-candidate-loader.mjs';
import {createHash} from 'node:crypto';
const projection=candidate('edu-tips-projection-candidate'),identity=candidate('edu-tips-identity-candidate'),source=candidate('edu-tips-source-candidate');
const keys={environment:'dev',profile:identity.IDENTITY_PROFILE,recordKey:Buffer.alloc(32,2),customerKey:Buffer.alloc(32,1),customerVersion:'k1'};
const ids=identity.createEduIdentityCandidate(keys);
const extras=['20261010080829_edu_tips_erasure_http_v2.sql','20261012014228_edu_tips_eligibility_v2.sql','20261014042612_edu_tips_control_delivery_candidate.sql','20261014054801_edu_tips_identity_jobs_candidate.sql'];
async function setup(t,{activate=true}={}){
 const f=await fixture(t,extras);await installProjectionSchema(f);
 const signatures={
 edu_tips_prepare_hmac_identity_candidate:['p_member','p_version','p_revision','p_epoch'],
 edu_tips_finish_hmac_identity_candidate:['p_member','p_pending','p_epoch','p_customer','p_version','p_revision'],
 edu_tips_claim_hmac_projection_candidate:['p_limit'],
 edu_tips_apply_hmac_projection_candidate:['p_subject','p_revision','p_lease','p_profile','p_record_key_version','p_refs'],
 edu_tips_defer_hmac_projection_candidate:['p_subject','p_revision','p_lease'],
 };
 const rpc=async(name,args)=>{
 try{const names=signatures[name];if(!names)throw Error('Unexpected synthetic RPC');
 const params=names.map(n=>n==='p_refs'?JSON.stringify(args[n]):args[n]);
 const data=await f.value(`select ${name}(${names.map((n,i)=>'$'+(i+1)+(n==='p_refs'?'::jsonb':'')).join(',')}) as v`,params);return{data,error:null};}
 catch(error){return{data:null,error:{message:error.message}};}
 };
 const run=(k=keys,call=rpc)=>projection.runHmacProjectionCandidate({enabled:true,keys:k,recordKeyVersion:'rk1',rpc:call});
 const register=n=>source.registerEduIdentityCandidate({member:id(n),version:'v1',revision:id(n+10)},{enabled:true,agreedProfile:identity.IDENTITY_PROFILE,hmacPublisher:true,identities:keys,rpc});
 const claim=()=>f.value('select edu_tips_claim_hmac_projection_candidate(4) as v');
 const derive=j=>j.refs.map(x=>({...x,opaque:x.kind==='event'?ids.eventId(x.source_key.startsWith('payment:')?'payment_completed':'order_refunded',x.source_key.split(':')[1]):x.kind==='row'?ids.learningId(j.member,x.source_key.split(':')[1],x.source_key.split(':')[2]):ids.recordId(x.kind,x.source_key)}));
 const apply=(j,refs=derive(j))=>f.value('select edu_tips_apply_hmac_projection_candidate($1,$2,$3,$4,$5,$6::jsonb) as v',[j.subject,j.revision,j.lease,j.profile,j.record_key_version,JSON.stringify(refs)]);
 const payment=async n=>{
 await f.owner("insert into orders values($1,$2,false,100000,'paid','alumni')",[id(n+100),id(n)]);
 await f.owner('insert into order_items values($1,$2,$3,$4)',[id(n+110),id(n+100),id(200),id(201)]);
 await f.owner("insert into payments values($1,$2,'done',100000,0,now()-interval '1 day')",[id(n+120),id(n+100)]);
 await f.owner("insert into enrollments values($1,$2,$3,$4,$5,'purchase')",[id(n+130),id(n),id(n+110),id(200),id(201)]);
 };
 if(activate){
 await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');
 await f.owner('update edu_tips_private.hmac_settings set enabled=true,record_key_fingerprint=$1 where id=1',[projection.recordKeyFingerprint(keys.recordKey)]);
 await f.owner('update edu_tips_private.feed_state set capture_enabled=true,serving_enabled=true where singleton');
 await f.owner("update edu_tips_private.feed_state set capture_since=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' where singleton");
 await f.owner("insert into courses values($1,'MoonShot4');",[id(200)]);await f.owner("insert into cohorts values($1,'Cohort4')",[id(201)]);
 for(const n of[5,6]){await f.owner('insert into profiles(id) values($1)',[id(n)]);await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(n),id(n+10)]);}
 // B stays a legacy subject with its existing references throughout this batch.
 await f.value("select edu_tips_register_subject($1,$2,$3,'v1',$4) as v",[id(6),customer(6),epoch(6),id(16)]);await payment(6);
 assert.equal((await register(5)).status,'registered');
 await f.owner("update edu_tips_private.subjects set created_at=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' where member_id=$1",[id(5)]);
 await payment(5);
 }
 const facts=n=>f.value('select coalesce(jsonb_agg(payload order by record_key),\'[]\'::jsonb) as v from edu_tips_private.feed_facts where subject_id=(select id from edu_tips_private.subjects where member_id=$1 and retired_at is null)',[id(n)]);
 return{...f,rpc,run,register,claim,derive,apply,payment,facts};
}
test('HMAC SQL installs OFF and browser roles cannot read raw projection sources or execute jobs',async t=>{
 const f=await setup(t,{activate:false});assert.equal(await f.value('select enabled as v from edu_tips_private.hmac_settings where id=1'),false);
 assert.deepEqual(await f.claim(),[]);await f.run(undefined,()=>{throw Error('OFF worker must not invoke transport');});
 for(const role of['anon','authenticated']){
 await f.db.exec('reset role;set role '+role);await assert.rejects(()=>f.db.query('select edu_tips_claim_hmac_projection_candidate(1)'),/permission denied/);await assert.rejects(()=>f.db.query('select * from edu_tips_private.hmac_refs'),/permission denied/);
 }
});
test('new HMAC generation projects exact payment IDs, preserves uppercase catalog and B legacy bytes; existing B is never converted',async t=>{
 const f=await setup(t);const before=await f.facts(6);
 assert.equal((await f.facts(5)).length,0);await assert.rejects(()=>f.value('select edu_tips_private.publish_feed() is null as v'),/TIPS_SOURCE_INCONSISTENT/);
 const result=await f.run();assert.equal(result.applied,1,JSON.stringify(result));
 const rows=await f.facts(5);assert.equal(rows.length,1);const p=rows[0];
 assert.equal(p.event_id,ids.eventId('payment_completed',id(125)));assert.equal(p.payload.order_id,ids.recordId('order',id(105)));assert.equal(p.payload.payment_id,ids.recordId('payment',id(125)));
 assert.equal(p.product_id,'MoonShot4');assert.equal(p.payload.cohort_code,'MoonShot4:Cohort4');assert.equal(p.payload.entry_src,'alumni');assert.ok(!JSON.stringify(p).includes(id(125)));
 assert.deepEqual(await f.facts(6),before);assert.equal((await f.register(6)).status,'blocked');assert.deepEqual(await f.facts(6),before);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.opaque_refs where subject_id=(select id from edu_tips_private.subjects where member_id=$1 and retired_at is null)',[id(5)]),0);
});
test('same-value partial refunds, payment corrections and learning revisions retain stable HMAC IDs and expiry',async t=>{
 const f=await setup(t);await f.run();const first=(await f.facts(5))[0];
 for(const n of[301,302]){await f.owner("insert into refunds values($1,$2,'done',10000,now()-interval '1 hour')",[id(n),id(125)]);await f.owner("update payments set cancelled_amount=cancelled_amount+10000,status='partial_cancelled' where id=$1",[id(125)]);}
 await f.owner("update orders set entry_src='youtube' where id=$1",[id(105)]);
 await f.owner("insert into learning_usage_events values($1,$2,'material_download',$3,now(),now(),'signed_file_issued')",[id(401),id(135),id(410)]);
 await f.owner("update learning_usage_events set last_used_at=clock_timestamp() where id=$1",[id(401)]);
 assert.equal((await f.run()).applied,1);const rows=await f.facts(5),refunds=rows.filter(x=>x.event_type==='order_refunded');assert.equal(refunds.length,2);
 assert.notEqual(refunds[0].event_id,refunds[1].event_id);assert.notEqual(refunds[0].payload.refund_id,refunds[1].payload.refund_id);
 for(const n of[301,302])assert.ok(refunds.some(x=>x.event_id===ids.eventId('order_refunded',id(n))&&x.payload.refund_id===ids.recordId('refund',id(n))));
 const p=rows.find(x=>x.event_type==='payment_completed');assert.equal(p.event_id,first.event_id);assert.equal(p.payload.record_revision,2);assert.equal(p.payload.expires_at,first.payload.expires_at);
 const row=rows.find(x=>x.record_id);assert.equal(row.record_id,ids.learningId(id(5),id(201),row.date_kst));assert.equal(row.usage_ratio,null);assert.equal(row.total_items,null);
 const stable=JSON.stringify(rows);await f.owner('update orders set entry_src=entry_src where id=$1',[id(105)]);assert.equal((await f.run()).applied,1);assert.equal(JSON.stringify(await f.facts(5)),stable);
});
test('changed sources invalidate lease; missing/duplicate/foreign references never commit; lost apply response does not duplicate facts',async t=>{
 const f=await setup(t),[j]=await f.claim();const refs=f.derive(j);
 await assert.rejects(()=>f.apply(j,[...refs,refs[0]]),/TIPS_HMAC_INVALID/);assert.equal(await f.apply(j,refs.slice(1)),false);
 await f.owner("update orders set entry_src='youtube' where id=$1",[id(105)]);assert.equal(await f.apply(j,refs),false);
 const lost=async(n,a)=>{const r=await f.rpc(n,a);return n==='edu_tips_apply_hmac_projection_candidate'?{data:null,error:{message:'lost synthetic response'}}:r;};
 await f.run(keys,lost);const before=await f.facts(5);assert.equal(before.length,1);assert.equal((await f.run()).claimed,0);assert.deepEqual(await f.facts(5),before);
});
test('wrong record key fingerprint is deferred and version/key changes cannot rewrite a bound profile',async t=>{
 const f=await setup(t);const b=await f.facts(6);
 const r=await f.run({...keys,recordKey:Buffer.alloc(32,9)});assert.equal(r.pending,1);assert.equal((await f.facts(5)).length,0);assert.deepEqual(await f.facts(6),b);
 await assert.rejects(()=>f.owner("update edu_tips_private.hmac_settings set record_key_version='rk2' where id=1"),/TIPS_HMAC_MIGRATION_REQUIRED/);
 await assert.rejects(()=>f.owner('update edu_tips_private.hmac_settings set record_key_fingerprint=$1 where id=1',['a'.repeat(64)]),/TIPS_HMAC_MIGRATION_REQUIRED/);
 await f.owner('update edu_tips_private.hmac_jobs set next_attempt_at=clock_timestamp() where subject_id=(select id from edu_tips_private.subjects where member_id=$1 and retired_at is null)',[id(5)]);assert.equal((await f.run()).applied,1);
});
test('inconsistent money never breaks payment commit; projection rollback and repair preserve other customer',async t=>{
 const f=await setup(t);const b=await f.facts(6);await f.owner("insert into refunds values($1,$2,'done',10000,now()-interval '1 hour')",[id(301),id(125)]);
 assert.equal(await f.value('select count(*)::int as v from refunds where id=$1',[id(301)]),1);assert.equal((await f.run()).pending,1);assert.equal((await f.facts(5)).length,0);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.hmac_refs'),0);
 await f.owner("update payments set cancelled_amount=10000,status='partial_cancelled' where id=$1",[id(125)]);assert.equal((await f.run()).applied,1);assert.deepEqual(await f.facts(6),b);
});
test('withdrawal after claim cancels projection and preserves old target/expiry and B; no profile switch or new legal consent is fabricated',async t=>{
 const f=await setup(t);await f.run();const b=await f.facts(6);const original=await f.value('select customer_id as v from edu_tips_private.subjects where member_id=$1 and retired_at is null',[id(5)]);
 await f.owner("update orders set entry_src='youtube' where id=$1",[id(105)]);const[j]=await f.claim();await f.owner('update edu_personalization_preferences set analysis=false,revision=$2 where member_id=$1',[id(5),id(51)]);
 assert.equal(await f.apply(j),false);assert.deepEqual(await f.claim(),[]);assert.deepEqual(await f.facts(6),b);
 const q=await f.value('select jsonb_build_object(\'customer\',s.customer_id,\'active\',extract(epoch from q.active_due_at-q.requested_at),\'model\',extract(epoch from q.model_due_at-q.requested_at),\'residual\',extract(epoch from q.residual_due_at-q.requested_at)) as v from edu_tips_private.erasure_outbox q join edu_tips_private.subjects s on s.id=q.subject_id where s.member_id=$1',[id(5)]);
 assert.equal(q.customer,original);assert.equal(Number(q.active),5*86400);assert.equal(Number(q.model),30*86400);assert.equal(Number(q.residual),30*86400);
 await f.owner('update edu_personalization_preferences set analysis=true where member_id=$1',[id(5)]);
 assert.equal((await source.registerEduIdentityCandidate({member:id(5),version:'v1',revision:id(51)},{enabled:true,agreedProfile:identity.IDENTITY_PROFILE,hmacPublisher:true,identities:keys,rpc:f.rpc})).status,'blocked');
});
test('full recovery sees only completed HMAC projection; expiry correction removes snapshot copies and admin status exposes counts only',async t=>{
 const f=await setup(t);const api=candidate('edu-tips-data-http'),token='synthetic-hmac-recovery-key-not-registered-0000';
 const hash=x=>createHash('sha256').update(x).digest('hex');
 await f.owner("insert into edu_tips_private.data_keys values($1,$2,array['edu.events.read','edu.learning.read','edu.recovery'],'2099-01-01',null)",[hash(token),id(90)]);
 const rpc=async(n,a)=>{try{return{data:await f.value(n==='edu_tips_data_gate'?'select edu_tips_data_gate($1,$2,$3) as v':'select edu_tips_data_operation($1,$2,$3,$4,$5::jsonb,$6,$7,$8::text[]) as v',n==='edu_tips_data_gate'?[a.p_key_hash,a.p_environment,a.p_scope]:[a.p_consumer,a.p_key_hash,a.p_environment,a.p_action,JSON.stringify(a.p_body),a.p_after,a.p_limit,a.p_hashes]),error:null};}catch{return{data:null,error:{message:'synthetic private error'}};}};
 const call=async(action,body,after)=>api.handleData(new Request('https://synthetic.invalid/api/internal/export/v2/'+action+(after?'?after='+encodeURIComponent(after):''),{method:action==='events'?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),action,{env:{EDU_TIPS_DATA_API_ENABLED:'true',NEXT_PUBLIC_APP_ENV:'development',EDU_TIPS_DATA_CURSOR_SECRET:'x'.repeat(48),EDU_TIPS_ERASURE_CURSOR_SECRET:'y'.repeat(48)},rpc});
 assert.equal((await call('recovery',{requestId:id(901),reason:'initial'})).status,503);
 const before=await f.value('select edu_tips_source_status_candidate() as v');assert.equal(before.projection_pending,1);assert.ok(!JSON.stringify(before).includes(id(5)));
 await f.run();const start=await call('recovery',{requestId:id(902),reason:'initial'});assert.equal(start.status,200);const r=await start.json();const page=await call('events',null,r.event_cursor);assert.equal(page.status,200);const e=await page.json();
 assert.ok(e.events.some(x=>x.event_id===ids.eventId('payment_completed',id(125))));assert.ok(e.events.some(x=>x.customer_id===customer(6)));
 const status=await f.value('select edu_tips_source_status_candidate() as v');assert.equal(status.projection_pending,0);
 await f.owner("update payments set approved_at=now()-interval '400 days' where id=$1",[id(125)]);assert.equal((await f.run()).applied,1);assert.equal((await f.facts(5)).length,0);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.recovery_rows where subject_id=(select id from edu_tips_private.subjects where member_id=$1 and retired_at is null) and payload is not null',[id(5)]),0);
});
test('legacy-to-HMAC registration waits for the original deletion and contiguous ACK, plus a real new affirmative receipt',async t=>{
 const f=await setup(t);const before=await f.facts(6);
 await f.owner('update edu_personalization_preferences set analysis=false,revision=$2 where member_id=$1',[id(6),id(61)]);
 const choice=await f.value("select edu_personalization_consent($1,$2,'{\"analysis\":true,\"overseas\":true}'::jsonb,'v1',$3) as v",[id(6),id(620),id(61)]);
 const revision=choice.revision;assert.ok(revision);
 const reg=()=>source.registerEduIdentityCandidate({member:id(6),version:'v1',revision},{enabled:true,agreedProfile:identity.IDENTITY_PROFILE,hmacPublisher:true,identities:keys,rpc:f.rpc});
 assert.equal((await reg()).status,'blocked');
 const q=await f.value('select request_id as v from edu_tips_private.erasure_outbox where subject_id=(select id from edu_tips_private.subjects where member_id=$1 and retired_at is not null order by retired_at desc limit 1)',[id(6)]);
 // Synthetic proof fixtures isolate source authorization, not actual deletion.
 await f.owner('update edu_tips_private.erasure_outbox set delivered_at=statement_timestamp(),completed_at=statement_timestamp() where request_id=$1',[q]);assert.equal((await reg()).status,'blocked');
 await f.publish();const deliveries=await f.deliveries();const target=deliveries.find(x=>x.request_id===q);assert.ok(target);
 await f.owner('update edu_tips_private.erasure_deliveries set completed_at=clock_timestamp() where consumer_id=$1 and request_id=$2',[id(90),q]);assert.equal((await reg()).status,'blocked');
 await assert.rejects(()=>f.ack(target.delivery_id),/TIPS_ACK_GAP/);
 assert.equal(await f.value('select acked_ordinal::int as v from edu_tips_private.erasure_consumers where id=$1',[id(90)]),0);
 // Model the earlier contiguous proofs in this isolated fixture, then use the real ACK function.
 await f.owner('update edu_tips_private.erasure_deliveries set completed_at=clock_timestamp() where consumer_id=$1 and ordinal<=$2',[id(90),target.ordinal]);await f.ack(target.delivery_id);
 const result=await reg();assert.equal(result.status,'registered');assert.notEqual(result.customer_id,customer(6));
 assert.equal((await f.run()).applied,2);const p=(await f.facts(6)).find(x=>x.event_type==='payment_completed');assert.equal(p.event_id,ids.eventId('payment_completed',id(126)));assert.equal(p.payload.amount_paid,before[0].payload.amount_paid);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.subjects where member_id=$1 and retired_at is not null',[id(6)]),1);
});
test('publisher mode changes stop serving and advance recovery generation while preserving sources and ID mappings',async t=>{
 const f=await setup(t);await f.run();const facts=await f.facts(5);const version=await f.value('select generation::int as v from edu_tips_private.feed_state where singleton');
 await f.owner('update edu_tips_private.hmac_settings set enabled=false where id=1');
 assert.equal(await f.value('select serving_enabled as v from edu_tips_private.feed_state where singleton'),false);
 assert.equal(await f.value('select generation::int as v from edu_tips_private.feed_state where singleton'),version+1);assert.equal((await f.run()).claimed,0);assert.deepEqual(await f.facts(5),facts);
 await f.owner('update edu_tips_private.hmac_settings set enabled=true where id=1');assert.equal(await f.value('select serving_enabled as v from edu_tips_private.feed_state where singleton'),false);
 assert.equal(await f.value('select generation::int as v from edu_tips_private.feed_state where singleton'),version+2);assert.deepEqual(await f.facts(5),facts);
 assert.equal(await f.value('select approved_amount::int as v from payments where id=$1',[id(125)]),100000);
});
test('hard deletion clears source member links without losing the immutable erasure target or blocking deletion',async t=>{
 const f=await setup(t);await f.owner('insert into profiles(id) values($1)',[id(7)]);await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(7),id(17)]);
 const result=await f.register(7);assert.equal(result.status,'registered');
 await f.owner('delete from profiles where id=$1',[id(7)]);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.hmac_intents where member_id=$1',[id(7)]),0);
 const target=await f.value('select jsonb_build_object(\'customer\',s.customer_id,\'member\',s.member_id,\'reason\',q.reason) as v from edu_tips_private.subjects s join edu_tips_private.erasure_outbox q on q.subject_id=s.id where s.customer_id=$1',[result.customer_id]);
 assert.equal(target.customer,result.customer_id);assert.equal(target.member,null);assert.equal(target.reason,'account_deleted');
 assert.equal(await f.value('select cancelled_at is not null as v from edu_tips_private.hmac_jobs where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)',[result.customer_id]),true);
});
