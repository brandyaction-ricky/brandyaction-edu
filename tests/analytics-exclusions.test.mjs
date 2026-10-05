import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(file,mocks={}) { const exports={}; new Function('exports','require',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>mocks[name]||{}); return exports; }
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const { orderExclusionLabel } = load('lib/admin-order-list.ts');
const helpers=load('lib/analytics-exclusions.ts',{'./edu-workflows':{uuid}});
const id='00000000-0000-4000-8000-000000000001',actor='00000000-0000-4000-8000-000000000002';
const valid={kind:'order',id,excluded:true,expected:false,reason:' QA '};
const url='https://brandyaction-edu-dev.vercel.app/api/admin/analytics-exclusions';
const request=(body=valid,origin=new URL(url).origin)=>new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
function api(user,db){ return load('app/api/admin/analytics-exclusions/route.ts',{'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/edu-workflows':{uuid},'@/lib/analytics-exclusions':helpers}); }
test('E1 mutations validate classification and reason; no amount/name/email guessing',()=>{
  assert.equal(helpers.analyticsExclusionInput(valid).reason,'QA');
  for(const patch of [{kind:'payments'},{id:'bad'},{excluded:1},{expected:undefined},{reason:' '},{reason:'x'.repeat(501)},{actor}])
    assert.throws(()=>helpers.analyticsExclusionInput({...valid,...patch}),e=>e.status===400);
  assert.equal(orderExclusionLabel({user_id:id,total_amount:1000},{role:'student',status:'active'}),'');
  assert.match(orderExclusionLabel({user_id:id,total_amount:1000,is_test_order:true},{role:'student',status:'active'}),/시험 주문/);
});
test('E1 route enforces identity, same-origin, optimistic state and hides DB failure details',async()=>{
  for(const [user,status] of [[null,401],[{role:'student'},403],[{role:'staff'},403]]) {
    const routes=api(user,{}); assert.equal((await routes.POST(request())).status,status); assert.equal((await routes.GET(new Request(url+'?kind=order&id='+id))).status,status);
  }
  const calls=[];
  const routes=api({id:actor,role:'admin'},{rpc:async(name,params)=>{calls.push({name,params}); return {data:{excluded:true,changed:true},error:null};}});
  assert.equal((await routes.POST(request(valid,'https://evil.test'))).status,403);
  assert.equal((await routes.POST(request({...valid,actor}))).status,400); assert.equal(calls.length,0);
  assert.equal((await routes.POST(request())).status,200);
  assert.deepEqual(calls,[{name:'edu_set_analytics_exclusion',params:{p_actor:actor,p_kind:'order',p_id:id,p_excluded:true,p_expected:false,p_reason:'QA'}}]);
  const stale=api({id:actor,role:'admin'},{rpc:async()=>({error:{message:'ANALYTICS_STALE'}})});
  assert.equal((await stale.POST(request())).status,409);
  const failed=api({id:actor,role:'admin'},{rpc:async()=>({error:{message:'private SQL debug'}})});
  const result=await failed.POST(request()); assert.equal(result.status,503); assert.doesNotMatch(await result.text(),/private SQL debug/);
});
