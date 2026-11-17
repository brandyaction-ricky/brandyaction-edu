import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {fixture,id,customer,epoch} from './helpers/edu-tips-erasure.mjs';
const require=createRequire(import.meta.url),api={};
const code=ts.transpileModule(readFileSync(new URL('../lib/edu-tips-control-candidate.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
new Function('exports','require',code)(api,n=>n==='server-only'?{}:n.endsWith('.json')?JSON.parse(readFileSync(new URL('../lib/'+n.slice(2),import.meta.url))):require(n));
const migration='20261014042612_edu_tips_control_delivery_candidate.sql';
async function setup(t){
 const f=await fixture(t,['20261012014228_edu_tips_eligibility_v2.sql',migration]);
 await f.owner("update edu_tips_private.erasure_outbox set active_due_at=requested_at+interval '120 hours',model_due_at=requested_at+interval '720 hours',residual_due_at=requested_at+interval '720 hours'");
 // Explicit synthetic old-request authority fixture: never inferred from due values/header.
 await f.owner("insert into edu_tips_private.control_authorities(request_id,origin_contract_version,deadline_profile,authority_ref) select request_id,'2.0.0-rc.2','rc2_5_30_30','synthetic:old-source-proof' from edu_tips_private.erasure_outbox");
 const enable=()=>f.owner("update edu_tips_private.control_settings set capture_enabled=true,sending_enabled=true,source_authority_ref='synthetic:local-test',environment='dev',consumer_id=$1 where id=1",[id(90)]);
 const claim=(n=20,consumer=90,env='dev')=>f.value('select edu_tips_claim_control_candidate($1,$2,$3) as v',[id(consumer),env,n]);
 const confirm=(l,a=ack(l))=>f.value('select edu_tips_confirm_control_candidate($1,$2,$3,$4,$5::jsonb) as v',[l.requestId,l.leaseToken,id(90),'dev',JSON.stringify(a)]);
 return {...f,enable,claim,confirm};
}
function ack(l){return {control_version:l.body.control_version,environment:l.body.environment,tenant_id:l.body.tenant_id,brand_id:l.body.brand_id,receiver_id:l.body.receiver_id,requestId:l.requestId,customer_id:l.body.block.customer_id,consent_epoch:l.body.block.consent_epoch,request_digest:api.controlDigest(l.body),status:'blocked',blocked_at:new Date().toISOString(),cancellation:'requested'};}

test('candidate migration is OFF, queues no old/current requests and exposes no browser grants',async t=>{
 const f=await setup(t);assert.deepEqual(await f.claim(),[]);assert.equal(await f.value('select edu_tips_backfill_control_candidate() as v'),0);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.control_deliveries'),0);
 for(const role of ['anon','authenticated']){
  await f.db.exec('reset role;set role '+role);
  await assert.rejects(()=>f.db.query('select * from edu_tips_private.control_deliveries'),/permission denied/);
  await assert.rejects(()=>f.db.query("select edu_tips_claim_control_candidate($1,'dev',1)",[id(90)]),/permission denied/);
  await assert.rejects(()=>f.db.query("select edu_tips_prepare_identity_candidate($1,'v1',$2,$3)",[id(1),id(11),epoch(1)]),/permission denied/);
 }
 await f.db.exec('reset role;set role service_role');
 await assert.rejects(()=>f.db.query('update edu_tips_private.control_settings set sending_enabled=true where id=1'),/permission denied/);
 await assert.rejects(()=>f.db.query('delete from edu_tips_private.control_deliveries'),/permission denied/);
});
test('explicit backfill is idempotent; source timestamps/digest preserved and source pull delivery does not suppress retry',async t=>{
 const f=await setup(t);await f.enable();
 await f.owner("update edu_tips_private.erasure_outbox set delivered_at=clock_timestamp()");
 assert.equal(await f.value('select edu_tips_backfill_control_candidate() as v'),4);assert.equal(await f.value('select edu_tips_backfill_control_candidate() as v'),0);
 const l=(await f.claim(1))[0];assert.equal(l.body.block.at,'2026-01-01T00:00:00.000Z');assert(api.isEduControlBlock(l.body));
 assert.equal(await f.value('select request_digest as v from edu_tips_private.control_deliveries where request_id=$1',[l.requestId]),api.controlDigest(l.body));
 assert.equal((await f.claim(100)).length,3);assert.equal((await f.claim()).length,0);
 const old=structuredClone(l.body);
 assert.equal(await f.value("select edu_tips_defer_control_candidate($1,$2,$3,'dev','network_error',clock_timestamp(),false) as v",[l.requestId,l.leaseToken,id(90)]),true);
 const again=(await f.claim())[0];assert.equal(again.attempt,2);assert.notEqual(again.leaseToken,l.leaseToken);assert.deepEqual(again.body,old);
 assert.equal(await f.confirm(l),false);assert.equal(await f.confirm(again),true);
 assert.equal(await f.value('select completed_at is null as v from edu_tips_private.erasure_outbox where request_id=$1',[l.requestId]),true);
 assert.equal(await f.value('select acked_ordinal::int as v from edu_tips_private.erasure_consumers where id=$1',[id(90)]),0);
});
test('wrong environment, conflicting ACK, expired/stale leases and invalid retries never confirm',async t=>{
 const f=await setup(t);await f.enable();await f.value('select edu_tips_backfill_control_candidate() as v');
 await assert.rejects(()=>f.claim(1,91,'production'),/TIPS_CONTROL_SCOPE/);
 const l=(await f.claim(1))[0];
 for(const mutate of [a=>a.status='completed',a=>a.brand_id='myin',a=>a.customer_id=customer(99),a=>a.request_digest='0'.repeat(64),a=>a.extra=true,a=>a.blocked_at='2099-01-01T00:00:00.000Z']){
  const a=ack(l);mutate(a);await assert.rejects(()=>f.confirm(l,a),/TIPS_CONTROL_ACK_INVALID/);
 }
 await assert.rejects(()=>f.value("select edu_tips_defer_control_candidate($1,$2,$3,'dev','private SQL',clock_timestamp(),false) as v",[l.requestId,l.leaseToken,id(90)]),/TIPS_CONTROL_INVALID/);
 await f.owner("update edu_tips_private.control_deliveries set lease_until=clock_timestamp()-interval '1 second' where request_id=$1",[l.requestId]);
 assert.equal(await f.confirm(l),false);
 const newLease=(await f.claim(1))[0];assert.notEqual(newLease.leaseToken,l.leaseToken);
 assert.equal(await f.confirm(newLease),true);
});
test('real withdrawal commits original control snapshot atomically; rollback commits neither and B stays intact',async t=>{
 const f=await setup(t);await f.enable();
 for(const n of [5,6]){
  await f.owner('insert into profiles(id) values($1)',[id(n)]);
  await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(n),id(n+10)]);
  await f.value("select edu_tips_register_subject($1,$2,$3,'v1',$4) as v",[id(n),customer(n),epoch(n),id(n+10)]);
 }
 await f.owner("update edu_personalization_preferences set analysis=false where member_id=$1",[id(5)]);
 assert.equal(await f.value("select count(*)::int as v from edu_tips_private.control_deliveries d where d.payload#>>'{block,customer_id}'=$1",[customer(5)]),1);
 const l=(await f.claim(1))[0];assert(api.isEduControlBlock(l.body));assert.equal(api.controlDigest(l.body),await f.value('select request_digest as v from edu_tips_private.control_deliveries where request_id=$1',[l.requestId]));
 assert.equal(await f.value("select retired_at is null as v from edu_tips_private.subjects where customer_id=$1",[customer(6)]),true);
 await f.db.exec('reset role;begin');await f.db.query("update edu_personalization_preferences set analysis=false where member_id=$1",[id(6)]);await f.db.exec('rollback;set role service_role');
 assert.equal(await f.value("select count(*)::int as v from edu_tips_private.control_deliveries d where d.payload#>>'{block,customer_id}'=$1",[customer(6)]),0);
 assert.equal(await f.value("select analysis as v from edu_personalization_preferences where member_id=$1",[id(6)]),true);
});
test('microsecond deadlines are exact and a one-microsecond extension is rejected',async t=>{
 const f=await setup(t);await f.enable();
 await f.owner("update edu_tips_private.erasure_outbox set requested_at='2026-01-01T00:00:00.123456Z',active_due_at='2026-01-06T00:00:00.123456Z',model_due_at='2026-01-31T00:00:00.123456Z',residual_due_at='2026-01-31T00:00:00.123456Z'");
 await f.value('select edu_tips_backfill_control_candidate() as v');const l=(await f.claim(1))[0];assert.equal(l.body.block.at,'2026-01-01T00:00:00.123456Z');assert(api.isEduControlBlock(l.body));
 l.body.block.active_due_at='2026-01-06T00:00:00.123457Z';assert.equal(api.isEduControlBlock(l.body),false);
});
test('pending identity persists across retry and advertising-only revision; withdrawal never revives epoch',async t=>{
 const f=await setup(t);await f.owner('insert into profiles(id) values($1)',[id(5)]);await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(5),id(15)]);
 const prepare=(e=epoch(50),rev=id(15))=>f.value("select edu_tips_prepare_identity_candidate($1,'v1',$2,$3) as v",[id(5),rev,e]);
 assert.deepEqual(await prepare(),{error:'disabled'});await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');
 const first=await prepare(),retry=await prepare(epoch(51));assert.equal(first.pending_id,retry.pending_id);assert.equal(first.consent_epoch,retry.consent_epoch);
 await f.owner('update edu_personalization_preferences set revision=$2 where member_id=$1',[id(5),id(500)]);
 const changed=await prepare(epoch(52),id(500));assert.equal(first.consent_epoch,changed.consent_epoch);
 const finish=()=>f.value("select edu_tips_finish_identity_candidate($1,$2,$3,$4,'v1',$5) as v",[id(5),first.pending_id,first.consent_epoch,customer(5),id(500)]);
 assert.deepEqual(await finish(),{customer_id:customer(5),consent_epoch:first.consent_epoch});assert.deepEqual(await finish(),{customer_id:customer(5),consent_epoch:first.consent_epoch});
 await f.owner('update edu_personalization_preferences set overseas=false where member_id=$1',[id(5)]);
 assert.deepEqual(await finish(),{error:'not_eligible'});
 await f.owner('update edu_personalization_preferences set overseas=true where member_id=$1',[id(5)]);
 assert.deepEqual(await prepare(epoch(53),id(500)),{error:'erasure_pending'});
});
test('immutable snapshots and consumer scope cannot be rewritten; withdrawal/pending terms stay retired',async t=>{
 const f=await setup(t);await f.enable();await f.value('select edu_tips_backfill_control_candidate() as v');
 await assert.rejects(()=>f.owner("update edu_tips_private.control_deliveries set payload=payload||'{\"extra\":true}'::jsonb where request_id=(select request_id from edu_tips_private.control_deliveries limit 1)"),/TIPS_CONTROL_IMMUTABLE/);
 await assert.rejects(()=>f.owner("update edu_tips_private.control_settings set environment='production',consumer_id=$1 where id=1",[id(91)]),/TIPS_CONTROL_PENDING/);
 await f.owner('insert into profiles(id) values($1)',[id(5)]);await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(5),id(15)]);
 await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');
 const first=await f.value("select edu_tips_prepare_identity_candidate($1,'v1',$2,$3) as v",[id(5),id(15),epoch(50)]);
 await f.owner("update edu_personalization_terms set is_current=false where version='v1'");
 assert.equal(await f.value('select retired_at is not null as v from edu_tips_private.pending_identities where id=$1',[first.pending_id]),true);
 await f.owner("update edu_personalization_terms set is_current=true where version='v1'");
 const again=await f.value("select edu_tips_prepare_identity_candidate($1,'v1',$2,$3) as v",[id(5),id(15),epoch(51)]);assert.notEqual(again.consent_epoch,first.consent_epoch);
});

const source={};
const sourceCode=ts.transpileModule(readFileSync(new URL('../lib/edu-tips-source-candidate.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const identity={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../lib/edu-tips-identity-candidate.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(identity,n=>n==='server-only'?{}:require(n));
const worker={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../lib/edu-tips-control-worker-candidate.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(worker,n=>n==='server-only'?{}:n==='./edu-tips-control-candidate'?api:require(n));
new Function('exports','require',sourceCode)(source,n=>n==='server-only'?{}:n==='./edu-tips-control-candidate'?api:n==='./edu-tips-control-worker-candidate'?worker:n==='./edu-tips-identity-candidate'?identity:require(n));
function rpc(f){return async(name,a)=>{
 try{
  let data;
  if(name==='edu_tips_prepare_identity_candidate')data=await f.value('select edu_tips_prepare_identity_candidate($1,$2,$3,$4) as v',[a.p_member,a.p_version,a.p_revision,a.p_epoch]);
  else if(name==='edu_tips_finish_identity_candidate')data=await f.value('select edu_tips_finish_identity_candidate($1,$2,$3,$4,$5,$6) as v',[a.p_member,a.p_pending,a.p_epoch,a.p_customer,a.p_version,a.p_revision]);
  else if(name==='edu_tips_claim_control_candidate')data=await f.value('select edu_tips_claim_control_candidate($1,$2,$3) as v',[a.p_consumer,a.p_environment,a.p_limit]);
  else if(name==='edu_tips_confirm_control_candidate')data=await f.value('select edu_tips_confirm_control_candidate($1,$2,$3,$4,$5::jsonb) as v',[a.p_request,a.p_lease,a.p_consumer,a.p_environment,JSON.stringify(a.p_ack)]);
  else if(name==='edu_tips_defer_control_candidate')data=await f.value('select edu_tips_defer_control_candidate($1,$2,$3,$4,$5,$6,$7) as v',[a.p_request,a.p_lease,a.p_consumer,a.p_environment,a.p_code,a.p_next,a.p_attention]);
  else throw Error('unexpected RPC');
  return {data,error:null};
 }catch{return {data:null,error:{message:'private DB diagnostic intentionally omitted'}};}
};}
test('server registration adapter uses durable pending epoch through concurrent calls and preserves old-profile identity',async t=>{
 const f=await setup(t);await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');
 await f.owner('insert into profiles(id) values($1)',[id(5)]);await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(5),id(15)]);
 const identities={environment:'dev',profile:identity.IDENTITY_PROFILE,customerVersion:'k1',customerKey:Buffer.alloc(32,1),recordKey:Buffer.alloc(32,2)};
 const deps={enabled:true,agreedProfile:identity.IDENTITY_PROFILE,rpc:rpc(f),identities};const input={member:id(5),version:'v1',revision:id(15)};
 assert.deepEqual(await source.registerEduIdentityCandidate(input,{...deps,enabled:false,rpc:()=>{throw Error('must not call');}}),{status:'disabled'});
 const results=await Promise.all([source.registerEduIdentityCandidate(input,deps),source.registerEduIdentityCandidate(input,deps)]);
 assert.ok(results.every(x=>['registered','existing'].includes(x.status)));assert.equal(results[0].customer_id,results[1].customer_id);assert.equal(results[0].consent_epoch,results[1].consent_epoch);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.subjects where member_id=$1',[id(5)]),1);
 const old=await source.registerEduIdentityCandidate(input,{...deps,identities:{...identities,customerKey:Buffer.alloc(32,3),customerVersion:'k2'}});assert.equal(old.status,'existing');assert.equal(old.needs_migration,true);assert.equal(old.customer_id,results[0].customer_id);
 await f.owner('update edu_personalization_preferences set analysis=false where member_id=$1',[id(5)]);const blocked=await source.registerEduIdentityCandidate(input,deps);assert.equal(blocked.status,'blocked');
});
test('DB-backed batch adapter survives transport errors then confirms with new lease; reports only operational counts',async t=>{
 const f=await setup(t);await f.enable();await f.value('select edu_tips_backfill_control_candidate() as v');
 const input={consumer:id(90),environment:'dev',limit:1};const deps={enabled:true,agreedVersion:api.CONTROL_VERSION,rpc:rpc(f),jitter:()=>0,send:async()=>({confirmed:false,code:'network_error',attention:false})};
 assert.equal((await source.runEduControlBatchCandidate(input,{...deps,enabled:false,rpc:()=>{throw Error('must not call');}})).status,'disabled');
 const first=await source.runEduControlBatchCandidate(input,deps);assert.equal(first.pending,1);assert.equal(first.confirmed,0);
 await f.owner('update edu_tips_private.control_deliveries set next_attempt_at=clock_timestamp() where attempt_count=1');
 const saved=await source.runEduControlBatchCandidate(input,{...deps,send:async body=>({confirmed:true,ack:ack({requestId:body.block.requestId,body})})});assert.equal(saved.confirmed,1);assert.equal(saved.status,'processed');
 assert.ok(!JSON.stringify(saved).includes('customer_id'));assert.equal(await f.value('select count(*)::int as v from edu_tips_private.control_deliveries where confirmed_at is not null'),1);
 assert.equal(await f.value('select count(*)::int as v from edu_tips_private.erasure_outbox where completed_at is not null'),0);
});
test('old-generation completion alone and marketing-only receipt cannot authorize technical rekey',async t=>{
 const f=await setup(t);await f.owner('update edu_tips_private.control_settings set identity_enabled=true where id=1');
 await f.owner('insert into profiles(id) values($1)',[id(5)]);await f.owner("insert into edu_personalization_preferences(member_id,wording_version,analysis,overseas,revision) values($1,'v1',true,true,$2)",[id(5),id(15)]);
 await f.value("select edu_tips_register_subject($1,$2,$3,'v1',$4) as v",[id(5),customer(5),epoch(5),id(15)]);
 await f.owner("update profiles set role='staff' where id=$1",[id(5)]);await f.owner("update profiles set role='student' where id=$1",[id(5)]);
 // Synthetic fixture placement only, not claimed as an erasure/ACK verification.
 await f.owner("update edu_tips_private.erasure_outbox set delivered_at=clock_timestamp(),completed_at=clock_timestamp() where subject_id=(select id from edu_tips_private.subjects where customer_id=$1)",[customer(5)]);
 const prepare=()=>f.value("select edu_tips_prepare_identity_candidate($1,'v1',$2,$3) as v",[id(5),id(15),epoch(50)]);
 assert.deepEqual(await prepare(),{error:'identity_migration_required'});
 await f.owner("insert into edu_personalization_receipts(member_id,request_id,wording_version,choices,previous_choices,result) values($1,$2,'v1','{\"analysis\":true,\"overseas\":true}','{\"analysis\":true,\"overseas\":true}','{}')",[id(5),id(700)]);
 assert.deepEqual(await prepare(),{error:'identity_migration_required'});
 await f.owner("insert into edu_personalization_receipts(member_id,request_id,wording_version,choices,previous_choices,result) values($1,$2,'v1','{\"analysis\":true,\"overseas\":true}','{\"analysis\":false,\"overseas\":false}','{}')",[id(5),id(701)]);
 assert.equal((await prepare()).state,'pending');
});
test('status observes stalled delivery without changing source completion or leaking targets',async t=>{
 const f=await setup(t);await f.enable();await f.value('select edu_tips_backfill_control_candidate() as v');
 const status=await f.value("select edu_tips_control_status_candidate($1,'dev') as v",[id(90)]);assert.deepEqual(status,{pending:4,confirmed:0,attention:4,unclassified:0,sending_enabled:true});
 assert.ok(!JSON.stringify(status).includes(customer(1)));
 await f.owner('update edu_tips_private.control_settings set sending_enabled=false where id=1');assert.deepEqual(await f.claim(),[]);
 assert.equal((await f.value("select edu_tips_control_status_candidate($1,'dev') as v",[id(90)])).attention,4);
});

test('unknown old request authority is retained for review and never inferred as modern',async t=>{
 const f=await setup(t);await f.enable();await f.owner('delete from edu_tips_private.control_authorities');
 assert.equal(await f.value('select edu_tips_backfill_control_candidate() as v'),0);assert.deepEqual(await f.claim(),[]);
 const state=await f.value("select edu_tips_control_status_candidate($1,'dev') as v",[id(90)]);assert.equal(state.unclassified,4);
});
