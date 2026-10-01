import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const actor='11111111-1111-4111-8111-111111111111', a='22222222-2222-4222-8222-222222222222', b='33333333-3333-4333-8333-333333333333';
const source=fs.readFileSync(new URL('../app/api/admin/lesson-order/route.ts',import.meta.url),'utf8');
const body={courseId:actor,weekId:a,ids:[b,a],expected:[{id:a,day:6,updatedAt:'2026-10-01T00:00:00.123456Z'},{id:b,day:8,updatedAt:'2026-10-01T00:00:00Z'}]};
function harness({allowed=true,error=null}={}) {
 const calls=[],invalidated=[];
 const mocks={
  'next/cache':{revalidateTag:(...args)=>invalidated.push(args)},
  '@/lib/public-platform-plan':{PUBLIC_CACHE_TAG:'public-test'},
  '@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'products');return allowed?{id:actor}:null;}},
  '@/lib/edu-workflows':{uuid:value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value)},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:(name,args)=>({abortSignal:async signal=>{calls.push({name,args,signal});return {data:2,error};}})})},
 };
 const exports={}; new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>mocks[name]);
 return {calls,invalidated,send:(data=body,origin='https://edu.test')=>exports.POST(new Request('https://edu.test/api/admin/lesson-order',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:typeof data==='string'?data:JSON.stringify(data)}))};
}
test('lesson ordering authenticates, checks origin, bounds requests and uses actor from the session',async()=>{
 const denied=harness({allowed:false});assert.equal((await denied.send()).status,403);assert.equal(denied.calls.length,0);
 const h=harness();for(const origin of ['https://evil.test','null',''])assert.equal((await h.send(body,origin)).status,403);
 for(const input of ['{',null,{...body,ids:[a,a]},{...body,expected:[]},{...body,expected:[null,null]},{...body,expected:body.expected.map(x=>({...x,updatedAt:'bad'}))},{...body,expected:body.expected.map(x=>({...x,day:0}))}]) assert.equal((await h.send(input)).status,400);
 assert.equal((await h.send('x'.repeat(200001))).status,413);assert.equal(h.calls.length,0);
 const response=await h.send({...body,p_actor:b});assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,changed:2});
 assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');
 assert.deepEqual(h.calls[0].args,{p_actor:actor,p_course:actor,p_week:a,p_ids:[b,a],p_expected_ids:[a,b],p_expected_days:[6,8],p_expected_updated_at:body.expected.map(x=>x.updatedAt)});
 assert.equal(h.calls[0].name,'edu_admin_reorder_lessons');assert.ok(h.calls[0].signal instanceof AbortSignal);
 assert.deepEqual(h.invalidated,[['public-test',{expire:0}]]);
});
test('stale snapshots and infrastructure errors do not claim success or leak raw SQL',async()=>{
 for(const [error,status] of [[{message:'LESSON_ORDER_CHANGED'},409],[{message:'LESSON_ORDER_NOT_FOUND'},404],[{message:'private SQL details'},503]]){
  const h=harness({error}),response=await h.send();assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/private SQL details/);assert.equal(h.invalidated.length,0);
 }
});
