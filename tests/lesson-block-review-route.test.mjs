import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';
function compile(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>mocks[name]);return out;}
const blocks=compile('lib/lesson-blocks.ts',{'./lesson-guided-tools':compile('lib/lesson-guided-tools.ts'),'./lesson-calculators':compile('lib/lesson-calculators.ts')});
const document={schemaVersion:1,blocks:[{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'q',prompt:'시험',options:['가','나'],correctIndex:1}]}}],checklist:[]};
function harness({user={id,role:'admin'},allowed=true,error=null}={}){
 const calls=[],permissions=[];
 const route=compile('app/api/admin/lesson-block-reviews/route.ts',{'@/lib/lesson-blocks':blocks,'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/.test(v)},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{document},error};}})},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async(scope,actor)=>{permissions.push({scope,actor});return allowed?user:null;}}});
 const get=(q='')=>route.GET(new Request('https://edu.test/api/admin/lesson-block-reviews'+q));
 const post=(body,origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/admin/lesson-block-reviews',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)}));
 const body={submissionId:id,expectedStateId:id,requestId:id,decision:'approved',feedback:''};return{calls,permissions,get,post,body};
}
test('review route uses real member-review permission, authenticated actor and same-origin writes',async()=>{
 const anon=harness({user:null});assert.equal((await anon.get()).status,401);assert.equal(anon.calls.length,0);
 const forbidden=harness({allowed:false});assert.equal((await forbidden.get()).status,403);assert.equal(forbidden.calls.length,0);
 const h=harness();assert.equal((await h.post({...h.body,p_actor:'forged',userId:'forged'})).status,200);assert.equal(h.calls[0].args.p_actor,id);assert.equal(h.permissions[0].scope,'members');
 for(const origin of [null,'https://evil.test'])assert.equal((await h.post(h.body,origin)).status,403);
 assert.equal(h.calls.length,1);
});
test('review details remove quiz keys and cache is private; malformed decisions, query and oversized input never reach RPC',async()=>{
 const h=harness(),res=await h.get('?submission='+id);assert.equal(res.status,200);assert.doesNotMatch(await res.text(),/correctIndex/);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(res.headers.get('vary'),'Cookie');
 const bad=harness();for(const body of [null,{...bad.body,decision:'reopened'},{...bad.body,decision:'changes_requested',feedback:' '},{...bad.body,submissionId:'bad'}])assert.equal((await bad.post(body)).status,400);
 assert.equal((await bad.post({...bad.body,padding:'한'.repeat(5000)})).status,413);
 assert.equal((await bad.get('?page=0')).status,400);assert.equal((await bad.get('?state=forged')).status,400);assert.equal(bad.calls.length,0);
});
test('conflicts never return guessed success or raw database errors',async()=>{
 const stale=harness({error:{message:'BLOCK_REVIEW_CHANGED'}});assert.equal((await stale.post(stale.body)).status,409);
 const unknown=harness({error:{message:'private answer and credential'}});const res=await unknown.get();assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/private answer and credential/);
});
