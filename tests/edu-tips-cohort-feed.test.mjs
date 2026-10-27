import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fixture,id,customer,epoch} from './helpers/edu-tips-erasure.mjs';
import {installProjectionSchema} from './helpers/edu-tips-projection.mjs';
import {candidate} from './helpers/edu-tips-candidate-loader.mjs';
import {createHash} from 'node:crypto';
const projection=candidate('edu-tips-projection-candidate'),identity=candidate('edu-tips-identity-candidate'),source=candidate('edu-tips-source-candidate');
const runtime=candidate('edu-tips-source-runtime');
const dataApi=candidate('edu-tips-data-http');
const keys={environment:'dev',profile:identity.IDENTITY_PROFILE,recordKey:Buffer.alloc(32,2),customerKey:Buffer.alloc(32,1),customerVersion:'k1'};
const ids=identity.createEduIdentityCandidate(keys);
const extras=['20261010080829_edu_tips_erasure_http_v2.sql','20261012014228_edu_tips_eligibility_v2.sql','20261014042612_edu_tips_control_delivery_candidate.sql','20261014054801_edu_tips_identity_jobs_candidate.sql'];
async function setup(t,{activate=true,syntheticScope=false}={}){
 const f=await fixture(t,extras);await installProjectionSchema(f);
 await f.db.exec('reset role');
 try {
  await f.db.exec(`alter table profiles add column email text;
   alter table cohorts add column status text not null default 'in_progress', add column operation_start_at timestamptz default now()-interval '1 day', add column operation_end_at timestamptz;
   alter table enrollments add column status text not null default 'active',add column revoked_at timestamptz,add column access_starts_at timestamptz not null default now()-interval '1 day',add column access_ends_at timestamptz;`);
  await f.db.exec(readFileSync(new URL('../supabase/migrations/20261027063226_edu_tips_cohort_feed.sql',import.meta.url),'utf8'));
  await f.db.exec(readFileSync(new URL('../supabase/migrations/20261027065931_edu_tips_same_day_learning_capture.sql',import.meta.url),'utf8'));
  if(syntheticScope) await f.db.exec(readFileSync(new URL('../supabase/migrations/20261027082254_edu_tips_synthetic_cohort_scope.sql',import.meta.url),'utf8'));
 } catch(error) { await f.db.exec('rollback');throw error; } finally { await f.db.exec('set role service_role'); }
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
 for(const n of[5,6]){await f.owner('insert into profiles(id,email) values($1,$2)',[id(n),`edu-live-test-${n}@example.invalid`]);await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(n),id(n+10)]);}
 // B stays a legacy subject with its existing references throughout this batch.
 await f.value("select edu_tips_register_subject($1,$2,$3,'v1',$4) as v",[id(6),customer(6),epoch(6),id(16)]);await payment(6);
 assert.equal((await register(5)).status,'registered');
 await f.owner("update edu_tips_private.subjects set created_at=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' where member_id=$1",[id(5)]);
 await payment(5);
 }
 const facts=n=>f.value('select coalesce(jsonb_agg(payload order by record_key),\'[]\'::jsonb) as v from edu_tips_private.feed_facts where subject_id=(select id from edu_tips_private.subjects where member_id=$1 and retired_at is null)',[id(n)]);
 return{...f,rpc,run,register,claim,derive,apply,payment,facts};
}

const testKey=createHash('sha256').update('synthetic-cohort-feed-key-000000000').digest('hex');
async function gate(f){return f.value("select edu_tips_data_gate($1,'dev','edu.learning.read') as v",[testKey]);}
async function prepare(f){
 await f.owner("insert into edu_tips_private.data_keys values($1,$2,array['edu.learning.read','edu.events.read','edu.recovery'],'2099-01-01',null)",[testKey,id(90)]);
 await f.owner("update edu_tips_private.subjects set created_at=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' where member_id in($1,$2)",[id(5),id(6)]);
 for(const n of[5,6])await f.owner("insert into learning_usage_events values($1,$2,'material_download',$3,now(),now(),'signed_file_issued')",[id(n+400),id(n+130),id(n+500)]);
 await f.run();
}
async function row(f,n){return (await f.facts(n)).find(x=>x.record_id);}
async function refresh(f,limit=4){return f.value('select edu_tips_refresh_cohort_feed_candidate($1) as v',[limit]);}
test('disabled by default; enable seeds only at runtime and refreshes legacy and HMAC cohort facts in bounded batches',async t=>{
 const f=await setup(t);await prepare(f);
 assert.equal((await row(f,5)).cohort_state,'unknown');
 assert.equal((await refresh(f)).status,'disabled');
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.cohort_refresh_jobs'),0);
 await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');
 assert.deepEqual(await gate(f),{error:'disabled'});
 assert.equal((await refresh(f,1)).pending,true);assert.deepEqual(await gate(f),{error:'disabled'});
 assert.equal((await refresh(f,1)).pending,false);await f.run();
 for(const n of[5,6]){let x=await row(f,n);assert.equal(x.cohort_state,'active');assert.equal(x.availability,'available');assert.equal(x.usage_ratio,null);assert.equal(x.total_items,null);assert.equal(x.resource_used,1);}
 const a=await row(f,5),b=await row(f,6);
 await f.owner("update cohorts set status='completed' where id=$1",[id(201)]);
 assert.deepEqual(await gate(f),{error:'disabled'});
 assert.equal((await refresh(f,1)).pending,true);assert.equal((await refresh(f,1)).pending,false);
 await f.run();
 for(const [n,before] of [[5,a],[6,b]]) {const after=await row(f,n);assert.equal(after.cohort_state,'alumni');assert.equal(after.availability,'available');assert.equal(after.record_id,before.record_id);assert.equal(after.record_revision,before.record_revision+1);assert.equal(after.expires_at,before.expires_at);assert.equal(after.product_id,'MoonShot4');}
 assert.equal((await gate(f)).consumer_id,id(90));
});
test('access changes and elapsed end schedule refresh without inventing learning evidence',async t=>{
 const f=await setup(t);await prepare(f);await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');await refresh(f);await f.run();
 await f.owner("update enrollments set status='revoked',revoked_at=now() where id=$1",[id(135)]);await f.run();
 assert.equal((await row(f,5)).availability,'not_available');assert.equal((await row(f,6)).availability,'available');
 await f.owner("update cohorts set operation_end_at=now()+interval '1 minute' where id=$1",[id(201)]);await refresh(f);await f.run();
 assert.ok(await f.value('select due_at>now() as v from edu_tips_private.cohort_refresh_jobs where cohort_id=$1',[id(201)]));
 // Move the synthetic clock boundary without issuing a cohort update event.
 await f.owner('alter table cohorts disable trigger edu_tips_cohort_refresh_changed');
 await f.owner("update cohorts set operation_end_at=now()-interval '1 second' where id=$1",[id(201)]);
 await f.owner('alter table cohorts enable trigger edu_tips_cohort_refresh_changed');
 await f.owner("update edu_tips_private.cohort_refresh_jobs set due_at=now()-interval '1 second' where cohort_id=$1",[id(201)]);
 assert.deepEqual(await gate(f),{error:'disabled'});await refresh(f);await f.run();
 assert.equal((await row(f,5)).cohort_state,'alumni');assert.equal((await row(f,6)).cohort_state,'alumni');
 assert.equal((await f.facts(5)).filter(x=>x.record_id).length,1);
});
test('unprivileged roles cannot run cohort worker or read its queue',async t=>{
 const f=await setup(t,{activate:false});
 for(const role of['anon','authenticated']) {await f.db.exec('reset role;set role '+role);await assert.rejects(()=>f.db.query('select edu_tips_refresh_cohort_feed_candidate(1)'),/permission denied/);await assert.rejects(()=>f.db.query('select * from edu_tips_private.cohort_refresh_jobs'),/permission denied/);}
});
test('cron performs bounded refresh and HMAC projection; OFF and bad credentials cannot process work',async t=>{
 const f=await setup(t);await prepare(f);await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');
 const env={NEXT_PUBLIC_APP_ENV:'development',EDU_TIPS_SOURCE_ENVIRONMENT:'dev',
  EDU_TIPS_HMAC_PUBLISHER_ENABLED:'true',EDU_TIPS_HMAC_PUBLISHER_READY:'true',
  EDU_TIPS_IDENTITY_PROFILE:identity.IDENTITY_PROFILE,EDU_TIPS_RECORD_KEY_VERSION:'rk1',
  EDU_TIPS_RECORD_KEY:Buffer.alloc(32,2).toString('base64'),
  CRON_SECRET:'synthetic-cron-secret-not-registered-0000',EDU_TIPS_COHORT_FEED_ENABLED:'true'};
 const request=token=>new Request('https://synthetic.invalid/api/cron/tips-cohort-feed',{headers:{authorization:'Bearer '+token}});
 let calls=0;
 const deps={env,fetch:()=>{throw Error('must not send');},rpc:async(name,args)=>{
  calls++;
  if(name==='edu_tips_refresh_cohort_feed_candidate')return{data:await refresh(f,args.p_limit),error:null};
  return f.rpc(name,args);
 }};
 assert.equal((await runtime.scheduledCohortFeedCandidate(request(env.CRON_SECRET),{...deps,env:{...env,EDU_TIPS_COHORT_FEED_ENABLED:'false'}})).status,200);
 assert.equal(calls,0);
 assert.equal((await runtime.scheduledCohortFeedCandidate(request('wrong-key'),deps)).status,401);
 assert.equal(calls,0);
 const result=await runtime.scheduledCohortFeedCandidate(request(env.CRON_SECRET),deps);
 assert.equal(result.status,200);const body=await result.json();
 assert.equal(body.refresh.processed,2);assert.equal((await row(f,5)).cohort_state,'active');
 await f.owner("update cohorts set status='completed' where id=$1",[id(201)]);
 assert.deepEqual(await gate(f),{error:'disabled'});
 const next=await runtime.scheduledCohortFeedCandidate(request(env.CRON_SECRET),deps);
 assert.equal(next.status,200);assert.equal((await row(f,5)).cohort_state,'alumni');
 await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=false where id=1');
 await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');
 assert.deepEqual(await gate(f),{error:'disabled'});
});
test('actual feed handler blocks pending cohort refresh then delivers amended rows on incremental cursor',async t=>{
 const f=await setup(t);await prepare(f);
 await f.owner('delete from edu_tips_private.erasure_outbox');
 await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');
 await refresh(f);await f.run();
 const env={EDU_TIPS_DATA_API_ENABLED:'true',NEXT_PUBLIC_APP_ENV:'development',EDU_TIPS_DATA_CURSOR_SECRET:'x'.repeat(48),EDU_TIPS_ERASURE_CURSOR_SECRET:'y'.repeat(48)};
 const rpc=async(name,a)=>{
  try {
   const data=name==='edu_tips_data_gate'
    ? await f.value('select edu_tips_data_gate($1,$2,$3) as v',[a.p_key_hash,a.p_environment,a.p_scope])
    : await f.value('select edu_tips_data_operation($1,$2,$3,$4,$5::jsonb,$6,$7,$8::text[]) as v',[a.p_consumer,a.p_key_hash,a.p_environment,a.p_action,JSON.stringify(a.p_body),a.p_after,a.p_limit,a.p_hashes]);
   return {data,error:null};
  } catch(error){return{data:null,error:{message:error.message}};}
 };
 const call=async(action,opts={})=>{
  const page=action==='events'||action==='learning';
  const url='https://synthetic.invalid/api/internal/export/v2/'+action+(opts.after?'?after='+encodeURIComponent(opts.after):'');
  const request=new Request(url,{method:page?'GET':'POST',headers:{authorization:'Bearer synthetic-cohort-feed-key-000000000','content-type':'application/json'},...(page?{}:{body:JSON.stringify(opts.body)})});
  const response=await dataApi.handleData(request,action,{env,rpc});return {status:response.status,body:await response.json()};
 };
 const recovery=await call('recovery',{body:{requestId:id(901),reason:'initial'}});assert.equal(recovery.status,200,JSON.stringify(recovery.body));
 const e1=await call('events',{after:recovery.body.event_cursor}),l1=await call('learning',{after:recovery.body.learning_cursor});
 assert.equal(e1.status,200);assert.equal(l1.status,200);assert.equal(l1.body.rows.length,2);assert.ok(l1.body.rows.every(x=>x.cohort_state==='active'));
 const e2=await call('events',{after:e1.body.next_cursor}),l2=await call('learning',{after:l1.body.next_cursor});
 const complete=await call('complete',{body:{recovery_id:recovery.body.recovery_id,event_through:e2.body.next_cursor,learning_through:l2.body.next_cursor,tombstone_through:recovery.body.tombstone_cursor}});
 assert.equal(complete.status,200,JSON.stringify(complete.body));
 await f.owner("update cohorts set status='completed' where id=$1",[id(201)]);
 const paused=await call('learning',{after:l2.body.next_cursor});assert.equal(paused.status,503);
 await refresh(f);await f.run();
 const changed=await call('learning',{after:l2.body.next_cursor});assert.equal(changed.status,200,JSON.stringify(changed.body));
 assert.equal(changed.body.rows.length,2);assert.ok(changed.body.rows.every(x=>x.cohort_state==='alumni'&&x.record_revision===l1.body.rows.find(y=>y.record_id===x.record_id).record_revision+1));
 assert.deepEqual(changed.body.rows.map(x=>x.record_id).sort(),l1.body.rows.map(x=>x.record_id).sort());
});
test('start, cancelled and recapture transitions invalidate the old state and preserve real evidence',async t=>{
 const f=await setup(t);await prepare(f);await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');await refresh(f);await f.run();
 const before=await row(f,5);
 await f.owner("update cohorts set status='upcoming',operation_start_at=now()+interval '1 day' where id=$1",[id(201)]);
 assert.deepEqual(await gate(f),{error:'disabled'});await refresh(f);await f.run();
 assert.equal((await row(f,5)).cohort_state,'before_start');
 await f.owner("update cohorts set status='cancelled' where id=$1",[id(201)]);await refresh(f);await f.run();
 assert.equal((await row(f,5)).cohort_state,'unknown');assert.equal((await row(f,5)).availability,'not_available');
 await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=false where id=1');
 await f.owner("update cohorts set status='in_progress',operation_start_at=now()-interval '1 day' where id=$1",[id(201)]);
 await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');
 assert.deepEqual(await gate(f),{error:'disabled'});await refresh(f);await f.run();
 const after=await row(f,5);assert.equal(after.cohort_state,'active');assert.equal(after.record_id,before.record_id);assert.equal(after.resource_used,before.resource_used);
});

test('same-day post-consent learning is captured for both identity profiles; older and future observations stay excluded',async t=>{
 const f=await setup(t);await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');
 await f.owner("update edu_tips_private.feed_state set capture_since=now()-interval '3 seconds' where singleton");
 await f.owner("update edu_tips_private.subjects set created_at=now()-interval '1 second' where member_id in($1,$2)",[id(5),id(6)]);
 for(const n of[5,6]){
  await f.owner("insert into edu_tips_private.learning_days(enrollment_id,date_kst,item_type,item_id,observed_at) values($1,(now() at time zone 'Asia/Seoul')::date,'material_download',$2,now()-interval '2 seconds')",[id(n+130),id(n+500)]);
  await f.owner('select edu_tips_private.capture_member($1)',[id(n)]);
 }
 await f.run();assert.equal(await row(f,5),undefined);assert.equal(await row(f,6),undefined);
 for(const n of[5,6])await f.owner("insert into learning_usage_events values($1,$2,'material_download',$3,clock_timestamp(),clock_timestamp(),'signed_file_issued')",[id(n+400),id(n+130),id(n+500)]);
 await f.run();for(const n of[5,6])assert.equal((await row(f,n)).resource_used,1);
 await refresh(f);await f.run();
 for(const n of[5,6]){
  await f.owner("insert into edu_tips_private.learning_days(enrollment_id,date_kst,item_type,item_id,observed_at) values($1,(now() at time zone 'Asia/Seoul')::date,'material_download',$2,now()+interval '1 hour')",[id(n+130),id(n+600)]);
  await f.owner('select edu_tips_private.capture_member($1)',[id(n)]);
 }
 await f.run();
 for(const n of[5,6]){const r=await row(f,n);assert.equal(r.cohort_state,'active');assert.equal(r.resource_used,1);assert.equal(r.usage_ratio,null);}
});


test('synthetic scope refreshes only explicitly listed reserved-email legacy member',async t=>{
 const f=await setup(t,{syntheticScope:true});await prepare(f);
 await assert.rejects(()=>f.owner("insert into edu_tips_private.cohort_synthetic_allowlist values($1,'edu-live-wrong@example.invalid')",[id(6)]),/IDENTITY_MISMATCH/);
 await f.owner("insert into edu_tips_private.cohort_synthetic_allowlist values($1,'edu-live-test-6@example.invalid'),($2,'edu-live-test-5@example.invalid')",[id(6),id(5)]);
 const other=await row(f,5);assert.equal(other.cohort_state,'unknown');
 await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');
 await assert.rejects(()=>f.owner('delete from edu_tips_private.cohort_synthetic_allowlist where member_id=$1',[id(6)]),/SCOPE_LOCKED/);
 await refresh(f);await f.run();
 assert.equal((await row(f,6)).cohort_state,'active');assert.deepEqual(await row(f,5),other);
 await f.owner("update cohorts set status='completed' where id=$1",[id(201)]);
 await refresh(f);await f.run();
 assert.equal((await row(f,6)).cohort_state,'alumni');assert.deepEqual(await row(f,5),other);
 await f.owner("update profiles set email='changed@example.invalid' where id=$1",[id(6)]);
 await f.owner("update cohorts set status='in_progress' where id=$1",[id(201)]);
 await refresh(f);await f.run();assert.equal((await row(f,6)).cohort_state,'alumni');
 await f.db.exec('reset role;set role authenticated');
 await assert.rejects(()=>f.db.query('select * from edu_tips_private.cohort_synthetic_allowlist'),/permission denied/);
 await assert.rejects(()=>f.db.query('select edu_tips_refresh_synthetic_cohort_feed_candidate(1)'),/permission denied/);
});

test('synthetic cron is DEV only and never drains global HMAC jobs',async t=>{
 const f=await setup(t,{syntheticScope:true});await prepare(f);
 await f.owner("insert into edu_tips_private.cohort_synthetic_allowlist values($1,'edu-live-test-6@example.invalid')",[id(6)]);
 await f.owner('update edu_tips_private.cohort_refresh_settings set enabled=true where id=1');
 const env={NEXT_PUBLIC_APP_ENV:'development',EDU_TIPS_SOURCE_ENVIRONMENT:'dev',EDU_TIPS_SYNTHETIC_COHORT_ONLY:'true',EDU_TIPS_COHORT_FEED_ENABLED:'true',CRON_SECRET:'synthetic-cron-secret-not-registered-0000'};
 const request=new Request('https://synthetic.invalid/cron',{headers:{authorization:'Bearer '+env.CRON_SECRET}});const calls=[];
 const deps={env,fetch:()=>{throw Error('must not send');},rpc:async(name,args)=>{calls.push(name);if(name!=='edu_tips_refresh_synthetic_cohort_feed_candidate')throw Error('unexpected global worker');return{data:await f.value('select edu_tips_refresh_synthetic_cohort_feed_candidate($1) as v',[args.p_limit]),error:null};}};
 let result=await runtime.scheduledCohortFeedCandidate(request,deps);assert.equal(result.status,200);assert.deepEqual(calls,['edu_tips_refresh_synthetic_cohort_feed_candidate']);assert.equal((await row(f,6)).cohort_state,'active');
 calls.length=0;result=await runtime.scheduledCohortFeedCandidate(request,{...deps,env:{...env,NEXT_PUBLIC_APP_ENV:'production',EDU_TIPS_SOURCE_ENVIRONMENT:'production'}});assert.equal(result.status,503);assert.deepEqual(calls,[]);
});
