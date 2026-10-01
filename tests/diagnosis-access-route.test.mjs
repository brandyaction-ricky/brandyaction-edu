import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),lib={};
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('exports','require',compile('../lib/diagnosis-access.ts'))(lib,require);
const routeSource=compile('../app/api/integrations/myin/diagnosis/access/route.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={version:1,subject:id(1),attemptId:id(2),sessionId:id(3),releaseId:id(4),packageVersion:'v1',revision:3,purpose:'generate',nonce:id(5)};
const secret='11'.repeat(32),baseEnv={NEXT_PUBLIC_APP_ENV:'dev',EDU_MYIN_BRIDGE_ENVIRONMENT:'dev',EDU_MYIN_BRIDGE_ORIGIN:'https://dev-server.myinlab.co.kr',EDU_MYIN_BRIDGE_SECRET:secret,
 EDU_MYIN_DIAGNOSIS_ENABLED:'true',EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED:'true',EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED:'true'};
function fixture({env={},result='allow'}={}){
 const route={},calls=[];
 const mocks={'@/lib/diagnosis-access':lib,'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{
   calls.push({name,args});const now=Date.now();return result==='error'?{error:Error('private database secret')}:{data:result==='deny'?null:{grantId:id(8),checkedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString()},error:null};
 }})}};
 new Function('exports','require','process',routeSource)(route,n=>mocks[n],{env:{...baseEnv,...env}});
 const post=async({body=JSON.stringify(input),headers={},timestamp=String(Math.floor(Date.now()/1000))}={})=>{
   const signature=lib.diagnosisAccessSignature({body,secret,environment:'dev',timestamp});
   const h=new Headers({'Content-Type':'application/json','X-Edu-Environment':'dev','X-Edu-Timestamp':timestamp,Authorization:`Bearer ${signature}`});
   for(const [key,value]of Object.entries(headers)){if(value===null)h.delete(key);else h.set(key,value);}
   return route.POST(new Request('https://edu.test'+lib.DIAGNOSIS_ACCESS_PATH,{method:'POST',headers:h,body}));
 };
 return{calls,post};
}
test('reverse bridge is dark unless all three flags and matching explicit environment are configured',async()=>{
 for(const key of ['EDU_MYIN_DIAGNOSIS_ENABLED','EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED','EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED']){const h=fixture({env:{[key]:'false'}});assert.equal((await h.post()).status,404);assert.equal(h.calls.length,0);}
 for(const env of [{NEXT_PUBLIC_APP_ENV:'production'},{EDU_MYIN_BRIDGE_SECRET:'bad'},{EDU_MYIN_BRIDGE_ORIGIN:'https://evil.example'}]){const h=fixture({env});assert.equal((await h.post()).status,503);assert.equal(h.calls.length,0);}
});
test('browser origins, cookie-only requests, cross-environment and stale/invalid signatures fail before DB access',async()=>{
 const h=fixture();
 for(const headers of [{Origin:'https://edu.test'},{Origin:''},{Origin:'null'}])assert.equal((await h.post({headers})).status,403);
 assert.equal((await h.post({headers:{Authorization:null,Cookie:'session=not-authority'}})).status,401);
 assert.equal((await h.post({headers:{'X-Edu-Environment':'production'}})).status,403);
 assert.equal((await h.post({headers:{Authorization:'Bearer '+ '00'.repeat(32)}})).status,401);
 assert.equal((await h.post({timestamp:String(Math.floor(Date.now()/1000)-61)})).status,401);
 assert.equal(h.calls.length,0);
});
test('strict JSON and actual streaming byte bound reject malformed commands and oversized bodies',async()=>{
 const h=fixture();assert.equal((await h.post({body:'{'})).status,400);
 assert.equal((await h.post({headers:{'Content-Type':'text/plain'}})).status,415);
 assert.equal((await h.post({body:'한'.repeat(22000),headers:{'Content-Length':'1'}})).status,413);
 assert.equal((await h.post({body:JSON.stringify({...input,subjectOverride:id(77)})})).status,400);
 assert.equal(h.calls.length,0);
});
test('successful access echoes only the fixed binding and grant for an uncached 30-second observation',async()=>{
 const h=fixture(),res=await h.post(),data=await res.json();assert.equal(res.status,200);
 assert.deepEqual(data,{...input,environment:'dev',allowed:true,grantId:id(8),checkedAt:data.checkedAt,expiresAt:data.expiresAt});
 assert.equal(Date.parse(data.expiresAt)-Date.parse(data.checkedAt),30000);
 assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(res.headers.get('x-content-type-options'),'nosniff');assert.match(res.headers.get('x-robots-tag'),/noindex/);
 assert.equal(h.calls[0].args.p_subject,input.subject);assert.equal(h.calls[0].args.p_attempt,input.attemptId);
});
test('revoked rights and uncertain infrastructure are distinct and never leak internal errors',async()=>{
 for(const [result,status,code]of [['deny',403,'FORBIDDEN'],['error',503,'UNAVAILABLE']]){
   const h=fixture({result}),res=await h.post();assert.equal(res.status,status);assert.deepEqual(await res.json(),{code});assert.equal(h.calls.length,1);
 }
});
