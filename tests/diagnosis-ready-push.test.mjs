import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
class BridgeError extends Error {constructor(code,status){super(code);this.code=code;this.status=status;}}
const context={subject:id(1),attemptId:id(2),responseId:id(3),releaseId:id(4),packageVersion:'test',revision:1};
const load=(path,mocks)=>{const exports={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../lib/'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>mocks[n]);return exports;};
const report=load('diagnosis-report.ts',{'./diagnosis-bridge':{DiagnosisBridgeError:BridgeError},'node:crypto':{}});
const service=load('diagnosis-report-service.ts',{'./diagnosis-bridge':{DiagnosisBridgeError:BridgeError},'./diagnosis-report':report});
const {pollDiagnosisReadyPush,diagnosisReadyPushEnabled}=load('diagnosis-ready-push.ts',{'./diagnosis-bridge':{DiagnosisBridgeError:BridgeError},'./diagnosis-report-service':service});
function fixture({state='ready',error=false,changed=false,forbidden=false,malformed=false,count=1,finishError=false}={}){
 const calls=[],sends=[];let contexts=0,active=0,maxActive=0;
 const rpc=async(name,args)=>{calls.push([name,args]);if(name==='edu_claim_report_watches')return{data:Array.from({length:count},()=>({attemptId:id(2),userId:id(1),lease:id(5)}))};
 if(name==='edu_diagnosis_context'){contexts++;return forbidden?{error:{message:'DIAGNOSIS_FORBIDDEN'}}:{data:{...context,...(changed&&contexts===2?{attemptId:id(9)}:{})}};}
 if(name==='edu_finish_report_watch')return{data:!finishError,error:finishError};throw Error(name);};
 const send=async(c,action)=>{sends.push(action);maxActive=Math.max(maxActive,++active);await new Promise(resolve=>setTimeout(resolve,1));active--;if(error)throw Error('PRIVATE');return{...c,version:1,reportId:state==='ready'?id(6):null,updatedAt:'2026-10-05T00:00:00Z',state,canRetry:false,downloadAvailable:state==='ready',...(malformed?{subject:id(99)}:{})};};
 return{rpc,send,calls,sends,get maxActive(){return maxActive;}};
}
test('feature gate requires every server-side switch; off never even claims work',async()=>{
 const env=Object.fromEntries(['EDU_DIAGNOSIS_READY_PUSH_ENABLED','EDU_MYIN_DIAGNOSIS_ENABLED','EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED','EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED','EDU_WEB_PUSH_ENABLED','NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED'].map(k=>[k,'true']));assert.equal(diagnosisReadyPushEnabled(env),true);for(const key in env)assert.equal(diagnosisReadyPushEnabled({...env,[key]:'false'}),false);
 const h=fixture();assert.equal((await pollDiagnosisReadyPush({...h,enabled:false})).checked,0);assert.equal(h.calls.length,0);
});
test('only validated ready status emits readiness, never HTML/download/generation',async()=>{
 for(const state of ['queued','processing','ready','needs_review','access_denied']){const h=fixture({state}),r=await pollDiagnosisReadyPush({...h,enabled:true});assert.deepEqual(h.sends,['status']);assert.equal(h.calls.at(-1)[1].p_state,state);assert.equal(r.ready,state==='ready'?1:0);}
});
test('transport failure, malformed identity, retest race and access revocation cannot emit completion',async()=>{
 for(const [options,state] of [[{error:true},'unavailable'],[{malformed:true},'unavailable'],[{changed:true},'obsolete'],[{forbidden:true},'access_denied']]){const h=fixture(options),r=await pollDiagnosisReadyPush({...h,enabled:true});assert.equal(r.ready,0);assert.equal(h.calls.at(-1)[1].p_state,state);}
});
test('bounded batch and concurrency; unacknowledged finishes rely on lease recovery',async()=>{
 const h=fixture({count:100});const r=await pollDiagnosisReadyPush({...h,enabled:true});assert.equal(h.maxActive,5);assert.equal(r.checked,20);assert.equal(h.calls[0][1].p_limit,20);
 const f=fixture({finishError:true});assert.equal((await pollDiagnosisReadyPush({...f,enabled:true})).deferred,1);
});
test('cron rejects missing or wrong credentials and does not create a DB client while rollout is off',async()=>{
 const crypto=await import('node:crypto');
 const source=ts.transpileModule(readFileSync(new URL('../app/api/cron/diagnosis-notifications/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 function cron(secret,enabled){const route={},calls=[];const mocks={'node:crypto':crypto,'@/lib/supabase/admin':{createAdminClient:()=>{calls.push('db');return{rpc:async()=>({data:[]})};}},'@/lib/diagnosis-report':{sendDiagnosisReportCommand:()=>{}},'@/lib/diagnosis-ready-push':{diagnosisReadyPushEnabled:()=>enabled,pollDiagnosisReadyPush:async()=>({enabled:true,checked:0})}};new Function('exports','require','process',source)(route,n=>mocks[n],{env:{CRON_SECRET:secret}});return{calls,get:auth=>route.GET(new Request('https://edu.test/api/cron/diagnosis-notifications',{headers:auth?{authorization:auth}:{}}))};}
 for(const secret of ['', 'synthetic-secret']){const h=cron(secret,true);for(const auth of [undefined,'Bearer wrong','Bearer '])assert.equal((await h.get(auth)).status,401);assert.deepEqual(h.calls,[]);}
 const off=cron('synthetic-secret',false);const r=await off.get('Bearer synthetic-secret');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(off.calls,[]);
 const on=cron('synthetic-secret',true);assert.equal((await on.get('Bearer synthetic-secret')).status,200);assert.deepEqual(on.calls,['db']);
});
