import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const mod={};new Function('exports',ts.transpileModule(readFileSync(new URL('../lib/diagnosis.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const dispatch={version:1,kind:'ensure_session',attemptId:id(3),subject:id(4),diagnosis:'myin-n6',releaseId:id(5),packageVersion:'v1'};
function harness({revoked=false,ackLost=false}={}){const calls=[],sends=[];return {calls,sends,rpc:async(n,a)=>{calls.push([n,a]);if(n==='edu_diagnosis_claim')return {data:[{id:id(1),lease:id(2)}]};if(n==='edu_diagnosis_dispatch')return {data:revoked?null:dispatch};if(n==='edu_diagnosis_ack'&&ackLost)throw Error('unknown acknowledgement');return {data:true};},send:async(d,o)=>{sends.push([d,o.idempotencyKey]);return {version:1,attemptId:d.attemptId,subject:d.subject,releaseId:d.releaseId,responseId:id(6)};}};}
test('disabled worker never contacts storage or remote',async()=>{const h=harness();assert.deepEqual(await mod.deliverDiagnosisSessions(h),{claimed:0,accepted:0,deferred:0});assert.equal(h.calls.length,0);});
test('idempotent delivery binds exact subject/release and uses bounded transport',async()=>{const h=harness();assert.equal((await mod.deliverDiagnosisSessions({...h,enabled:true})).accepted,1);assert.equal(h.sends[0][1],'edu-n6:'+id(3));assert.deepEqual(h.calls.at(-1),['edu_diagnosis_ack',{p_job:id(1),p_lease:id(2),p_response:id(6)}]);});
test('lost local acknowledgement re-delivers same key rather than creating another run',async()=>{const h=harness({ackLost:true});await mod.deliverDiagnosisSessions({...h,enabled:true});await mod.deliverDiagnosisSessions({...h,enabled:true});assert.equal(h.sends[0][1],h.sends[1][1]);assert.equal(h.calls.at(-1)[1].p_code,'REMOTE_UNAVAILABLE');});
test('revoked grant is never sent remotely',async()=>{const h=harness({revoked:true});await mod.deliverDiagnosisSessions({...h,enabled:true});assert.equal(h.sends.length,0);});
test('foreign response binding is quarantined without attaching another user report',async()=>{const h=harness();await mod.deliverDiagnosisSessions({...h,enabled:true,send:async()=>({version:1,attemptId:id(3),subject:id(99),releaseId:id(5),responseId:id(6)})});assert.equal(h.calls.at(-1)[1].p_code,'REMOTE_REJECTED');assert.equal(h.calls.some(([n])=>n==='edu_diagnosis_ack'),false);});
test('large dispatches acquire fresh leases in bounded batches instead of expiring in a serial backlog',async()=>{
 const batches=[];let claimed=0,active=0,peak=0;
 const rpc=async(name,args)=>{
  if(name==='edu_diagnosis_claim'){
   assert.equal(active,0,'previous delivery batch must finish before more leases are acquired');
   batches.push(args.p_limit);
   return {data:Array.from({length:args.p_limit},()=>({id:id(++claimed),lease:id(100+claimed)}))};
  }
  if(name==='edu_diagnosis_dispatch')return {data:dispatch};
  return {data:true};
 };
 const send=async body=>{
  active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setImmediate(resolve));active--;
  return {version:1,attemptId:body.attemptId,subject:body.subject,releaseId:body.releaseId,responseId:id(200)};
 };
 assert.deepEqual(await mod.deliverDiagnosisSessions({enabled:true,rpc,send,limit:20}),{claimed:20,accepted:20,deferred:0});
 assert.deepEqual(batches,[5,5,5,5]);assert.equal(peak,5);
});
