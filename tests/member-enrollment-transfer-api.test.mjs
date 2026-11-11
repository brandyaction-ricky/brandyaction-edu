import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const command={requestId:id(1),source:id(2),member:id(3),target:id(4),reason:'회원 요청 계정 이전',confirmed:true};
const url='https://edu.example.test/api/admin/member-enrollment-transfer';
const post=(body=command,origin='https://edu.example.test')=>new Request(url,{method:'POST',headers:{origin},body:typeof body==='string'?body:JSON.stringify(body)});
function api(user={id:id(5),role:'admin'},rpc=async()=>({data:{enrollmentId:id(6),targetMember:id(4)}}),db={}) {
 const exports={};
 const mocks={
  '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc,...db})},
  '@/lib/edu-workflows':{uuid:x=>typeof x==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x)}
 };
 new Function('exports','require',ts.transpileModule(readFileSync('app/api/admin/member-enrollment-transfer/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,key=>{if(!mocks[key])throw Error('Unmocked '+key);return mocks[key];});
 return exports;
}
test('transfer requires administrator identity, same origin, explicit confirmation and bounded exact fields',async()=>{
 for(const [user,status] of [[null,401],[{role:'student'},403],[{role:'staff'},403]]) {
  const routes=api(user,()=>{throw Error('Must not call DB');});
  assert.equal((await routes.POST(post())).status,status);assert.equal((await routes.GET(new Request(url))).status,status);
 }
 let calls=0;const routes=api(undefined,async(name,args)=>{calls++;assert.equal(name,'edu_transfer_enrollment');assert.deepEqual(args,{p_actor:id(5),p_request:id(1),p_source:id(2),p_member:id(3),p_target:id(4),p_reason:command.reason});return {data:{enrollmentId:id(6),targetMember:id(4)}};});
 assert.equal((await routes.POST(post(command,'https://evil.test'))).status,403);
 for(const value of [{...command,confirmed:false},{...command,actor:id(5)},{...command,target:command.member},{...command,reason:'x'},{...command,source:'bad'},[],null,'invalid'])assert.equal((await routes.POST(post(value))).status,400);
 assert.equal((await routes.POST(post('x'.repeat(4097)))).status,413);assert.equal(calls,0);
 const success=await routes.POST(post());assert.equal(success.status,200);assert.equal(success.headers.get('Cache-Control'),'private, no-store');assert.equal((await success.json()).ok,true);assert.equal(calls,1);
});
test('transfer exposes fixed conflicts only and leaves uncertain outcomes retryable with the same request',async()=>{
 for(const [message,status] of [['TRANSFER_TARGET_EXISTS',409],['TRANSFER_NOT_ACTIVE',409],['private SQL with sensitive content',503]]) {
  const response=await api(undefined,async()=>({error:{message}})).POST(post());
  assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/private SQL|sensitive content/);
 }
 assert.equal((await api(undefined,async()=>{throw Error('private token');}).POST(post())).status,503);
});
test('lookup is exact-email, active-student only, checks canonical login and rejects existing cohort history',async()=>{
 let selected=0,canonical='recipient@example.test',exists=false;
 const filters=[];
 const db={auth:{admin:{getUserById:async()=>({data:{user:{id:id(4),email:canonical}}})}},from:table=>{
  const query={};for(const method of ['select','eq','is','ilike','limit'])query[method]=(...args)=>{filters.push([table,method,...args]);return query;};
  const resolve=()=>table==='profiles'?{data:[{id:id(4),email:canonical,full_name:'받는 회원'}]}:selected++===0?{data:{cohort_id:id(9),status:'active',revoked_at:null,access_ends_at:null}}:{data:exists?[{id:id(10)}]:[]};
  query.maybeSingle=async()=>resolve();query.then=(yes,no)=>Promise.resolve(resolve()).then(yes,no);return query;
 }};
 const routes=api(undefined,undefined,db),request=()=>new Request(url+'?'+new URLSearchParams({member:id(3),source:id(2),email:'recipient@example.test'}));
 const response=await routes.GET(request());assert.equal(response.status,200);assert.deepEqual((await response.json()).target,{id:id(4),name:'받는 회원',email:canonical});
 assert.ok(filters.some(x=>JSON.stringify(x)===JSON.stringify(['profiles','ilike','email','recipient@example.test'])));
 assert.ok(filters.some(x=>JSON.stringify(x)===JSON.stringify(['profiles','eq','role','student'])));
 selected=0;canonical='changed@example.test';assert.equal((await routes.GET(request())).status,409);
 selected=0;canonical='recipient@example.test';exists=true;assert.equal((await routes.GET(request())).status,409);
});
