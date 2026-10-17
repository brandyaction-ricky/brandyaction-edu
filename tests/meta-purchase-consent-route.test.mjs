import test from 'node:test';import assert from 'node:assert/strict';import { readFileSync } from 'node:fs';import ts from 'typescript';
function compile(file,mocks={}) { const out={};new Function('exports','require',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,n=>mocks[n]);return out; }
const logic=compile('lib/meta-purchase-consent.ts'),id='11111111-1111-4111-8111-111111111111';
function harness({user={id},error=null}={}) {
 const calls=[];
 const route=compile('app/api/account/meta-purchase-consent/route.ts',{'next/server':{NextResponse:{json:(body,opts)=>Response.json(body,opts)}},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{consented:args.p_consented===true,active:false,terms:null},error};}})},'@/lib/meta-purchase-consent':logic});
 return {...route,calls,put:(body,origin='https://edu.test')=>route.PUT(new Request('https://edu.test/api/account/meta-purchase-consent',{method:'PUT',headers:origin?{origin}:{},body:JSON.stringify(body)}))};
}
test('Meta consent endpoint protects origin, identity and payload; no marketing or coupon RPC is invoked',async()=>{
 const body={requestId:id,expectedRevision:null,consented:true,wordingVersion:'v1',surface:'signup'},a=harness();
 for(const origin of [null,'https://evil.test'])assert.equal((await a.put(body,origin)).status,403);
 assert.equal((await harness({user:null}).GET()).status,401);assert.equal((await harness({user:null}).put(body)).status,401);
 for(const invalid of [null,{}, {...body,consented:'yes'},{...body,expectedRevision:undefined},{...body,wordingVersion:''},{...body,surface:'admin'},{...body,memberId:'someone-else'}])assert.equal((await a.put(invalid)).status,400);
 assert.equal(a.calls.length,0);const response=await a.put(body);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(a.calls,[{name:'edu_meta_purchase_consent',args:{p_member:id,p_request:id,p_expected:null,p_consented:true,p_version:'v1',p_surface:'signup'}}]);
 assert.equal((await a.put({...body,consented:false,wordingVersion:null,surface:'profile'})).status,200);
 for(const [message,status] of [['META_CONSENT_CONFLICT',409],['META_CONSENT_TERMS',409],['META_CONSENT_FORBIDDEN',403],['private database error',503]]){
  const r=await harness({error:{message}}).put(body);assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/private database error/);
 }
 assert.equal((await a.PUT(new Request('https://edu.test/api/account/meta-purchase-consent',{method:'PUT',headers:{origin:'https://edu.test'},body:'x'.repeat(2049)}))).status,413);
});
