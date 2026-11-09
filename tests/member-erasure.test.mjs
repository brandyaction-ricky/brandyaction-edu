import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import ts from'typescript';
let authMock;const req=createRequire(import.meta.url),modules=new Map();function load(name){if(modules.has(name))return modules.get(name);const e={};modules.set(name,e);new Function('exports','require',ts.transpileModule(readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(e,n=>n==='./supabase/admin'?{createAdminClient:()=>{if(authMock)return {auth:{admin:authMock}};throw Error('No real DB');}}:n.startsWith('./')?load(n.slice(2)):req(n));return e;}
const {eraseHeaders,sendDiagnosisErase,eraseCountKeys,validateEraseReceipt,EraseBridgeError}=load('diagnosis-erase-bridge');
const {dispatchMemberErasure,memberErasureReady,eraseMemberAuth}=load('member-erasure');
const subject='00000000-0000-4000-8000-000000000002',requestId='00000000-0000-4000-8000-000000000007';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://vjmjhaidlqkmascdjocw.supabase.co',NEXT_PUBLIC_APP_ENV:'dev',EDU_MYIN_BRIDGE_ENVIRONMENT:'dev',EDU_MYIN_BRIDGE_ORIGIN:'https://dev-server.myinlab.co.kr',EDU_MYIN_BRIDGE_SECRET:'11'.repeat(32),EDU_DIAGNOSIS_ERASURE_ENABLED:'true'};
const receipt=()=>({erased:true,requestId,counts:Object.fromEntries(eraseCountKeys.map(k=>[k,1])),storageRemoved:2,storageFailed:[]});
test('erase domain matches published MYIN vector exactly and differs from management signature',()=>{const body=JSON.stringify({subject,requestId});assert.equal(eraseHeaders(body,env.EDU_MYIN_BRIDGE_SECRET,'dev','1790838000').Authorization,'Bearer 08afc8ec38c95e17329bd7fe575d39e1d839b9ee7b15d39f6f66a6237d7813cf');assert.notEqual(eraseHeaders(body,env.EDU_MYIN_BRIDGE_SECRET,'dev','1790838000').Authorization,load('diagnosis-admin-bridge').adminDiagnosisHeaders(body,env.EDU_MYIN_BRIDGE_SECRET,'dev','1790838000').Authorization);});
test('transport sends only bound subject/requestId, strips provider fields/storage keys and fails closed on environment mismatch',async()=>{let calls=0;const fetcher=async(url,o)=>{calls++;assert.equal(url,env.EDU_MYIN_BRIDGE_ORIGIN+'/api/integrations/edu/diagnosis/erase');assert.deepEqual(JSON.parse(o.body),{subject,requestId});assert.equal(o.headers.Origin,undefined);assert.equal(o.redirect,'error');return Response.json({...receipt(),storageFailed:['private/key.html'],answers:'private'});};const v=await sendDiagnosisErase(subject,requestId,{env,fetcher});assert.equal(v.storageFailedCount,1);assert.doesNotMatch(JSON.stringify(v),/private|html|answers/);for(const patch of[{NEXT_PUBLIC_APP_ENV:'production'},{EDU_MYIN_BRIDGE_ENVIRONMENT:'production'},{EDU_MYIN_BRIDGE_ORIGIN:'https://attacker.test'},{EDU_MYIN_BRIDGE_SECRET:'bad'}])await assert.rejects(sendDiagnosisErase(subject,requestId,{env:{...env,...patch},fetcher}));assert.equal(calls,1);});
test('only retryable errors back off; mismatched receipts, malformed counts and oversized response never complete',async()=>{for(const status of[400,401,403,404,413,503])await assert.rejects(sendDiagnosisErase(subject,requestId,{env,fetcher:async()=>new Response('private',{status})}),e=>e.retryable===(status===503));await assert.rejects(sendDiagnosisErase(subject,requestId,{env,fetcher:async()=>{throw Error('secret');}}),e=>e.code==='NETWORK'&&e.retryable);for(const v of[{...receipt(),requestId:subject},{...receipt(),counts:{sessions:-1}},{...receipt(),storageFailed:null}])assert.throws(()=>validateEraseReceipt(v,requestId));await assert.rejects(sendDiagnosisErase(subject,requestId,{env,fetcher:async()=>new Response('x'.repeat(262145))}),e=>e.code==='INVALID_RESPONSE');});
test('disabled worker has no DB/remote side effects and partial storage uses same request/lease receipt',async()=>{let calls=[],sends=[];const job={subject,requestId,environment:'dev',lease:subject,authErased:true};const rpc=async(name,a)=>{calls.push([name,a]);return{data:name==='edu_claim_approved_member_erasure'?[job]:a.p_code===null,error:null};};assert.deepEqual(await dispatchMemberErasure({env:{...env,EDU_DIAGNOSIS_ERASURE_ENABLED:'false'},rpc}),{enabled:false,processed:0,completed:0});assert.equal(calls.length,0);const send=async(s,r)=>{sends.push([s,r]);return validateEraseReceipt({...receipt(),storageFailed:['key']},requestId);};assert.equal((await dispatchMemberErasure({env,rpc,send})).completed,0);assert.deepEqual(sends,[[subject,requestId]]);assert.equal(calls.at(-1)[1].p_code,'STORAGE_PENDING');assert.equal(calls.at(-1)[1].p_retryable,true);calls=[];await dispatchMemberErasure({env,rpc,send:async()=>{throw new EraseBridgeError('UNAUTHORIZED',false);}});assert.equal(calls.at(-1)[1].p_retryable,false);assert.equal(calls.at(-1)[1].p_result,null);});

test('worker targets only the confirmed request and cannot erase remote data before Auth receipt',async()=>{
 const calls=[];let remote=0,auth=0;
 const job={subject,requestId,environment:'dev',lease:subject,authErased:false};
 const rpc=async(name,args)=>{calls.push([name,args]);return {data:name==='edu_claim_approved_member_erasure'?[job]:null,error:name==='edu_record_member_auth_erasure'?{message:'private'}:null};};
 await dispatchMemberErasure({env,rpc,requestId,eraseAuth:async()=>{auth++;},send:async()=>{remote++;return validateEraseReceipt(receipt(),requestId);}});
 assert.equal(auth,1);assert.equal(remote,0);
 assert.deepEqual(calls[0],["edu_claim_approved_member_erasure",{p_environment:'dev',p_limit:1,p_request:requestId}]);
 assert.equal(calls.at(-1)[1].p_code,'AUTH_RECEIPT_PENDING');
 await assert.rejects(dispatchMemberErasure({env,rpc,requestId:subject}),/ERASURE_ENVIRONMENT_MISMATCH/);
});
test('misconfigured DB or bridge prevents all local/Auth/remote deletion',async()=>{
 for(const patch of [{NEXT_PUBLIC_SUPABASE_URL:'https://qitqxizuwmmlhlcgsrqe.supabase.co'},{EDU_MYIN_BRIDGE_ORIGIN:'https://server.myinlab.co.kr'},{EDU_MYIN_BRIDGE_SECRET:'bad'}]) {
  const wrong={...env,...patch};assert.equal(memberErasureReady(wrong),false);
  await assert.rejects(dispatchMemberErasure({env:wrong,rpc:()=>{throw Error('DB must not run');}}),/CONFIGURATION/);
 }
});

test('Auth erasure uses irreversible soft deletion and resumes safely after a lost receipt',async t=>{
 t.after(()=>{authMock=undefined;});let deletes=0;
 authMock={getUserById:async id=>{assert.equal(id,subject);return {data:{user:{id}},error:null};},deleteUser:async(id,soft)=>{assert.equal(id,subject);assert.equal(soft,true);deletes++;return {error:null};}};
 await eraseMemberAuth(subject);assert.equal(deletes,1);
 authMock.getUserById=async()=>({data:{user:{deleted_at:'2026-11-09T00:00:00Z'}},error:null});
 await eraseMemberAuth(subject);assert.equal(deletes,1);
 authMock.getUserById=async()=>({data:{user:null},error:{code:'user_not_found'}});
 await eraseMemberAuth(subject);assert.equal(deletes,1);
 authMock.getUserById=async()=>({data:{user:null},error:{code:'unexpected',message:'private'}});
 await assert.rejects(eraseMemberAuth(subject),e=>e.code==='AUTH_ERASURE_FAILED'&&!e.message.includes('private'));
});
