import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222';
function harness({allowed=true,error=null}={}) {
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{weeks:2},error};},from(){throw Error('Unexpected query');}};
 const mocks={'@/lib/operator-permissions':{getOperatorUser:async()=>allowed?{id,role:'admin'}:null},'@/lib/supabase/admin':{createAdminClient:()=>db}};
 const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../app/api/platform/curriculum-copy/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>mocks[name]);
 const post=(body={sourceId:id,targetId:target,requestId:id,revision:'a'.repeat(32)},origin='https://edu.test')=>exports.POST(new Request('https://edu.test/api/platform/curriculum-copy',{method:'POST',headers:origin?{origin,'content-type':'application/json'}:{},body:JSON.stringify(body)}));
 return {calls,post,get:exports.GET};
}
test('copy requires product permission and exact origin before touching DB',async()=>{
 const h=harness();for(const origin of ['https://evil.test',null])assert.equal((await h.post(undefined,origin)).status,403);assert.equal(h.calls.length,0);
 const denied=harness({allowed:false});assert.equal((await denied.post()).status,403);assert.equal((await denied.get(new Request('https://edu.test/api/platform/curriculum-copy?source='+id))).status,403);assert.equal(denied.calls.length,0);
});
test('copy validates IDs and derives actor from session, not body',async()=>{
 const h=harness();assert.equal((await h.post(null)).status,400);assert.equal((await h.post({sourceId:'bad'})).status,400);assert.equal(h.calls.length,0);
 assert.equal((await h.post({sourceId:id,targetId:target,requestId:id,revision:'a'.repeat(32),p_actor:target})).status,200);
 assert.equal(h.calls[0].args.p_actor,id);assert.equal(h.calls[0].args.p_target,target);
});
test('preview is private and returns summary only; backend errors are sanitized',async()=>{
 const h=harness();const r=await h.get(new Request('https://edu.test/api/platform/curriculum-copy?source='+id));assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(await r.json(),{preview:{weeks:2}});
 const stale=harness({error:{message:'COPY_SOURCE_CHANGED'}});assert.equal((await stale.post()).status,409);
 const media=harness({error:{message:'COPY_MEDIA_INVALID'}});assert.equal((await media.post()).status,409);
 const fail=harness({error:{message:'database password SECRET'}});const failed=await fail.post();assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('SECRET'));
});
