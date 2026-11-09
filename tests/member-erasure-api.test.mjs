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
const command={action:'execute',requestId,confirmation:requestId};
const input=(body,origin=new URL(url).origin)=>new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
function admin(user,rpc,worker=async()=>({processed:0})){return route('app/api/admin/member-erasure/route.ts',{
  '@/lib/member-erasure':{memberErasureReady:()=>process.env.EDU_DIAGNOSIS_ERASURE_ENABLED==='true',dispatchMemberErasure:worker},
  '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc})},
  '@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)},
});}
test('erasure records and retries require active administrator identity and same origin',async()=>{
  for(const [user,status] of [[null,401],[{role:'staff'},403],[{role:'student'},403]]) {
    const api=admin(user,()=>{throw Error('Must not open DB');});
    assert.equal((await api.GET()).status,status);
    assert.equal((await api.POST(input(command))).status,status);
  }
  const api=admin({id:actor,role:'admin'},()=>{throw Error('Must not open DB');});
  assert.equal((await api.POST(input({requestId},'https://evil.test'))).status,403);
});
test('disabled erasure has no retry side effects; enabled retry uses only stored requestId and server actor',async t=>{
  const before=process.env.EDU_DIAGNOSIS_ERASURE_ENABLED;t.after(()=>{if(before===undefined)delete process.env.EDU_DIAGNOSIS_ERASURE_ENABLED;else process.env.EDU_DIAGNOSIS_ERASURE_ENABLED=before;});
  const calls=[];const api=admin({id:actor,role:'admin'},async(name,args)=>{calls.push([name,args]);return{data:[],error:null};});
  delete process.env.EDU_DIAGNOSIS_ERASURE_ENABLED;assert.equal((await api.POST(input(command))).status,409);assert.equal(calls.length,0);
  process.env.EDU_DIAGNOSIS_ERASURE_ENABLED='true';
  for(const body of [{requestId},{...command,subject:actor},{...command,environment:'production'},{...command,confirmation:actor},{...command,requestId:'bad'},'[]','invalid'])assert.equal((await api.POST(input(body))).status,400);
  assert.equal((await api.POST(input('x'.repeat(1025)))).status,413);assert.equal(calls.length,0);
  assert.equal((await api.POST(input(command))).status,202);
  assert.deepEqual(calls,[['edu_approve_member_erasure',{p_actor:actor,p_request:requestId,p_environment:'dev'}]]);
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

test('saved approval remains accepted when scheduling fails; failed approval never dispatches',async t=>{
 const previous=process.env.EDU_DIAGNOSIS_ERASURE_ENABLED;process.env.EDU_DIAGNOSIS_ERASURE_ENABLED='true';t.after(()=>{if(previous===undefined)delete process.env.EDU_DIAGNOSIS_ERASURE_ENABLED;else process.env.EDU_DIAGNOSIS_ERASURE_ENABLED=previous;});
 let dispatches=0;
 const api=admin({id:actor,role:'admin'},async()=>({data:{state:'requested'},error:null}),async args=>{dispatches++;assert.deepEqual(args,{requestId});throw Error('private provider failure');});
 const response=await api.POST(input(command));assert.equal(response.status,202);assert.equal((await response.json()).ok,true);assert.equal(dispatches,1);
 const denied=admin({id:actor,role:'admin'},async()=>({data:null,error:{message:'private SQL'}}),async()=>{throw Error('Must not dispatch');});
 const failure=await denied.POST(input(command));assert.equal(failure.status,409);assert.doesNotMatch(await failure.text(),/private SQL/);
});
