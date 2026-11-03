import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import ts from'typescript';
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,n=>mocks[n]);return out;}
const logic=compile('lib/personalization-consent.ts');const id='11111111-1111-4111-8111-111111111111';
function h({user={id},error=null}={}){const calls=[];const route=compile('app/api/account/personalization-consent/route.ts',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(n,args)=>{calls.push({n,args});return{data:{terms:{version:'v1'},eligible:true},error};}})},'@/lib/personalization-consent':logic});return{...route,calls,put:(body,origin='https://edu.test')=>route.PUT(new Request('https://edu.test/api/account/personalization-consent',{method:'PUT',headers:origin?{origin}:{},body:JSON.stringify(body)}))};}
test('personalization route protects identity/origin and lets users withdraw while collection is disabled',async t=>{
 const before=process.env.EDU_PERSONALIZATION_CONSENT_ENABLED;t.after(()=>{if(before===undefined)delete process.env.EDU_PERSONALIZATION_CONSENT_ENABLED;else process.env.EDU_PERSONALIZATION_CONSENT_ENABLED=before;});
 const body={requestId:id,expectedRevision:null,wordingVersion:'v1',choices:{analysis:true,overseas:true}};
 delete process.env.EDU_PERSONALIZATION_CONSENT_ENABLED;const a=h();assert.equal((await a.put(body)).status,503);assert.equal(a.calls.length,0);
 assert.equal((await a.put({...body,choices:logic.noPersonalization})).status,200);assert.equal((await(await a.GET()).json()).eligible,false);
 process.env.EDU_PERSONALIZATION_CONSENT_ENABLED='true';const b=h();
 for(const origin of [null,'https://evil.test'])assert.equal((await b.put(body,origin)).status,403);
 assert.equal((await h({user:null}).put(body)).status,401);
 for(const invalid of [null,{}, {...body,expectedRevision:undefined},{...body,choices:{analysis:true,overseas:true,marketingUse:true}}])assert.equal((await b.put(invalid)).status,400);
 assert.equal(b.calls.length,0);const response=await b.put({...body,memberId:'someone-else'});assert.equal(response.status,200);assert.equal(b.calls[0].args.p_member,id);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await h({error:{message:'PERSONALIZATION_CONFLICT'}}).put(body)).status,409);
 assert.equal((await h({error:{message:'PERSONALIZATION_TERMS'}}).put(body)).status,409);
 assert.doesNotMatch(await(await h({error:{message:'private DB detail'}}).GET()).text(),/private DB detail/);
});
