import test from 'node:test';
import assert from 'node:assert/strict';
import { adControls as a, contract, compileExport, logic, emptySource } from './helpers/edu-export.mjs';
const now = new Date('2026-11-04T03:00:00Z');
const policy = {cohort_id:'11111111-1111-4111-8111-111111111111',enabled:true,budget_krw:24000000,ads_start:'2026-10-19',ads_end:'2026-11-05',sales_end:'2026-11-08',mode:'auto',reason:'대표 검토 완료',override_until:null,updated_at:'2026-11-03T03:00:00Z',revision:1};
const fixture = () => ({date_kst:'2026-11-04',cohort_id:policy.cohort_id,cohort_code:'moonshot:5',policy:{...policy},spend_krw:100000,cpr_today:4501,cpr_previous:4501,net_krw:500000,reserve_krw:null,refund_requests:0});
test('E5 thresholds are strict and unknown values never become zero',()=>{
 let e=fixture(); assert.deepEqual(a.evaluateAdControl(e,now).freeze_reasons,['cpr_high']);
 e.cpr_previous=4500; assert.equal(a.evaluateAdControl(e,now).freeze,false);
 e.cpr_today=null; assert.deepEqual(a.evaluateAdControl(e,now).freeze_reasons,['input_missing']);
 e=fixture(); e.date_kst='2026-11-09'; const after=new Date('2026-11-09T03:00:00Z');
 assert.deepEqual(a.evaluateAdControl(e,after).freeze_reasons,['input_missing']);
 e.net_krw=400000; assert.deepEqual(a.evaluateAdControl(e,after).freeze_reasons,['input_missing','mer_provisional_low']);e.net_krw=500000;
 e.reserve_krw=0; assert.equal(a.evaluateAdControl(e,after).freeze,false);
 e.net_krw=499999; e.refund_requests=5;
 assert.deepEqual(a.evaluateAdControl(e,after).freeze_reasons,['mer_provisional_low','refund_requests_high']);
 e.spend_krw=0; assert.ok(a.evaluateAdControl(e,after).freeze_reasons.includes('input_missing'));
});
test('E5 representative override preserves automatic reasons, expires exactly and cannot rewrite history',()=>{
 const e=fixture(); e.policy.mode='release';e.policy.override_until='2026-11-06T03:00:00Z';
 assert.deepEqual(a.evaluateAdControl(e,now),{freeze:false,freeze_source:'manual',freeze_reasons:['cpr_high'],override_until:new Date(e.policy.override_until).toISOString(),cohort_code:'moonshot:5',cohort_budget_krw:24000000});
 assert.equal(a.evaluateAdControl(e,new Date(e.policy.override_until)).freeze_source,'auto');
 e.policy.updated_at='2026-11-05T03:00:00Z';assert.equal(a.evaluateAdControl(e,now).freeze_source,'auto');
 e.policy.updated_at=policy.updated_at;e.policy.override_until='2026-11-06T03:00:00.001Z';assert.equal(a.evaluateAdControl(e,now).freeze_source,'auto');
 e.policy.mode='freeze';e.policy.override_until='2026-11-06T03:00:00Z';e.cpr_today=2000;e.cpr_previous=2000;
 assert.deepEqual(a.evaluateAdControl(e,now).freeze_reasons,['manual']);
});
test('E5 exports only contracted control fields; ambiguous or absent cohorts fail closed',()=>{
 const e=fixture();e.policy.mode='release';e.policy.override_until='2026-11-06T03:00:00Z';e.policy.reason='private staff reason not exported';
 const source={...emptySource(),ad_controls:[e]};
 const result=logic.aggregateExport('ops_daily',source,['2026-11-04'],now);
 assert.equal(contract.validExport('ops_daily',result),true);assert.equal(result.rows[0].controls.freeze,false);
 assert.ok(!JSON.stringify(result).includes('private staff'));assert.ok(!JSON.stringify(result).includes(policy.cohort_id));
 source.ad_controls.push({...e,cohort_id:'22222222-2222-4222-8222-222222222222'});
 assert.deepEqual(logic.aggregateExport('ops_daily',source,['2026-11-04'],now).rows[0].controls,a.missingControl());
 assert.equal(a.exportedAdControl([], '2026-11-04', now).freeze,true);
 assert.equal(logic.aggregateExport('ops_daily',emptySource(),['2026-11-04'],now).rows[0].controls,null);
});
test('E5 accepts exact dates, required reason and 1–72 hours; representative is distinct from admin',()=>{
 const good={...policy,hours:72,revision:0};assert.equal(a.validateAdPolicy(good).hours,72);
 for(const delta of [{hours:73},{hours:0},{reason:' '},{ads_start:'2026-02-30'},{ads_end:'2026-10-18'},{budget_krw:0},{revision:-1},{enabled:'true'},{mode:'unknown'}]) assert.throws(()=>a.validateAdPolicy({...good,...delta}));
 assert.equal(a.isAdControlApprover(policy.cohort_id,undefined),false);
 assert.equal(a.isAdControlApprover(policy.cohort_id,policy.cohort_id),true);
 assert.equal(a.isAdControlApprover(policy.cohort_id,'22222222-2222-4222-8222-222222222222'),false);
});
test('E5 admin route refuses ordinary admins, cross origin, disabled state and stale revision without leaking errors',async()=>{
 const prior={enabled:process.env.EDU_AD_CONTROLS_ENABLED,ids:process.env.EDU_AD_CONTROL_APPROVER_IDS};let calls=0,user={id:policy.cohort_id};let result={error:null,data:policy};
 const route=compileExport('app/api/admin/ad-controls/route.ts',{'@/lib/server-auth':{getAdminUser:async()=>user},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:()=>{calls++;return{abortSignal:async()=>result}}})},'@/lib/edu-export-contract':contract,'@/lib/edu-ad-controls':a});
 const request=(origin='https://edu.example',delta={})=>new Request('https://edu.example/api/admin/ad-controls',{method:'PUT',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...policy,hours:72,...delta})});
 try{
 process.env.EDU_AD_CONTROLS_ENABLED='true';delete process.env.EDU_AD_CONTROL_APPROVER_IDS;
 assert.equal((await route.PUT(request())).status,403);assert.equal(calls,0);
 process.env.EDU_AD_CONTROL_APPROVER_IDS=policy.cohort_id;
 assert.equal((await route.PUT(request('https://attacker.example'))).status,403);
 process.env.EDU_AD_CONTROLS_ENABLED='false';assert.equal((await route.PUT(request())).status,503);assert.equal(calls,0);
 process.env.EDU_AD_CONTROLS_ENABLED='true';assert.equal((await route.PUT(request(undefined,{hours:73}))).status,400);
 result={error:{message:'AD_CONTROL_CHANGED private reason'}};assert.equal((await route.PUT(request())).status,409);
 result={error:{message:'secret token database error'}};const r=await route.PUT(request());assert.equal(r.status,503);assert.ok(!JSON.stringify(await r.json()).includes('secret'));assert.equal(r.headers.get('cache-control'),'private, no-store');
 result={error:null,data:policy};assert.equal((await route.PUT(request())).status,200);
 user=null;assert.equal((await route.GET()).status,403);
 }finally{for(const[key,value]of[['EDU_AD_CONTROLS_ENABLED',prior.enabled],['EDU_AD_CONTROL_APPROVER_IDS',prior.ids]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
