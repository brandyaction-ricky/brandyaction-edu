import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,n=>mocks[n]);return out;}
const logic=compile('lib/welcome-consent.ts'), id='11111111-1111-4111-8111-111111111111';
const payload=()=>({requestId:id,copyVersion:logic.WELCOME_CONSENT_COPY,scope:'welcome',choices:{...logic.noWelcomeChoices,email:true},expected:{marketing:null,personal:null,meta:null},versions:{personal:'p1',meta:'m1'}});
function h({user={id},error=null}={}){const calls=[];const route=compile('app/api/account/welcome-consent/route.ts',{'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(n,args)=>{calls.push({n,args});return{data:{personal:{terms:{version:'p1'}},meta:{terms:{version:'m1'}},reward:{available:true}},error};}})},'@/lib/welcome-consent':logic});return{...route,calls,put:(body,origin='https://edu.test')=>route.PUT(new Request('https://edu.test/api/account/welcome-consent',{method:'PUT',headers:origin?{origin}:{},body:typeof body==='string'?body:JSON.stringify(body)}))};}
test('welcome request shape cannot smuggle identities, flags, choices or implicit grants',()=>{
 assert.equal(logic.validWelcomeRequest(payload()),true);
 for(const b of [null,[],{}, {...payload(),memberId:'other'}, {...payload(),allowReward:true}, {...payload(),scope:'admin'}, {...payload(),copyVersion:'old'}, {...payload(),choices:{...payload().choices,meta:'true'}}, {...payload(),choices:{email:true}}, {...payload(),expected:{...payload().expected,personal:'not-a-uuid'}}, {...payload(),versions:{...payload().versions,meta:''}}])assert.equal(logic.validWelcomeRequest(b),false);
});
test('welcome API binds authenticated identity and trusted flags; origin, input limits and DB errors stay private',async t=>{
 const keys=['EDU_OPTIONAL_CONSENT_ENABLED','EDU_PERSONALIZATION_CONSENT_ENABLED','EDU_CONSENT_REWARD_ENABLED'],before=keys.map(k=>process.env[k]);t.after(()=>keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i];}));keys.forEach(k=>delete process.env[k]);
 const a=h();let r=await a.GET();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual((await r.json()).accepting,{marketing:false,personal:false,meta:false});assert.equal(a.calls[0].args.p_allow_reward,false);
 for(const origin of [null,'https://evil.test'])assert.equal((await a.put(payload(),origin)).status,403);
 assert.equal((await h({user:null}).put(payload())).status,401);assert.equal((await h({user:null}).GET()).status,401);
 assert.equal((await a.put('x'.repeat(4097))).status,413);assert.equal((await a.put('{bad')).status,400);assert.equal((await a.put({...payload(),memberId:'other'})).status,400);assert.equal(a.calls.length,1);
 keys.forEach(k=>process.env[k]='true');r=await a.put(payload());assert.equal(r.status,200);assert.equal(a.calls[1].n,'edu_welcome_consent');assert.equal(a.calls[1].args.p_member,id);assert.equal(a.calls[1].args.p_allow_reward,true);assert.deepEqual(a.calls[1].args.p_payload,payload());
 for(const [message,status] of [['WELCOME_FORBIDDEN',403],['WELCOME_CONFLICT',409],['META_PURCHASE_TERMS',409],['WELCOME_ANSWERED',409],['WELCOME_INVALID',400],['REWARD_UNAVAILABLE',503],['private secret detail',503]]){const r=await h({error:{message}}).put(payload());assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/private secret detail/);}
});
