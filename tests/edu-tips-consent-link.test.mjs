import test from 'node:test';import assert from 'node:assert/strict';import{fixture,id}from'./helpers/edu-tips-erasure.mjs';import{candidate}from'./helpers/edu-tips-candidate-loader.mjs';
import {installProjectionSchema} from './helpers/edu-tips-projection.mjs';
const runtime=candidate('edu-tips-source-runtime'),identity=candidate('edu-tips-identity-candidate');
const extras=['20261010080829_edu_tips_erasure_http_v2.sql','20261012014228_edu_tips_eligibility_v2.sql','20261014042612_edu_tips_control_delivery_candidate.sql','20261014054801_edu_tips_identity_jobs_candidate.sql'];
const env={NEXT_PUBLIC_APP_ENV:'development',EDU_TIPS_SOURCE_ENVIRONMENT:'dev',EDU_TIPS_IDENTITY_RUNTIME_ENABLED:'true',EDU_TIPS_IDENTITY_PROFILE:identity.IDENTITY_PROFILE,EDU_TIPS_HMAC_PUBLISHER_READY:'true',EDU_TIPS_HMAC_PUBLISHER_ENABLED:'true',EDU_TIPS_RECORD_KEY_VERSION:'rk1',EDU_TIPS_CUSTOMER_KEY_VERSION:'k1',EDU_TIPS_CUSTOMER_KEY:Buffer.alloc(32,1).toString('base64'),EDU_TIPS_RECORD_KEY:Buffer.alloc(32,2).toString('base64'),EDU_TIPS_SOURCE_CRON_ENABLED:'true',CRON_SECRET:'synthetic-cron-key-not-registered-0000000000'};
const request=(e=env)=>new Request('https://synthetic.invalid/api/cron/tips-source-candidate',{headers:{authorization:'Bearer '+e.CRON_SECRET}});
async function setup(t){const f=await fixture(t,extras);
 await installProjectionSchema(f);
 await f.owner('update edu_tips_private.hmac_settings set enabled=true,record_key_fingerprint=$1 where id=1',[candidate('edu-tips-projection-candidate').recordKeyFingerprint(Buffer.alloc(32,2))]);
 await f.owner('insert into profiles(id) values($1),($2)',[id(5),id(6)]);
 const prefs=(n,analysis=true,rev=id(n+10))=>f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',$2,$2,$3) on conflict(member_id) do update set analysis=excluded.analysis,overseas=excluded.overseas,revision=excluded.revision",[id(n),analysis,rev]);
 const rpc=async(name,a)=>{try{
 let data;switch(name){
 case'edu_tips_claim_identity_jobs_candidate':data=await f.value('select edu_tips_claim_identity_jobs_candidate($1,$2) as v',[a.p_member,a.p_limit]);break;
 case'edu_tips_prepare_identity_candidate':data=await f.value('select edu_tips_prepare_identity_candidate($1,$2,$3,$4) as v',[a.p_member,a.p_version,a.p_revision,a.p_epoch]);break;
 case'edu_tips_prepare_hmac_identity_candidate':data=await f.value('select edu_tips_prepare_hmac_identity_candidate($1,$2,$3,$4) as v',[a.p_member,a.p_version,a.p_revision,a.p_epoch]);break;
 case'edu_tips_finish_identity_candidate':data=await f.value('select edu_tips_finish_identity_candidate($1,$2,$3,$4,$5,$6) as v',[a.p_member,a.p_pending,a.p_epoch,a.p_customer,a.p_version,a.p_revision]);break;
 case'edu_tips_finish_hmac_identity_candidate':data=await f.value('select edu_tips_finish_hmac_identity_candidate($1,$2,$3,$4,$5,$6) as v',[a.p_member,a.p_pending,a.p_epoch,a.p_customer,a.p_version,a.p_revision]);break;
 case'edu_tips_claim_hmac_projection_candidate':data=await f.value('select edu_tips_claim_hmac_projection_candidate($1) as v',[a.p_limit]);break;
 case'edu_tips_claim_control_candidate':data=await f.value('select edu_tips_claim_control_candidate($1,$2,$3) as v',[a.p_consumer,a.p_environment,a.p_limit]);break;
 case'edu_tips_confirm_control_candidate':data=await f.value('select edu_tips_confirm_control_candidate($1,$2,$3,$4,$5::jsonb) as v',[a.p_request,a.p_lease,a.p_consumer,a.p_environment,JSON.stringify(a.p_ack)]);break;
 case'edu_tips_defer_control_candidate':data=await f.value('select edu_tips_defer_control_candidate($1,$2,$3,$4,$5,$6,$7) as v',[a.p_request,a.p_lease,a.p_consumer,a.p_environment,a.p_code,a.p_next,a.p_attention]);break;
 case'edu_tips_finish_identity_job_candidate':data=await f.value('select edu_tips_finish_identity_job_candidate($1,$2,$3,$4) as v',[a.p_member,a.p_revision,a.p_lease,a.p_code]);break;
 default:throw Error('Unexpected RPC');}
 return{data,error:null};}catch{return{data:null,error:{message:'private diagnostic'}};}};
 return{...f,prefs,rpc,deps:{env,rpc,fetch:()=>{throw Error('no configured control transport');}}};}

test('both feature gates OFF perform no RPC/send; wrong purpose/environment/profile/readiness fails closed',async()=>{
 let calls=0;const fail=()=>{calls++;throw Error('must not call');};await runtime.afterConsentSourceCandidate(id(5),{env:{},rpc:fail,fetch:fail});assert.equal(calls,0);
 for(const change of [{EDU_TIPS_HMAC_PUBLISHER_READY:undefined},{EDU_TIPS_IDENTITY_PROFILE:'legacy'},{EDU_TIPS_SOURCE_ENVIRONMENT:'production'},{EDU_TIPS_RECORD_KEY:'not base64'},{EDU_TIPS_RECORD_KEY:env.EDU_TIPS_CUSTOMER_KEY}]){
  const e={...env,...change};await runtime.afterConsentSourceCandidate(id(5),{env:e,rpc:fail,fetch:fail});assert.equal(runtime.sourceRuntimeConfiguration(e).valid,false);
 }assert.equal(calls,0);
});
test('SQL job capture is OFF by default; successful consent and registration job commit together only after activation',async t=>{
 const f=await setup(t);await f.prefs(5);assert.equal(await f.value('select count(*)::int as v from edu_tips_private.identity_jobs'),0);
 await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');await f.prefs(5,true,id(50));await f.prefs(6,true,id(60));
 await runtime.afterConsentSourceCandidate(id(5),f.deps);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.subjects where member_id=$1 and retired_at is null',[id(5)]),1);
 assert.equal(await f.value('select completed_at is not null as v from edu_tips_private.identity_jobs where member_id=$1',[id(5)]),true);
 assert.equal(await f.value('select completed_at is null as v from edu_tips_private.identity_jobs where member_id=$1',[id(6)]),true);
 const result=await runtime.scheduledSourceCandidate(request(),f.deps);assert.equal(result.status,200);const body=await result.json();assert.equal(body.registration.completed,1);assert.ok(!JSON.stringify(body).includes(id(6)));
});
test('lost after callback and transient registration failure are retried by cron without requiring another customer save',async t=>{
 const f=await setup(t);await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');await f.prefs(5);
 const broken={...f.deps,rpc:async(n,a,s)=>n==='edu_tips_finish_hmac_identity_candidate'?{data:null,error:{message:'private failed response'}}:f.rpc(n,a,s)};
 await runtime.afterConsentSourceCandidate(id(5),broken);
 assert.equal(await f.value('select completed_at is null as v from edu_tips_private.identity_jobs where member_id=$1',[id(5)]),true);
 const pending=await f.value('select consent_epoch as v from edu_tips_private.pending_identities where member_id=$1',[id(5)]);
 await f.owner('update edu_tips_private.identity_jobs set next_attempt_at=clock_timestamp() where member_id=$1',[id(5)]);
 assert.equal((await runtime.scheduledSourceCandidate(request(),f.deps)).status,200);
 assert.equal(await f.value('select consent_epoch as v from edu_tips_private.subjects where member_id=$1 and retired_at is null',[id(5)]),pending);
});
test('withdrawal succeeds independently of runtime/transport and cancels old registration lease; stale completion cannot revive it',async t=>{
 const f=await setup(t);await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');await f.prefs(5);
 const rows=await f.value('select edu_tips_claim_identity_jobs_candidate($1,1) as v',[id(5)]);const j=rows[0];
 await assert.rejects(()=>f.value("select edu_tips_finish_identity_job_candidate($1,$2,$3,'done') as v",[id(5),j.revision,j.lease]),/TIPS_IDENTITY_JOB_INVALID/);
 await f.prefs(5,false,id(51));await runtime.afterConsentSourceCandidate(id(5),{...f.deps,env:{}});
 assert.equal(await f.value('select analysis as v from edu_personalization_preferences where member_id=$1',[id(5)]),false);
 assert.equal(await f.value("select edu_tips_finish_identity_job_candidate($1,$2,$3,'done') as v",[id(5),j.revision,j.lease]),false);
 assert.deepEqual(await f.value('select edu_tips_claim_identity_jobs_candidate($1,1) as v',[id(5)]),[]);
});
test('marketing-only revision keeps registered identity; internal/admin members cannot get registration jobs',async t=>{
 const f=await setup(t);await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');await f.prefs(5);await runtime.afterConsentSourceCandidate(id(5),f.deps);
 const before=await f.value('select customer_id as v from edu_tips_private.subjects where member_id=$1 and retired_at is null',[id(5)]);
 await f.prefs(5,true,id(500));await runtime.afterConsentSourceCandidate(id(5),f.deps);assert.equal(await f.value('select customer_id as v from edu_tips_private.subjects where member_id=$1 and retired_at is null',[id(5)]),before);
 await f.owner("update profiles set role='admin' where id=$1",[id(6)]);await f.prefs(6);assert.equal(await f.value('select count(*)::int as v from edu_tips_private.identity_jobs where member_id=$1',[id(6)]),0);
});
test('cron cannot borrow v1 token, run via HEAD or run without exact feature/configuration; public roles cannot claim/mutate jobs',async t=>{
 const f=await setup(t);
 for(const[req,change,status]of [[request(),{EDU_TIPS_SOURCE_CRON_ENABLED:undefined},503],[new Request('https://synthetic.invalid',{method:'HEAD'}),{},405],[new Request('https://synthetic.invalid',{headers:{authorization:'Bearer v1-key'}}),{},401],[request(),{EDU_TIPS_HMAC_PUBLISHER_READY:undefined},503]]){
  const res=await runtime.scheduledSourceCandidate(req,{...f.deps,env:{...env,...change},rpc:()=>{throw Error('must not call');}});assert.equal(res.status,status);assert.ok(!JSON.stringify(await res.json()).includes('private'));
 }
 for(const role of['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(()=>f.db.query('select edu_tips_claim_identity_jobs_candidate(null,1)'),/permission denied/);await assert.rejects(()=>f.db.query('select * from edu_tips_private.identity_jobs'),/permission denied/);}
});

test('withdrawal dispatch remains independent of collection/identity OFF and confirms only blocked, not erasure completion',async t=>{
 const f=await setup(t);await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');await f.prefs(5);await runtime.afterConsentSourceCandidate(id(5),f.deps);
 await f.owner("update edu_tips_private.control_settings set capture_enabled=true,sending_enabled=true,environment='dev',consumer_id=$1,source_authority_ref='synthetic:local-test' where id=1",[id(90)]);
 await f.prefs(5,false,id(51));
 const control=candidate('edu-tips-control-candidate');const e={...env,EDU_TIPS_IDENTITY_RUNTIME_ENABLED:'false',EDU_PERSONALIZATION_CONSENT_ENABLED:'false',EDU_TIPS_CONTROL_RUNTIME_ENABLED:'true',EDU_TIPS_CONTROL_VERSION:control.CONTROL_VERSION,EDU_TIPS_CONTROL_KEY_PURPOSE:'source_to_tips:control:block',EDU_TIPS_CONTROL_KEY:Buffer.alloc(32,3).toString('base64'),EDU_TIPS_CONTROL_KEY_ID:'edu_dev',EDU_TIPS_CONTROL_KEY_EXPIRES_AT:'2099-01-01T00:00:00.000Z',EDU_TIPS_CONTROL_CONSUMER_ID:id(90),EDU_TIPS_CONTROL_ORIGIN:'https://tips.example.invalid',EDU_TIPS_CONTROL_ALLOWED_ORIGIN:'https://tips.example.invalid'};
 // Deliberately broken identity readiness must not stop the separate control.
 e.EDU_TIPS_IDENTITY_RUNTIME_ENABLED='true';delete e.EDU_TIPS_HMAC_PUBLISHER_READY;
 let sent=0;await runtime.afterConsentSourceCandidate(id(5),{...f.deps,env:e,fetch:async(_url,options)=>{sent++;const b=JSON.parse(options.body);return Response.json({control_version:b.control_version,environment:b.environment,tenant_id:b.tenant_id,brand_id:b.brand_id,receiver_id:b.receiver_id,requestId:b.block.requestId,customer_id:b.block.customer_id,consent_epoch:b.block.consent_epoch,request_digest:control.controlDigest(b),status:'blocked',blocked_at:new Date(Date.now()+10).toISOString(),cancellation:'requested'});}});
 assert.equal(sent,1);assert.equal(await f.value('select count(*)::int as v from edu_tips_private.control_deliveries where confirmed_at is not null'),1);assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_outbox where completed_at is not null'),0);
});

test('cron waits for independent withdrawal and projection even when registration claim fails',async t=>{
 const f=await setup(t);await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');await f.prefs(5);await runtime.afterConsentSourceCandidate(id(5),f.deps);
 await f.owner("update edu_tips_private.control_settings set capture_enabled=true,sending_enabled=true,environment='dev',consumer_id=$1,source_authority_ref='synthetic:local-test' where id=1",[id(90)]);
 await f.prefs(5,false,id(51));await f.prefs(6);const bBefore=await f.value('select to_jsonb(p) as v from edu_personalization_preferences p where member_id=$1',[id(6)]);
 const control=candidate('edu-tips-control-candidate');
 const e={...env,EDU_TIPS_CONTROL_RUNTIME_ENABLED:'true',EDU_TIPS_CONTROL_VERSION:control.CONTROL_VERSION,EDU_TIPS_CONTROL_KEY_PURPOSE:'source_to_tips:control:block',EDU_TIPS_CONTROL_KEY:Buffer.alloc(32,3).toString('base64'),EDU_TIPS_CONTROL_KEY_ID:'edu_dev',EDU_TIPS_CONTROL_KEY_EXPIRES_AT:'2099-01-01T00:00:00.000Z',EDU_TIPS_CONTROL_CONSUMER_ID:id(90),EDU_TIPS_CONTROL_ORIGIN:'https://tips.example.invalid',EDU_TIPS_CONTROL_ALLOWED_ORIGIN:'https://tips.example.invalid'};
 let release,entered,settled=false,projectionCalls=0,sent=0;
 const delayed=new Promise(r=>{release=r;}),claimEntered=new Promise(r=>{entered=r;});
 const rpc=async(n,a,s)=>{
  if(n==='edu_tips_claim_identity_jobs_candidate')return{data:null,error:{message:'synthetic private registration failure'}};
  if(n==='edu_tips_claim_control_candidate'){const result=await f.rpc(n,a,s);entered();await delayed;return result;}
  if(n==='edu_tips_claim_hmac_projection_candidate')projectionCalls++;
  return f.rpc(n,a,s);
 };
 const fetch=async(_url,options)=>{sent++;const b=JSON.parse(options.body);return Response.json({control_version:b.control_version,environment:b.environment,tenant_id:b.tenant_id,brand_id:b.brand_id,receiver_id:b.receiver_id,requestId:b.block.requestId,customer_id:b.block.customer_id,consent_epoch:b.block.consent_epoch,request_digest:control.controlDigest(b),status:'blocked',blocked_at:new Date(Date.now()+10).toISOString(),cancellation:'requested'});};
 const running=runtime.scheduledSourceCandidate(request(e),{...f.deps,env:e,rpc,fetch}).then(r=>{settled=true;return r;});
 let premature;
 try{await claimEntered;await new Promise(r=>setImmediate(r));premature=settled;}
 finally{release();}
 const result=await running;
 assert.equal(premature,false,'cron must not return while independent withdrawal work is still pending');
 assert.equal(result.status,503);assert.deepEqual(await result.json(),{status:'unavailable'});
 assert.equal(sent,1);assert.equal(projectionCalls,1,'existing projections still get a turn');
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.control_deliveries where confirmed_at is not null'),1);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_outbox where completed_at is not null'),0);
 assert.equal(await f.value('select analysis as v from edu_personalization_preferences where member_id=$1',[id(5)]),false);
 assert.deepEqual(await f.value('select to_jsonb(p) as v from edu_personalization_preferences p where member_id=$1',[id(6)]),bBefore);
});

test('cron keeps every worker failure visible without leaking diagnostics or suppressing other workers',async()=>{
 const control=candidate('edu-tips-control-candidate');
 const e={...env,EDU_TIPS_CONTROL_RUNTIME_ENABLED:'true',EDU_TIPS_CONTROL_VERSION:control.CONTROL_VERSION,EDU_TIPS_CONTROL_KEY_PURPOSE:'source_to_tips:control:block',EDU_TIPS_CONTROL_KEY:Buffer.alloc(32,3).toString('base64'),EDU_TIPS_CONTROL_KEY_ID:'edu_dev',EDU_TIPS_CONTROL_KEY_EXPIRES_AT:'2099-01-01T00:00:00.000Z',EDU_TIPS_CONTROL_CONSUMER_ID:id(90),EDU_TIPS_CONTROL_ORIGIN:'https://tips.example.invalid',EDU_TIPS_CONTROL_ALLOWED_ORIGIN:'https://tips.example.invalid'};
 const operations=['edu_tips_claim_identity_jobs_candidate','edu_tips_claim_control_candidate','edu_tips_claim_hmac_projection_candidate'];
 for(const failed of operations){
  const calls=[];const rpc=async name=>{calls.push(name);assert.ok(operations.includes(name));return name===failed?{data:null,error:{message:'private synthetic diagnostic'}}:{data:[],error:null};};
  const result=await runtime.scheduledSourceCandidate(request(e),{env:e,rpc,fetch:()=>{throw Error('empty batch must not send');}});
  assert.equal(result.status,503);const text=JSON.stringify(await result.json());assert.ok(!text.includes('private'));
  for(const name of operations)assert.equal(calls.filter(x=>x===name).length,1,failed+' must not suppress '+name);
 }
});

test('cron preserves registration-before-projection order rather than claiming the new projection too early',async()=>{
 let release,entered,projected=false;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const running=runtime.scheduledSourceCandidate(request(),{env,fetch:()=>{throw Error('control OFF');},rpc:async name=>{
  if(name==='edu_tips_claim_identity_jobs_candidate'){entered();await gate;return{data:[],error:null};}
  assert.equal(name,'edu_tips_claim_hmac_projection_candidate');projected=true;return{data:[],error:null};
 }});
 let premature;try{await started;await new Promise(r=>setImmediate(r));premature=projected;}finally{release();}
 const response=await running;assert.equal(premature,false);assert.equal(projected,true);assert.equal(response.status,200);
});
