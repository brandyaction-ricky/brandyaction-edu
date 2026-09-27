import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {createHash,randomUUID} from 'node:crypto';
function load(path,modules={},env={}){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(modules[name],name);return modules[name];},{env});return exports;}
const server=load('../lib/conversion-review-server.ts',{'node:crypto':{createHash}});
const code=randomUUID(),actor=randomUUID();
function harness({permissions={products:true,members:true,orders:true},error=null}={}){
 const calls=[];const modules={'@/lib/conversion-review-server':server,'@/lib/operator-permissions':{getOperatorUser:async()=>({id:actor,permissions})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{error,data:{drafts:[],audienceState:'unmapped',counts:null}};}})}};
 return {calls,route:load('../app/api/conversion/followup/route.ts',modules,{EDU_CONVERSION_REVIEW_ENABLED:'true'})};
}
test('followup API derives actor and isolates preparation; permission, stale and origin boundaries',async()=>{
 const body={code,channel:'direct',purpose:'encore',body:'안내 초안',expected:0,actor:'forged'};
 const post=(value=body,origin='https://example.test')=>new Request('https://example.test/api/conversion/followup',{method:'POST',headers:{origin},body:JSON.stringify(value)});
 const h=harness();assert.equal((await h.route.POST(post())).status,200);assert.equal(h.calls[0].name,'edu_manage_webinar_followup');assert.equal(h.calls[0].args.p_actor,actor);assert.deepEqual(Object.keys(h.calls[0].args.p_settings).sort(),['body','channel','expected','purpose']);
 assert.equal((await h.route.POST(post(body,'https://evil.test'))).status,403);
 assert.equal((await h.route.POST(post({...body,body:' '}))).status,400);
 assert.equal((await h.route.POST(post({...body,body:'x'.repeat(2001)}))).status,400);
 assert.equal((await harness({permissions:{products:true}}).route.POST(post())).status,403);
 assert.equal((await harness({permissions:{products:true}}).route.POST(post({...body,channel:'room'}))).status,200);
 assert.equal((await harness({permissions:{}}).route.GET(new Request('https://example.test?code='+code))).status,403);
 const response=await harness({error:{message:'CONVERSION_STALE'}}).route.POST(post());assert.equal(response.status,409);assert.match(response.headers.get('cache-control'),/no-store/);
});
