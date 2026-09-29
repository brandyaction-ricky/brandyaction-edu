import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as id} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {lessonImportContract} from '../scripts/lib/lesson-import-contract.mjs';
import {batchFor} from './helpers/lesson-import-fixture.mjs';
const contract=await lessonImportContract();
function harness({user={id:id()},error=null}={}){
 const calls=[],out={},route=readFileSync(new URL('../app/api/admin/lesson-curriculum-import/route.ts',import.meta.url),'utf8');
 new Function('exports','require',ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>({
  '@/lib/operator-permissions':{getOperatorUser:async permission=>{assert.equal(permission,'products');return user;}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:{requestId:args.p_request,applied:args.p_apply},error};}})},
  '@/lib/lesson-curriculum-import':contract
 })[name]);
 const body={action:'preview',requestId:id(),batch:batchFor(id())};
 return{body,calls,user,post:(body,origin='https://edu.test')=>out.POST(new Request('https://edu.test/api/admin/lesson-curriculum-import',{method:'POST',headers:origin?{origin}:{},body:typeof body==='string'?body:JSON.stringify(body)}))};
}
test('API checks product permission, origin, source acknowledgment and destination payload before RPC',async()=>{
 const h=harness();assert.equal((await h.post(h.body,null)).status,403);assert.equal(h.calls.length,0);const denied=harness({user:null});assert.equal((await denied.post(denied.body)).status,403);assert.equal(denied.calls.length,0);
 const preview=await h.post({...h.body,p_actor:'forged'});assert.equal(preview.status,200);assert.equal(preview.headers.get('cache-control'),'private, no-store');assert.equal(h.calls[0].args.p_actor,h.user.id);assert.equal(h.calls[0].args.p_apply,false);
 assert.equal((await h.post({...h.body,action:'apply'})).status,400);assert.equal((await h.post({...h.body,action:'apply',acknowledgeSource:true})).status,200);assert.equal(h.calls[1].args.p_apply,true);
});
test('invalid JSON, oversized bodies and malformed lessons cannot reach a DB write',async()=>{
 const h=harness();for(const body of ['{',null,{}, {...h.body,requestId:'invalid'},{...h.body,batch:{...h.body.batch,lessons:[]}}])assert.equal((await h.post(body)).status,400);
 assert.equal((await h.post(' '.repeat(contract.lessonImportLimit+1001))).status,413);assert.equal(h.calls.length,0);
});
test('destination conflicts are understandable and raw database content never leaks',async()=>{
 for(const [message,status] of [['IMPORT_MEDIA_CHANGED',409],['IMPORT_TARGET_CHANGED',409],['BLOCK_PROGRESSION_DUPLICATE',409],['BLOCK_FORBIDDEN',403],['private customer/quiz detail',503]]){const h=harness({error:{message}}),res=await h.post(h.body);assert.equal(res.status,status);assert.doesNotMatch(await res.text(),/private customer\/quiz detail/);}
});
