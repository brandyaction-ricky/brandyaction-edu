import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';
const source=fs.readFileSync(new URL('../app/api/admin/learning-progress/route.ts',import.meta.url),'utf8');
function harness({user={id},allowed=true,error=null}={}){
 const calls=[];let opened=false;
 const mocks={
  '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
  '@/lib/operator-permissions':{getOperatorUser:async(scope,actor)=>{assert.equal(scope,'members');assert.equal(actor,user);return allowed?actor:null;}},
  '@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)},
  '@/lib/supabase/admin':{createAdminClient:()=>{opened=true;return{rpc:(name,args)=>({abortSignal:async signal=>{calls.push({name,args,signal});return{data:{rows:[],total:0,page:1,pageSize:20},error};}})};}}
 };
 const exports={};new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>mocks[name]);
 return{calls,opened:()=>opened,read:q=>exports.GET(new Request('https://edu.test/api/admin/learning-progress'+(q||'')))};
}
test('operator progress requires authentication and member permission before reading the database',async()=>{
 for(const [options,status]of [[{user:null},401],[{allowed:false},403]]){const h=harness(options);assert.equal((await h.read()).status,status);assert.equal(h.opened(),false);}
});
test('progress search is bounded, uses the authenticated actor and protects cached responses',async()=>{
 const h=harness(),response=await h.read('?member='+id+'&cohort='+id+'&search=QA&page=2&p_actor=forged');
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');
 assert.equal(h.calls[0].name,'edu_admin_learning_progress');assert.deepEqual(h.calls[0].args,{p_actor:id,p_member:id,p_cohort:id,p_query:'QA',p_page:2});assert.ok(h.calls[0].signal instanceof AbortSignal);
 for(const query of ['?member=bad','?cohort=bad','?page=0','?page=1.5','?page=100001','?search='+ 'x'.repeat(101)])assert.equal((await h.read(query)).status,400);
 assert.equal(h.calls.length,1);assert.doesNotMatch(source,/export async function (POST|PATCH|DELETE)|\.(insert|update|upsert|delete)\(/);
});
test('raw database failures are not exposed as progress or leaked details',async()=>{
 const response=await harness({error:{message:'private SQL'}}).read();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private SQL/);
});
