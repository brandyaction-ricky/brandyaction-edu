import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require=createRequire(import.meta.url);
function load(file,mocks={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,n=>{if(n in mocks)return mocks[n];if(n.endsWith('.css'))return{};if(n.startsWith('@/')||n.startsWith('.')){const b=n.startsWith('@/')?n.slice(2):path.join(path.dirname(file),n);return load(['.ts','.tsx'].map(e=>b+e).find(f=>fs.existsSync(f)),mocks);}return require(n);});return exports;}
const {PerformanceInsights,RevenueSummary}=load('app/ui/landing/performance-insights.tsx');
const revenue={state:'ready',cohort_id:'qa',cohort_label:'시험 4기',orders:2,new_orders:1,existing_orders:1,gross:1300,refunds:200,net:1100,spend:100,roas:1100,needs_review:0};
const version=(v,n=10,c=2)=>({layout_ver:v,created_at:'2026-09-15T00:00:00Z',note:`발행 ${v}`,sessions:n,cta_sessions:c,first_seen:null,last_seen:null,sections:[{section:'hero',reached:n,not_continued:2,avg_dwell_ms:100}]});
const insights={revenue,behavior:{sessions:4,measured_sessions:3,scroll:[{depth:0,reached:3,not_continued:2},{depth:100,reached:1,not_continued:null}],versions:[version(1),version(2,0,0)]}};
test('UI explains cohort scope and unknowns without fabricated winners or division by zero',()=>{
 const h=renderToStaticMarkup(React.createElement(PerformanceInsights,{insights}));
 for(const text of['기수 전체 매출','1,100','스크롤 도달과 이탈','미측정 1회','페이지 수정 전후 비교','한쪽 버전에 방문이 없어','표본 부족','선택한 기간·유입'])assert.ok(h.includes(text),text);
 assert.doesNotMatch(h,/NaN|Infinity/);
 for(const state of['unmapped','forbidden','review']){
  const h=renderToStaticMarkup(React.createElement(RevenueSummary,{revenue:{...revenue,state,net:null}}));
  assert.ok(!h.includes('1,100'));
 }
 const absent=renderToStaticMarkup(React.createElement(PerformanceInsights,{insights:{...insights,behavior:{sessions:10,measured_sessions:0,scroll:[],versions:[]}}}));assert.ok(absent.includes('스크롤 측정값이 없습니다'));assert.ok(absent.includes('두 번째 페이지 버전'));
});
test('financial fallback is suppressed and shared cohorts appear once in multiple page view',()=>{
 const {MultiSourceComparison,OperationsSummary}=load('app/ui/landing/performance-dashboard.tsx');
 const report={financial_mode:'orders',campaign:{id:'one',uses_ads:true},source_title:'페이지1',summary_b:{sessions:10,cta_click_sessions:2,spend:100},campaign_summary:{new_payments:100,existing_payments:20,revenue:9999999,spend:100,live_peak:2},actuals:[{revenue:9999999}],ui:{insights,period_actuals:{kakao_delta:1},errors:{}}};
 const h=renderToStaticMarkup(React.createElement(MultiSourceComparison,{reports:[report,{...report,source_title:'페이지2',campaign:{...report.campaign,id:'two'}}]}));
 assert.equal((h.match(/기수 전체 매출 · 주문 자동 집계/g)||[]).length,1);assert.ok(!h.includes('9,999,999'));
 const unknown=renderToStaticMarkup(React.createElement(OperationsSummary,{report:{...report,ui:{...report.ui,insights:{...insights,revenue:{...revenue,spend:null}}}}}));assert.doesNotMatch(unknown,/>0원</);
});
test('supplement passes authenticated actor and all active filters, failures retain unavailable state',async()=>{
 const {performanceUiDetails}=load('lib/landing-performance-ui-server.ts');
 let captured;const chain={then:(ok)=>Promise.resolve({data:[],error:null}).then(ok)};
 for(const m of['select','eq','gte','lt','in','or','order','range','abortSignal'])chain[m]=()=>chain;
 const db={from:()=>chain,rpc:(name,args)=>{captured={name,args};return{abortSignal:async()=>({data:insights,error:null})}}};
 const params=new URLSearchParams('start=2026-09-01&end=2026-09-30&creative=A+B&layout=2');
 const result=await performanceUiDetails(db,{id:'campaign',landing_id:'landing'},params,new AbortController().signal,'actor');
 assert.deepEqual(result.insights,insights);assert.equal(captured.args.p_actor,'actor');assert.deepEqual(captured.args.p_filters.creative,['A B']);
 db.rpc=()=>({abortSignal:async()=>({data:null,error:{message:'missing migration'}})});
 const failed=await performanceUiDetails(db,{id:'campaign',landing_id:'landing'},params,new AbortController().signal,'actor');assert.equal(failed.insights,null);assert.match(failed.errors.insights,/불러오지/);
});

test('production summary remains authoritative and avoids source session scans',async()=>{
 const {performanceUiDetails}=load('lib/landing-performance-ui-server.ts');
 const base={daily_a:[{day:'2026-09-01',sessions:123}],last_collected_at:'2026-09-15T00:00:00Z',actual_presence:{new_payments:true},period_actuals:{payments:7},previous_day_members:{},errors:{actuals:'existing warning'}};
 const db={from:()=>{throw Error('must reuse production summary, not scan source sessions');},rpc:()=>({abortSignal:async()=>({data:insights,error:null})})};
 const params=new URLSearchParams('start=2026-09-01&end=2026-09-30&ad_type=cold');
 const r=await performanceUiDetails(db,{id:'campaign',landing_id:'landing'},params,new AbortController().signal,'actor',base);
 assert.deepEqual(r.insights,insights);assert.deepEqual(r.daily_a,base.daily_a);assert.deepEqual(r.period_actuals,base.period_actuals);assert.equal(r.errors.actuals,'existing warning');
 db.rpc=()=>({abortSignal:async()=>({data:null,error:{message:'unavailable'}})});
 const failed=await performanceUiDetails(db,{id:'campaign',landing_id:'landing'},params,new AbortController().signal,'actor',base);assert.equal(failed.insights,null);assert.deepEqual(failed.daily_a,base.daily_a);assert.ok(failed.errors.insights);
});
