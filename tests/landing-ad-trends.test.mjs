import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => name.startsWith('.') ? load(path.join(path.dirname(file), name) + '.ts') : require(name));
  return exports;
}
const { aggregateAdDays, summarizeAdDays, adMetric } = load('lib/landing-ad-trends.ts');
const { readAdTrend } = load('lib/landing-ad-trends-server.ts');
const row = (overrides = {}) => ({day:'2026-11-01',spend:100,impressions:1000,link_clicks:20,registrations:2,registration_available:true,...overrides});
const campaign = {id:'campaign',uses_ads:true,meta_campaign_ids:['123']};
const params = () => new URLSearchParams('start=2026-11-01&end=2026-11-03&compare_start=2026-10-29&compare_end=2026-10-31');
function dbWith(handler) {
  const calls = [];
  return {calls,from(table){const steps=[];calls.push({table,steps});const q=new Proxy({}, {get(_,key){if(key==='then')return(resolve,reject)=>Promise.resolve(handler(steps)).then(resolve,reject);return(...args)=>{steps.push([key,...args]);return q;};}});return q;}};
}
test('daily and period costs use summed numerators and denominators, not mean ratios',()=>{
  const days=aggregateAdDays([row(),row({spend:900,registrations:8}),row({day:'2026-11-03',spend:100,registrations:1})]);
  assert.equal(days.length,2);assert.equal(adMetric(days[0],'cpa'),100);
  assert.equal(adMetric(summarizeAdDays(days),'cpa'),100);
  assert.equal(adMetric(days[0],'ctr'),2);assert.equal(adMetric(days[0],'cpm'),500);
});
test('true zero is distinct from no record and zero denominator',()=>{
  const days=aggregateAdDays([row({spend:0,impressions:0,link_clicks:0,registrations:0})]);
  assert.equal(days[0].registrations,0);assert.equal(adMetric(days[0],'cpa'),null);assert.equal(adMetric(days[0],'ctr'),null);assert.equal(adMetric(days[0],'cpm'),null);assert.equal(summarizeAdDays([]),null);
});
test('mixed missing and legacy registration rows withhold daily and period totals regardless of order',()=>{
  for(const flag of [false,null])for(const reverse of [false,true]){
    const raw=[row(),row({registration_available:flag})];if(reverse)raw.reverse();
    const days=aggregateAdDays(raw);assert.equal(days[0].registrations,null);assert.equal(days[0].registration_state,flag===false?'missing':'unknown');assert.equal(adMetric(days[0],'cpa'),null);assert.equal(summarizeAdDays([...days,...aggregateAdDays([row({day:'2026-11-02'})])]).registrations,null);
  }
});
test('invalid numeric values are rejected rather than rendered as zero or NaN',()=>{
  for(const value of [null,NaN,-1,Infinity,'invalid'])assert.throws(()=>aggregateAdDays([row({spend:value})]));
});
test('paginated read scopes linked campaign IDs, retains comparison and never exposes ad identifiers',async()=>{
  const db=dbWith(steps=>({data:steps.find(s=>s[0]==='range')[1]===0?Array.from({length:1000},()=>row()):[row({day:'2026-10-30'})],error:null}));
  const result=await readAdTrend(db,campaign,params(),new AbortController().signal);
  assert.equal(result.state,'ready');assert.equal(result.current[0].spend,100000);assert.equal(result.previous[0].spend,100);assert.equal(db.calls.length,2);
  for(const {steps} of db.calls){assert.deepEqual(steps.find(s=>s[0]==='eq'),['eq','campaign_id','campaign']);assert.deepEqual(steps.find(s=>s[0]==='in'),['in','meta_campaign_id',['123']]);assert.deepEqual(steps.filter(s=>s[0]==='order').map(s=>s[1]),['day','meta_ad_id']);assert.deepEqual(steps.find(s=>s[0]==='gte'),['gte','day','2026-10-29']);assert.deepEqual(steps.find(s=>s[0]==='lte'),['lte','day','2026-11-03']);}
  assert.doesNotMatch(JSON.stringify(result),/meta_ad_id|campaign_id/);
});
test('failed later page discards all partial totals and does not disclose provider error',async()=>{
  const db=dbWith(steps=>steps.find(s=>s[0]==='range')[1]===0?{data:Array.from({length:1000},()=>row()),error:null}:{data:null,error:'private provider response'});
  assert.deepEqual(await readAdTrend(db,campaign,params(),new AbortController().signal),{state:'error',current:[],previous:[]});
});
test('bounded read rejects overflow instead of presenting partial totals',async()=>{
  const db=dbWith(()=>({data:Array.from({length:1000},()=>row()),error:null}));
  assert.equal((await readAdTrend(db,campaign,params(),new AbortController().signal)).state,'error');assert.equal(db.calls.length,51);
});
test('every unsupported detailed filter suppresses the campaign-wide trend before querying',async()=>{
  const db=dbWith(()=>{throw Error('should not read');});
  for(const key of ['utm_campaign','ad_type','adset','creative','device','layout']){const p=params();p.append(key,'one');assert.equal((await readAdTrend(db,campaign,p,new AbortController().signal)).state,'filtered');}
  assert.equal((await readAdTrend(db,{...campaign,uses_ads:false},params(),new AbortController().signal)).state,'unlinked');assert.equal(db.calls.length,0);
});
test('empty and noncontiguous source days stay empty and never imply zero activity',async()=>{
  const db=dbWith(()=>({data:[row(),row({day:'2026-11-03'})],error:null}));
  const result=await readAdTrend(db,campaign,params(),new AbortController().signal);assert.deepEqual(result.current.map(r=>r.day),['2026-11-01','2026-11-03']);assert.deepEqual(result.previous,[]);
});
