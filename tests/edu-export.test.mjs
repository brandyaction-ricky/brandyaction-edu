import test from 'node:test'; import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { contract, logic, schema, compileExport, emptySource } from './helpers/edu-export.mjs';
const now = new Date('2026-10-21T03:00:00Z'), days = ['2026-10-20','2026-10-21'];
const hash = value => createHash('sha256').update(value).digest('hex');
const envelope = (dataset,source=emptySource()) => logic.aggregateExport(dataset,source,days,now);
test('contract calendar is exact, KST inclusive, at most 31 days and rejects duplicate/future/invalid dates',()=>{
  for(const [a,b] of [['2026-02-30','2026-03-01'],['2026-10-22','2026-10-22'],['2026-10-21','2026-10-20'],['2026-09-20','2026-10-21'],['26-10-01','2026-10-21']]) assert.equal(contract.exportRange(a,b,now),null);
  assert.equal(contract.exportRange('2026-09-21','2026-10-21',now).length,31);
  assert.deepEqual(contract.exportRange('2026-10-21','2026-10-21',new Date('2026-10-20T15:00:00Z')),['2026-10-21']);
});
test('all contracts reject extra properties, forbidden case-insensitive keys and values recursively including array strings',()=>{
  for(const ds of ['daily_totals','daily_campaign_perf','ops_daily']) assert.equal(contract.validExport(ds,envelope(ds)),true,ds);
  const change={tenant:'brandyaction_edu',contract_version:'1.0',metric_version:'edu_web@1',generated_at:now.toISOString(),rows:[]};
  assert.equal(contract.validExport('ad_changes',change),true);
  const valid=envelope('ops_daily'); assert.equal(contract.validExport('ops_daily',{...valid,email:'hidden'}),false);
  for(const key of schema['x-contract-tests'].forbidden_keys) assert.equal(contract.exportPrivacySafe({nested:[{[key.toUpperCase()]:'x'}]}),false,key);
  for(const value of ['person@example.test','010-1234-5678','https://private.test','aBcDefGHiJklMnO1234567890abcdefGHij','11111111-1111-4111-8111-111111111111']) assert.equal(contract.exportPrivacySafe({nested:[value]}),false,value);
  assert.equal(contract.exportPrivacySafe({net_vat_incl_total:3,meta_id:'123456789123456789'}),true);
  assert.equal(contract.exportPrivacySafe({orders:Number.MAX_SAFE_INTEGER+1}),false);
  function propertyKeys(node){if(!node||typeof node!=='object')return;for(const [key,value] of Object.entries(node)){if(key==='properties')for(const field of Object.keys(value))assert.equal(schema['x-contract-tests'].forbidden_keys.includes(field.toLowerCase()),false,field);propertyKeys(value);}}
  propertyKeys(schema);
});
test('zero/null meaning, date coverage, matured boundaries and future controls fail closed',()=>{
  const s=emptySource(); const total=envelope('daily_totals',s); assert.deepEqual(total.rows.map(r=>r.date_kst),days);
  for(const r of total.rows){ assert.equal(r.orders,0);assert.equal(r.funnel.practice_submitted,null);assert.equal(r.funnel.product_viewed,null);assert.equal(r.refund_reserve_krw,0);assert.equal(r.matured,false); }
  const ops=logic.aggregateExport('ops_daily',s,['2026-10-13','2026-10-14'],now);
  assert.deepEqual(ops.rows.map(r=>r.matured),[true,false]);assert.equal(ops.rows[0].controls,null);
  const pre=logic.aggregateExport('daily_totals',s,['2026-10-03'],now).rows[0];
  assert.equal(pre.funnel.lesson_started,null);assert.equal(pre.consent_pool.marketing_email,null);
});
test('deduplicated ad funnel, paid cohort revenue and historical operations preserve grains and sum identities',()=>{
  const s=emptySource();
  s.cohorts=[{id:'c',course_code:'moonshot',cohort_code:'4',slug:'moonshot',operation_start_at:'2026-10-20T00:00:00+09:00',operation_end_at:'2026-10-14T12:00:00Z'}];
  s.orders=[{id:'o',user_id:'u',status:'partially_refunded',created_at:'2026-10-20T01:00:00Z',paid_at:'2026-10-20T01:00:00Z',entry_src:'paid',first_paid_order_id:'o'}];
  s.items=[{id:'i',order_id:'o',cohort_id:'c'}];s.payments=[{id:'p',order_id:'o',approved_amount:10000,cancelled_amount:2000}];s.refunds=[{payment_id:'p',amount:2000,completed_at:'2026-10-21T01:00:00Z'}];
  s.campaigns=[{id:'ca',landing_id:'l',utm_campaign:'launch',uses_ads:true,paid_cohort_id:'c',start_day:'2026-10-01',end_day:'2026-10-30'}];
  s.dimensions=[{campaign_id:'ca',adset_key:'set',creative_key:'asset',ad_type:'cold',meta_ad_id:'321',meta_adset_id:'123'}];
  s.meta=[{campaign_id:'ca',day:'2026-10-20',meta_ad_id:'321',meta_campaign_id:'999'}];
  s.funnel=['view_page','view_page','click_cta','click_cta'].map(event_type=>({created_at:'2026-10-20T01:00:00Z',landing_id:'l',session_id:'s',event_type,utm_campaign:'launch',utm_term:'set',utm_content:'asset'}));
  s.clicks=[{created_at:'2026-10-20T01:00:00Z',channel:'paid',paid_cohort_id:'c'}];
  s.enrollments=[{id:'e',user_id:'u',cohort_id:'c',created_at:'2026-10-20T01:00:00Z',access_starts_at:'2026-10-20T01:00:00Z',access_ends_at:'2026-11-20T01:00:00Z'}];
  s.catalog=[{enrollment_id:'e',item_type:'vod_complete',item_id:'one'},{enrollment_id:'e',item_type:'live_join',item_id:'two'}];
  s.usage=[{enrollment_id:'e',item_type:'vod_complete',item_id:'one',first_used_at:'2026-10-20T01:00:00Z'}];
  s.visits=[{user_id:'u',first_seen_at:'2026-10-21T01:00:00Z'}];
  s.questions=[{created_at:'2026-10-20T01:00:00Z',archived_at:null,answer_times:[{created_at:'2026-10-21T01:00:00Z',deleted_at:null}]}];
  s.actuals=[{campaign_id:'ca',day:'2026-10-19',kakao_members:10},{campaign_id:'ca',day:'2026-10-20',kakao_members:13}];
  const tt=envelope('daily_totals',s), cc=envelope('daily_campaign_perf',s), op=envelope('ops_daily',s);
  for(const [ds,resp] of [['daily_totals',tt],['daily_campaign_perf',cc],['ops_daily',op]])assert.equal(contract.validExport(ds,resp),true,ds);
  const t=tt.rows.find(r=>r.cohort_code==='moonshot:4'&&r.date_kst==='2026-10-20');
  assert.equal(t.net_vat_incl_total,8000);assert.equal(Object.values(t.net_vat_incl_by_src).reduce((a,b)=>a+b),8000);
  assert.equal(t.orders,t.funnel.payment_completed);assert.equal(t.new_buyers,1);assert.equal(t.matured,false);
  assert.equal(t.funnel.usage_50,1);assert.equal(t.funnel.chat_joined_manual,3);
  assert.equal(tt.rows.find(r=>r.date_kst==='2026-10-21'&&r.cohort_code).funnel.week1_active,1);
  const ad=cc.rows.find(r=>r.revenue_grain==='ad'),cohort=cc.rows.find(r=>r.revenue_grain==='cohort');
  assert.equal(ad.landings,1);assert.equal(ad.chat_clicks,1);assert.equal(ad.net_vat_incl,null);assert.equal(cohort.net_vat_incl,t.net_vat_incl_by_src.paid);
  assert.equal(op.rows[0].refund_amount,0);assert.equal(op.rows[1].refund_amount,2000);
  assert.equal(op.rows[0].question_backlog_n,1);assert.equal(op.rows[1].question_backlog_n,0);
  assert.equal(op.rows[1].usage_below_50_n,0);
  s.payments[0].cancelled_amount=0;assert.throws(()=>envelope('daily_totals',s),/LEDGER_MISMATCH/);
});
test('consent uses latest purpose AND channel events at day end, not legacy consent or next-day choices',()=>{
  const s=emptySource();s.consent=[
    {member_id:'u',kind:'marketingUse',action:'consent',occurred_at:'2026-10-20T01:00:00Z'},
    {member_id:'u',kind:'email',action:'consent',occurred_at:'2026-10-20T01:00:00Z'},
    {member_id:'u',kind:'email',action:'withdrawal',occurred_at:'2026-10-21T01:00:00Z'}];
  const rows=envelope('daily_totals',s).rows;assert.equal(rows[0].consent_pool.marketing_email,1);assert.equal(rows[1].consent_pool.marketing_email,0);
  s.consentEnabled=false;assert.equal(envelope('daily_totals',s).rows[0].consent_pool.marketing_email,null);
});
function harness(){
  let config={enabled:true,tokenHash:hash('edu-test-token')},gate='ok',data=emptySource(),failure=false;const calls=[];
  const chain=value=>({abortSignal:async()=>{if(failure)throw Error('database private detail');return value;}});
  const db={from:()=>({select:()=>({eq:()=>({eq:()=>({abortSignal:()=>({maybeSingle:async()=>{if(failure)throw Error('database private detail');return{data:{value:config},error:null};}})})})})}),
    rpc:(fn,args)=>{calls.push([fn,args]);return chain({data:fn==='edu_export_v1_gate'?gate:data,error:null});}};
  const route=compileExport('app/api/internal/export/v1/[dataset]/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/edu-export-contract':contract,'@/lib/edu-export':logic});
  return{calls,setConfig:v=>config=v,setGate:v=>gate=v,setData:v=>data=v,breakDb:()=>failure=true,
    get:(dataset='daily_totals',token='edu-test-token',query='from=2026-10-01&to=2026-10-02')=>route.GET(new Request('https://edu.test/api/internal/export/v1/'+dataset+'?'+query,{headers:token?{authorization:'Bearer '+token}:{}}),{params:Promise.resolve({dataset})})};
}
test('API re-reads kill switch and hash, separates MYIN, returns only short errors and no-store headers',async()=>{
  const h=harness();let r=await h.get();assert.equal(r.status,200);assert.equal((await r.json()).tenant,'brandyaction_edu');
  for(const token of [null,'MYIN-token'])assert.equal((await h.get('daily_totals',token)).status,401);
  h.setConfig({enabled:false});assert.equal((await h.get('daily_totals',null)).status,503);
  h.setConfig({enabled:true});assert.equal((await h.get()).status,401);
  h.setConfig({enabled:true,tokenHash:hash('edu-test-token')});assert.equal((await h.get()).status,200);
  h.setGate('rate_limited');assert.equal((await h.get()).status,429);
  h.setGate('disabled');assert.equal((await h.get()).status,503);h.setGate('unauthorized');assert.equal((await h.get()).status,401);h.setGate('ok');
  for(const ds of ['ad_changes','unknown'])assert.equal((await h.get(ds)).status,404);
  for(const query of ['from=2026-02-30&to=2026-03-01','from=2026-10-01&from=2026-10-02&to=2026-10-03'])assert.equal((await h.get('daily_totals','edu-test-token',query)).status,400);
  h.breakDb();r=await h.get();assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'unavailable'});
  assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-contract-version'),'1.0');
});
test('generic administrator save cannot rename or overwrite the server integration setting',async()=>{
  const mocks={
    '@/lib/server-auth':{getAuthenticatedUser:async()=>({id:'admin',role:'admin'})},
    '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>{throw Error('must not write database');}})},
    '@/lib/operator-permissions':{permissionsFor:async()=>({settings:true}),sectionScopes:{settings:'settings'}},
    '@/lib/platform':{sections:[{key:'settings',table:'site_settings',fields:[{key:'key',type:'text'},{key:'value',type:'text'}]}]},
    '@/lib/qa-rules':{archiveValues:{}}
  };
  const route=compileExport('app/api/platform/route.ts',new Proxy(mocks,{has:(target,key)=>key in target||String(key).startsWith('@/'),get:(target,key)=>target[key]||{}}));
  for(const values of [{key:'export_v1',value:{}},{key:'edu_renamed',value:{}}]){
    const r=await route.POST(new Request('https://edu.test/api/platform',{method:'POST',headers:{origin:'https://edu.test'},body:JSON.stringify({action:'save',section:'settings',id:'export_v1',values})}));
    assert.equal(r.status,403);assert.match((await r.json()).error,/서버 연동 설정/);
  }
});
