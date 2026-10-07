import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import ts from 'typescript';
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>mocks[name]);return out;}
const logic=compile('lib/optional-consent.ts');
const id='11111111-1111-4111-8111-111111111111';
function harness({user={id},error=null,authFailure=false}={}){
 const calls=[],db={rpc:async(name,args)=>{calls.push({name,args});return{data:{choices:logic.emptyConsent},error};},from:()=>({update:changes=>({eq:async(key,value)=>{calls.push({changes,key,value});return{error};}})})};
 const route=compile('app/api/account/marketing-consent/route.ts',{'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>{if(authFailure)throw Error('private auth detail');return user;}},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/optional-consent':logic});
 return{...route,calls,put:(body,origin='https://edu.test')=>route.PUT(new Request('https://edu.test/api/account/marketing-consent',{method:'PUT',headers:origin?{origin}:{},body:typeof body==='string'?body:JSON.stringify(body)}))};
}
test('consent API derives member from session, requires same origin, fixed wording and valid explicit channel choices',async t=>{
 const before=process.env.EDU_OPTIONAL_CONSENT_ENABLED;process.env.EDU_OPTIONAL_CONSENT_ENABLED='true';t.after(()=>{if(before===undefined)delete process.env.EDU_OPTIONAL_CONSENT_ENABLED;else process.env.EDU_OPTIONAL_CONSENT_ENABLED=before;});
 const body={requestId:id,expectedRevision:null,surface:'profile',wordingVersion:logic.OPTIONAL_CONSENT_VERSION,choices:{...logic.emptyConsent,marketingUse:true,kakao:true}};
 const h=harness();for(const origin of [null,'https://bad.test'])assert.equal((await h.put(body,origin)).status,403);
 assert.equal((await harness({user:null}).put(body)).status,401);
 for(const invalid of [null,{},'bad json',{...body,choices:{...body.choices,sms:true}},{...body,choices:{...body.choices,marketingUse:false}},{...body,wordingVersion:'forged'},{...body,expectedRevision:undefined},{...body,surface:'webinar'}])assert.equal((await h.put(invalid)).status,400);
 assert.equal(h.calls.length,0);
 const response=await h.put({...body,memberId:'victim',p_member:'victim'});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(h.calls[0].args.p_member,id);
 await h.GET();assert.deepEqual(h.calls[1].args,{p_member:id});
 assert.equal((await harness({error:{message:'CONSENT_CONFLICT'}}).put(body)).status,409);
 const broken=await harness({error:{message:'secret DB detail'}}).put(body);assert.equal(broken.status,503);assert.doesNotMatch(await broken.text(),/secret DB detail/);
 assert.equal((await harness({authFailure:true}).GET()).status,503);
});
test('disabled rollout keeps the old API isolated and cannot map new choices to legacy SMS',async t=>{
 const before=process.env.EDU_OPTIONAL_CONSENT_ENABLED;delete process.env.EDU_OPTIONAL_CONSENT_ENABLED;t.after(()=>{if(before!==undefined)process.env.EDU_OPTIONAL_CONSENT_ENABLED=before;});
 const h=harness();assert.equal((await h.GET()).status,503);assert.equal((await h.put({choices:logic.emptyConsent})).status,503);assert.equal(h.calls.length,0);
 assert.equal((await h.put({consent:false})).status,200);assert.equal(h.calls[0].changes.marketing_consent,false);
});
test('receipt uses the server processing date in Korean time and describes withdrawal',()=>{
 assert.match(logic.consentReceipt({updatedAt:'2026-10-19T16:10:00Z',changed:[{kind:'kakao',action:'withdrawal'}]}),/2026년 10월 20일.*카카오톡 광고 동의 철회.*처리/);
});
