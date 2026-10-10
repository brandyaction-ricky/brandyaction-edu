import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import ts from'typescript';
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,n=>mocks[n]);return out;}
const logic=compile('lib/consent-reward.ts');const id='11111111-1111-4111-8111-111111111111';
function h({user={id},error=null}={}){const calls=[];const route=compile('app/api/account/consent-reward/route.ts',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(n,args)=>{calls.push({n,args});return{data:{available:true,terms:{version:'v1'},awarded:true},error};}})},'@/lib/consent-reward':logic});return{...route,calls,post:(body,origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/account/consent-reward',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)}))};}
test('reward route is gated, binds session identity and refuses forged/ambiguous choices',async t=>{
 const names=['EDU_CONSENT_REWARD_ENABLED','EDU_OPTIONAL_CONSENT_ENABLED','EDU_PERSONALIZATION_CONSENT_ENABLED'];const before=names.map(n=>process.env[n]);t.after(()=>names.forEach((n,i)=>{if(before[i]===undefined)delete process.env[n];else process.env[n]=before[i];}));names.forEach(n=>delete process.env[n]);
 const body={requestId:id,payload:{choices:{analysis:false,overseas:false,kakao:true},personalRevision:null,marketingRevision:null,wordingVersion:null,marketingVersion:'2026-10-20'}};
 const a=h();assert.equal((await a.post(body)).status,503);assert.equal((await(await a.GET()).json()).available,false);assert.equal(a.calls.length,0);
 process.env.EDU_CONSENT_REWARD_ENABLED='true';assert.equal((await a.post(body)).status,503);process.env.EDU_OPTIONAL_CONSENT_ENABLED='true';
 const adsOnly=await(await a.GET()).json();assert.equal(adsOnly.analysisAvailable,false);assert.equal(adsOnly.terms,null);
 assert.equal((await a.post(body)).status,200);assert.equal(a.calls.at(-1).args.p_member,id);
 assert.equal((await a.post({...body,payload:{...body.payload,choices:{analysis:true,overseas:true,kakao:true}}})).status,409);
 process.env.EDU_PERSONALIZATION_CONSENT_ENABLED='true';
 for(const origin of [null,'https://evil.test'])assert.equal((await a.post(body,origin)).status,403);
 assert.equal((await h({user:null}).post(body)).status,401);
 for(const invalid of [null,{}, {...body,payload:{...body.payload,personalRevision:undefined}},{...body,payload:{...body.payload,choices:{analysis:false,overseas:false,kakao:false}}},{...body,payload:{...body.payload,choices:{analysis:true,overseas:true,kakao:true,email:true}}}])assert.equal((await a.post(invalid)).status,400);
 assert.equal((await h({error:{message:'CONSENT_CONFLICT'}}).post(body)).status,409);
 assert.doesNotMatch(await(await h({error:{message:'secret internal error'}}).post(body)).text(),/secret internal error/);
 assert.equal((await a.GET()).headers.get('cache-control'),'private, no-store');
});
