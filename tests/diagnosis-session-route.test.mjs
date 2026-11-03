import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const audience = {};
new Function('exports','process',ts.transpileModule(readFileSync(new URL('../lib/diagnosis-audience.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(audience,{env:{}});
const actor = { role: 'admin', id: '00000000-0000-4000-8000-000000000001' };
const source = ts.transpileModule(readFileSync(new URL('../app/api/platform/diagnosis/session/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class BridgeError extends Error { constructor(code,status) { super(code);this.code=code;this.status=status; } }
function fixture({enabled=true,sessions=true,user=actor,error=null}={}) {
  const route={},calls=[];
  const mocks={
    '@/lib/diagnosis-audience':audience,'@/lib/server-auth':{getAuthenticatedUser:async()=>user},
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:null,error:null})})},
    '@/lib/diagnosis-bridge':{DiagnosisBridgeError:BridgeError,sendDiagnosisCommand:()=>{}},
    '@/lib/diagnosis-session-service':{runDiagnosisSession:async(deps,input)=>{calls.push({actor:deps.actor,input});if(error)throw error;return {state:'in_progress'};}},
  };
  new Function('exports','require','process',source)(route,n=>mocks[n],{env:{EDU_MYIN_DIAGNOSIS_ENABLED:String(enabled),EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED:String(sessions)}});
  return {calls,get:()=>route.GET(new Request('https://edu.test/api/platform/diagnosis/session?view=catalog')),
    post:(body='{"action":"save","revision":0,"answers":[]}',origin='https://edu.test')=>route.POST(new Request('https://edu.test/api/platform/diagnosis/session',{method:'POST',headers:origin?{origin}:{},body}))};
}
test('questionnaire API requires both rollout flags and a verified session before work',async()=>{
  for(const settings of [{enabled:false},{sessions:false},{user:null}]){const h=fixture(settings);const expected=settings.user===null?401:404;assert.equal((await h.get()).status,expected);assert.equal((await h.post()).status,expected);assert.equal(h.calls.length,0);}
});
test('writes reject a missing or foreign origin and oversized streaming bodies before work',async()=>{
  const h=fixture();for(const origin of [null,'https://other.test'])assert.equal((await h.post(undefined,origin)).status,403);
  assert.equal((await h.post('한'.repeat(90000))).status,413);assert.equal((await h.post('{')).status,400);assert.equal(h.calls.length,0);
});
test('catalog and commands use the authenticated actor with private uncacheable responses',async()=>{
  const h=fixture();const response=await h.get();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');assert.match(response.headers.get('x-robots-tag'),/noindex/);
  await h.post();assert.deepEqual(h.calls,[{actor,input:{action:'catalog'}},{actor,input:{action:'save',revision:0,answers:[]}}]);
});
test('bridge errors preserve recoverable states without leaking raw answers or internals',async()=>{
  for(const error of [new BridgeError('CONFLICT',409),new BridgeError('FORBIDDEN',403),Error('database secret raw answer')]){
    const h=fixture({error});const r=await h.post();assert.equal(r.status,error.status??503);assert.doesNotMatch(await r.text(),/database|secret|raw answer/);
  }
});

test('student and staff cannot read or mutate sessions',async()=>{for(const role of ['student','staff',undefined]){const h=fixture({user:{...actor,role}});assert.equal((await h.get()).status,403);assert.equal((await h.post()).status,403);assert.equal(h.calls.length,0);}});

test('release pause tells users new starts are temporarily unavailable while ongoing tests continue',async()=>{
 const h=fixture({error:new BridgeError('STARTS_PAUSED',503)}),response=await h.post();
 assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'STARTS_PAUSED');
 assert.match(body.error,/업데이트 중/);assert.match(body.error,/진행 중인 검사는 계속/);
});
