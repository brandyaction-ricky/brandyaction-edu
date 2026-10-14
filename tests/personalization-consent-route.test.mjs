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
test('post-save source work cannot break consent response; GET/auth/origin/failed commits never schedule it',async t=>{
 const previous={control:process.env.EDU_TIPS_CONTROL_RUNTIME_ENABLED,personalization:process.env.EDU_PERSONALIZATION_CONSENT_ENABLED};
 t.after(()=>{for(const[k,v]of[['EDU_TIPS_CONTROL_RUNTIME_ENABLED',previous.control],['EDU_PERSONALIZATION_CONSENT_ENABLED',previous.personalization]])if(v===undefined)delete process.env[k];else process.env[k]=v;});
 process.env.EDU_TIPS_CONTROL_RUNTIME_ENABLED='true';delete process.env.EDU_PERSONALIZATION_CONSENT_ENABLED;
 const callbacks=[],commits=[],sources=[];
 const route=compile('app/api/account/personalization-consent/route.ts',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)},after:fn=>callbacks.push(fn)},'@/lib/server-auth':{getAuthenticatedUser:async()=>({id})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(n,a)=>{commits.push(a);return{data:{choices:logic.noPersonalization,revision:id,eligible:false},error:null};}})},'@/lib/personalization-consent':logic,'@/lib/edu-tips-source-server':{consentSourceAfterSave:async member=>{sources.push(member);throw Error('background transport unavailable');}}});
 const req={requestId:id,expectedRevision:null,wordingVersion:null,choices:logic.noPersonalization,memberId:'untrusted'};
 const res=await route.PUT(new Request('https://edu.test/api/account/personalization-consent',{method:'PUT',headers:{origin:'https://edu.test'},body:JSON.stringify(req)}));
 assert.equal(res.status,200);assert.equal(callbacks.length,1);assert.equal(commits[0].p_member,id);assert.deepEqual(sources,[]);
 await callbacks[0]();assert.deepEqual(sources,[id]);assert.equal((await res.json()).eligible,false);
 await route.GET();assert.equal(callbacks.length,1);
 const failed=compile('app/api/account/personalization-consent/route.ts',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)},after:()=>{throw Error('must not schedule');}},'@/lib/server-auth':{getAuthenticatedUser:async()=>({id})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:null,error:{message:'PERSONALIZATION_CONFLICT'}})})},'@/lib/personalization-consent':logic});
 const make=()=>new Request('https://edu.test/api/account/personalization-consent',{method:'PUT',headers:{origin:'https://edu.test'},body:JSON.stringify(req)});
 assert.equal((await failed.PUT(make())).status,409);
});
