import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const id='11111111-1111-4111-8111-111111111111';
function harness({user={id},allowed=true,error=null}={}){
 const calls=[],permissions=[],out={};
 const mocks={'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/.test(v)},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{cohortId:id,writeId:id,autoApproveThroughWeek:1},error};}})},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async(scope,actor)=>{permissions.push({scope,actor});return allowed?user:null;}}};
 new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../app/api/admin/lesson-progression/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>mocks[name]);
 const get=(cohort=id)=>out.GET(new Request('https://edu.test/api/admin/lesson-progression?cohort='+cohort));
 const post=(body,origin='https://edu.test')=>out.POST(new Request('https://edu.test/api/admin/lesson-progression',{method:'POST',headers:origin?{origin}:{},body:JSON.stringify(body)}));
 return{get,post,calls,permissions,body:{cohortId:id,requestId:id,expectedWriteId:null,autoApproveThroughWeek:1}};
}
test('progression settings require product permission and session actor, private reads and same-origin writes',async()=>{
 for(const [options,status] of [[{user:null},401],[{allowed:false},403]]){const h=harness(options);assert.equal((await h.get()).status,status);assert.equal(h.calls.length,0);}
 const h=harness();const res=await h.get();assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal(res.headers.get('vary'),'Cookie');
 await h.post({...h.body,p_actor:'forged'});assert.equal(h.calls[1].args.p_actor,id);assert.equal(h.permissions[0].scope,'products');
 for(const origin of [null,'https://evil.test'])assert.equal((await h.post(h.body,origin)).status,403);assert.equal(h.calls.length,2);
});
test('bounded weeks, IDs and actual multibyte bytes are checked before any database mutation',async()=>{
 const h=harness();for(const body of [null,{}, {...h.body,autoApproveThroughWeek:0},{...h.body,autoApproveThroughWeek:7},{...h.body,autoApproveThroughWeek:1.5},{...h.body,autoApproveThroughWeek:'1'},{...h.body,requestId:'bad'}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post({...h.body,padding:'한'.repeat(1500)})).status,413);assert.equal((await h.get('bad')).status,400);assert.equal(h.calls.length,0);
 assert.equal((await h.post({...h.body,autoApproveThroughWeek:null})).status,200);assert.equal(h.calls[0].args.p_week,null);
});
test('concurrent changes and retries are explicit conflicts; unknown errors do not leak private content',async()=>{
 for(const message of ['BLOCK_REQUEST_REUSED','BLOCK_DRAFT_CHANGED']){const h=harness({error:{message}});assert.equal((await h.post(h.body)).status,409);}
 const h=harness({error:{message:'private connection secret'}}),res=await h.get();assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/private connection secret/);
});
