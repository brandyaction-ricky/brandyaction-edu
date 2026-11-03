import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import ts from 'typescript';

function route(file,mocks) {
  const exports={};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',code)(exports,name=>{if(!mocks[name])throw Error('Unmocked dependency '+name);return mocks[name];});
  return exports;
}
const requestId='00000000-0000-4000-8000-000000000007',actor='00000000-0000-4000-8000-000000000002';
const url='https://brandyaction-edu-dev.vercel.app/api/admin/member-erasure';
const input=(body,origin=new URL(url).origin)=>new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
function admin(user,rpc){return route('app/api/admin/member-erasure/route.ts',{
  '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc})},
  '@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)},
});}
test('erasure records and retries require active administrator identity and same origin',async()=>{
  for(const [user,status] of [[null,401],[{role:'staff'},403],[{role:'student'},403]]) {
    const api=admin(user,()=>{throw Error('Must not open DB');});
    assert.equal((await api.GET()).status,status);
    assert.equal((await api.POST(input({requestId}))).status,status);
  }
  const api=admin({id:actor,role:'admin'},()=>{throw Error('Must not open DB');});
  assert.equal((await api.POST(input({requestId},'https://evil.test'))).status,403);
});
test('disabled erasure has no retry side effects; enabled retry uses only stored requestId and server actor',async t=>{
  const before=process.env.EDU_DIAGNOSIS_ERASURE_ENABLED;t.after(()=>{if(before===undefined)delete process.env.EDU_DIAGNOSIS_ERASURE_ENABLED;else process.env.EDU_DIAGNOSIS_ERASURE_ENABLED=before;});
  const calls=[];const api=admin({id:actor,role:'admin'},async(name,args)=>{calls.push([name,args]);return{data:[],error:null};});
  delete process.env.EDU_DIAGNOSIS_ERASURE_ENABLED;assert.equal((await api.POST(input({requestId}))).status,409);assert.equal(calls.length,0);
  process.env.EDU_DIAGNOSIS_ERASURE_ENABLED='true';
  for(const body of [{requestId,subject:actor},{requestId,environment:'production'},{requestId:'bad'},'[]','invalid'])assert.equal((await api.POST(input(body))).status,400);
  assert.equal((await api.POST(input('x'.repeat(1025)))).status,413);assert.equal(calls.length,0);
  assert.equal((await api.POST(input({requestId}))).status,202);
  assert.deepEqual(calls,[['edu_retry_member_erasure',{p_actor:actor,p_request:requestId}]]);
});
test('records fail closed and never expose SQL failures',async()=>{
  for(const value of [{data:null,error:null},{data:null,error:{message:'secret SQL'}}]){
    const api=admin({id:actor,role:'admin'},async()=>value);const res=await api.GET();assert.equal(res.status,503);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(await res.text(),/secret SQL/);
  }
});
test('HEAD and unauthorized cron requests never run a deletion worker',async t=>{
  const before=process.env.CRON_SECRET;t.after(()=>{if(before===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=before;});
  process.env.CRON_SECRET='synthetic-test-secret';let runs=0;
  const api=route('app/api/cron/member-erasure/route.ts',{'node:crypto':{timingSafeEqual},'@/lib/member-erasure':{dispatchMemberErasure:async()=>{runs++;return{processed:0};}}});
  assert.equal((await api.HEAD()).status,405);
  assert.equal((await api.GET(new Request(url))).status,401);assert.equal(runs,0);
  assert.equal((await api.GET(new Request(url,{headers:{authorization:'Bearer synthetic-test-secret'}}))).status,200);assert.equal(runs,1);
});
