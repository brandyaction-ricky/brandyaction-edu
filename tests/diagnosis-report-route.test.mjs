import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const audience = {};
new Function('exports','process',ts.transpileModule(readFileSync(new URL('../lib/diagnosis-audience.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(audience,{env:{}});
const actor={role:'admin',id:'00000000-0000-4000-8000-000000000001'};
const source=ts.transpileModule(readFileSync(new URL('../app/api/platform/diagnosis/report/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class BridgeError extends Error{constructor(code,status){super(code);this.code=code;this.status=status;}}
function fixture({enabled=true,sessions=true,reports=true,user=actor,error=null}={}){
  const route={},calls=[];
  const mocks={'@/lib/diagnosis-ready-push':{diagnosisReadyPushEnabled:()=>false},'@/lib/diagnosis-audience':audience,'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:null,error:null})})},
    '@/lib/diagnosis-bridge':{DiagnosisBridgeError:BridgeError},'@/lib/diagnosis-report':{sendDiagnosisReportCommand:()=>{}},
    '@/lib/diagnosis-report-service':{runDiagnosisReport:async(deps,action)=>{calls.push({actor:deps.actor,action});if(error)throw error;return{state:'ready',updatedAt:'2026-10-01T00:00:00Z',canRetry:false,downloadAvailable:true,...(action==='download'?{markdown:'# 합성 N6 결과'}:action==='html'?{html:'<!doctype html><h1>원본 정밀 보고서</h1>'}:{})};}}};
  new Function('exports','require','process',source)(route,n=>mocks[n],{env:{EDU_MYIN_DIAGNOSIS_ENABLED:String(enabled),EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED:String(sessions),EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED:String(reports)}});
  return{calls,get:(query='')=>route.GET(new Request('https://edu.test/api/platform/diagnosis/report'+query))};
}
test('report APIs are dark until all three flags and authentication are present',async()=>{
  for(const config of [{enabled:false},{sessions:false},{reports:false},{user:null}]){const h=fixture(config);assert.equal((await h.get()).status,config.user===null?401:404);assert.equal(h.calls.length,0);}
});
test('status, safe preview and fixed-name MD attachment are private and non-sniffable',async()=>{
  const h=fixture();for(const query of ['','?preview=1','?download=1']){const r=await h.get(query);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vary'),'Cookie');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('x-robots-tag'),/noindex/);
    if(query==='?download=1'){assert.equal(r.headers.get('content-type'),'text/markdown; charset=utf-8');assert.match(r.headers.get('content-disposition'),/^attachment; filename="N6-report.md";/);assert.ok(r.headers.get('content-disposition').includes(encodeURIComponent('N6-검사결과.md')));assert.equal(await r.text(),'# 합성 N6 결과');}
    else assert.equal((await r.json()).markdown,query?'# 합성 N6 결과':undefined);
  }
  assert.deepEqual(h.calls.map(c=>c.action),['status','download','download']);assert.ok(h.calls.every(c=>c.actor===actor));
});
test('caller identifiers, duplicate modes, and malformed modes are refused',async()=>{
  const h=fixture();for(const q of ['?subject=other','?download=0','?preview=1&download=1','?download=1&download=1','?preview=1&reportId=other','?html=0','?html=1&download=1','?html=1&html=1','?html=1&subject=other'])assert.equal((await h.get(q)).status,400);assert.equal(h.calls.length,0);
});
test('original HTML is private, downloadable, and sandboxed without changing the issued bytes',async()=>{
  const h=fixture(),r=await h.get('?html=1');assert.equal(r.status,200);
  assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('vary'),'Cookie');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.match(r.headers.get('content-disposition'),/^attachment; filename="N6-report.html";/);assert.ok(r.headers.get('content-disposition').includes(encodeURIComponent('N6-정밀보고서.html')));
  assert.match(r.headers.get('content-security-policy'),/sandbox;.*script-src 'none'.*connect-src 'none'/);
  assert.equal(await r.text(),'<!doctype html><h1>원본 정밀 보고서</h1>');assert.equal(h.calls[0].action,'html');
});
test('revoked or unready reports return safe Korean messages, not backend details',async()=>{
  for(const error of [new BridgeError('FORBIDDEN',403),new BridgeError('NOT_READY',409),Error('secret answer storage path')]){const r=await fixture({error}).get('?download=1');assert.equal(r.status,error.status??503);assert.doesNotMatch(await r.text(),/secret|storage path/);assert.equal(r.headers.get('content-disposition'),null);}
});

test('student and staff cannot get report status, HTML or Markdown',async()=>{for(const role of ['student','staff',undefined]){const h=fixture({user:{...actor,role}});for(const query of ['', '?html=1','?download=1','?preview=1'])assert.equal((await h.get(query)).status,403);assert.equal(h.calls.length,0);}});
