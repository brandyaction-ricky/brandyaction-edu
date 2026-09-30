import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',code)(exports,name=> {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file),name);
      return load(base+'.ts',mocks);
    }
    return require(name);
  });
  return exports;
}
const settings = load('lib/meta-campaign-settings.ts');
const idA='120000000000000001', idB='120000000000000003';
const campaign={id:'bbbbbbbb-bbbb-4000-8000-000000000002',landing_id:'aaaaaaaa-aaaa-4000-8000-000000000001',name:'Fixture campaign',utm_campaign:'fixture',start_day:'2026-09-01',end_day:'2036-09-01',new_customer_price:1200,existing_customer_price:900,live_peak:null,meta_ad_account_id:null,meta_campaign_id:null,meta_campaign_ids:[],meta_sync_status:'not_configured',meta_sync_error:null,updated_at:'2026-09-01T00:00:00.000Z'};
const commonAccount='act_123456789';
function setup({initial=campaign,role='admin',fetchRows=async()=>[],account=commonAccount,accountError=null}={}) {
  let row=structuredClone(initial), writes=0; const rpcCalls=[];
  const db={from(table){let patch=null,filters=[];const query={
    select(){return query},eq(key,value){filters.push([key,value]);return query},is(){return query},order(){return query},
    update(value){patch=value;return query},
    async maybeSingle(){return run(false)},async single(){return run(false)},then(resolve,reject){return Promise.resolve(run(true)).then(resolve,reject)}
  };function run(list){
    if(table==='site_settings')return{data:account==null?null:{value:{adAccountId:account}},error:accountError};
    if(table==='courses')return{data:[{id:row.landing_id,title:'Fixture',category:'free'}],error:null};
    if(table==='landing_configs')return{data:[],error:null};
    if(filters.some(([key,value])=>row[key]!==value))return{data:null,error:null};
    if(patch){row={...row,...patch};writes++;}
    return{data:list?[structuredClone(row)]:structuredClone(row),error:null};
  }return query;},async rpc(name,args){rpcCalls.push({name,args});return{data:name==='edu_marketing_dashboard'?{performance:[],summary_b:{spend:37.5}}:null,error:null}}};
  const mocks={'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/operator-permissions':{getOperatorUser:async()=>role?{role,id:null}:null},'@/lib/landing-performance-ui-server':{performanceUiDetails:async()=>null},'@/lib/meta-marketing':{fetchMetaCampaigns:fetchRows}};
  const api=load('app/api/landing/performance/route.ts',mocks), meta=load('app/api/landing/performance/meta/route.ts',mocks);
  const request=(values,origin='https://fixture.test')=>new Request('https://fixture.test/api/landing/performance',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'campaign',campaign_id:row.id,values})});
  return{api,meta,request,row:()=>row,writes:()=>writes,rpcCalls};
}
const values={name:'Saved fixture',utm_campaign:'saved-fixture',start_day:'2026-09-01',end_day:'2036-09-01',new_customer_price:0,existing_customer_price:900,live_peak:''};
test('numeric account normalization and multiple IDs preserve integer precision',()=>{
  assert.equal(settings.normalizeMetaAccountId(' 123456789 '),'act_123456789');
  assert.equal(settings.normalizeMetaAccountId('act_123456789'),'act_123456789');
  assert.deepEqual(settings.parseMetaCampaignIds(`${idA}\n${idB}, ${idA}`),[idA,idB]);
  assert.deepEqual(settings.metaCampaignIds({meta_campaign_id:idA}),[idA]);
  assert.deepEqual(settings.metaCampaignIds({meta_campaign_id:idA,meta_campaign_ids:[]}),[]);
  for(const value of [Number(idA),[Number(idA)],'12x',Array.from({length:21},(_,i)=>String(i))]) assert.throws(()=>settings.parseMetaCampaignIds(value));
  assert.throws(()=>settings.normalizeMetaAccountId('act_'));
});
test('settings save and fresh GET retain normalized IDs, all values and zero price',async()=>{
  const h=setup();const response=await h.api.POST(h.request({...values,meta_ad_account_id:'999999999',meta_campaign_ids:`${idA}\n${idB},${idA}`}));
  assert.equal(response.status,200);
  const saved=(await response.json()).campaign;
  assert.equal(saved.meta_ad_account_id,'act_123456789');assert.deepEqual(saved.meta_campaign_ids,[idA,idB]);assert.equal(saved.meta_campaign_id,idA);assert.equal(saved.meta_sync_status,'idle');
  const loaded=await (await h.api.GET(new Request('https://fixture.test/api/landing/performance'))).json();
  assert.deepEqual(loaded.courses[0].campaigns[0],saved);assert.equal(saved.new_customer_price,0);assert.equal(saved.existing_customer_price,900);assert.equal(saved.live_peak,null);assert.equal(saved.name,values.name);
});
test('basic settings save without common configuration; invalid campaign IDs preserve DB',async()=>{
  const h=setup({account:null});assert.equal((await h.api.POST(h.request({...values,meta_ad_account_id:'',meta_campaign_ids:[]}))).status,200);
  assert.equal(h.row().meta_sync_status,'not_configured');const before=structuredClone(h.row());
  const response=await h.api.POST(h.request({...values,meta_ad_account_id:'act_bad',meta_campaign_ids:['invalid']}));assert.equal(response.status,400);assert.match((await response.json()).error,/캠페인 ID/);assert.deepEqual(h.row(),before);
});
test('legacy single ID payload and clearing IDs are compatible; non-admin and foreign origin remain denied',async()=>{
  const h=setup();assert.equal((await h.api.POST(h.request({...values,meta_ad_account_id:'act_123',meta_campaign_id:idA}))).status,200);assert.deepEqual(h.row().meta_campaign_ids,[idA]);
  assert.equal((await h.api.POST(h.request({...values,meta_ad_account_id:'',meta_campaign_ids:[]}))).status,200);
  const loaded=await(await h.api.GET(new Request('https://fixture.test/api/landing/performance'))).json();assert.equal(loaded.courses[0].campaigns[0].meta_ad_account_id,commonAccount);
  for (const role of ['operator',null]) { const denied=setup({role});assert.equal((await denied.api.POST(denied.request(values))).status,403);assert.equal(denied.writes(),0); }
  assert.equal((await h.api.POST(h.request(values,'https://elsewhere.test'))).status,403);
});
test('Meta API explicitly records missing server setup, and never fetches or clears IDs',async()=>{
  const oldToken=process.env.META_ACCESS_TOKEN;delete process.env.META_ACCESS_TOKEN;
  try{const h=setup({initial:{...campaign,meta_ad_account_id:'act_123',meta_campaign_id:idA,meta_campaign_ids:[idA]}});
  const response=await h.meta.POST(h.request({}));assert.equal(response.status,503);assert.match((await response.json()).error,/서버 연동 설정/);assert.equal(h.row().meta_sync_status,'failed');assert.deepEqual(h.row().meta_campaign_ids,[idA]);assert.equal(h.rpcCalls.length,0);
  }finally{if(oldToken!==undefined)process.env.META_ACCESS_TOKEN=oldToken;}
});
test('all Meta campaigns fetch before one atomic write; future end day is capped; failures do not write metrics',async()=>{
  const previous=[process.env.META_ACCESS_TOKEN,process.env.META_GRAPH_API_VERSION];process.env.META_ACCESS_TOKEN='fixture-token';process.env.META_GRAPH_API_VERSION='v99.0';
  try{
    let requested;const initial={...campaign,meta_ad_account_id:'act_123',meta_campaign_id:idA,meta_campaign_ids:[idA,idB]};
    const duplicateDimension={day:'2026-09-15',adset_name:'Set',creative_name:'Ad',meta_adset_id:'1',meta_ad_id:'2',meta_creative_id:'3'};
    const h=setup({initial,fetchRows:async input=>{requested=input;return[duplicateDimension,{...duplicateDimension,day:'2026-09-16'}];}});
    assert.equal((await h.meta.POST(h.request({}))).status,200);assert.equal(requested.accountId,commonAccount);assert.deepEqual(requested.campaignIds,[idA,idB]);assert.equal(requested.endDay,new Date(Date.now()+9*3600000).toISOString().slice(0,10));assert.equal(h.rpcCalls.length,1);assert.equal(h.rpcCalls[0].name,'edu_store_campaign_meta');assert.equal(h.rpcCalls[0].args.p_dimensions.length,1);
    const fail=setup({initial,fetchRows:async()=>{throw Error('fixture failure')}});assert.equal((await fail.meta.POST(fail.request({}))).status,502);assert.equal(fail.rpcCalls.length,0);assert.equal(fail.row().meta_sync_status,'failed');
  }finally{for(const [i,key]of['META_ACCESS_TOKEN','META_GRAPH_API_VERSION'].entries())if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}
});
test('Meta route distinguishes typed upstream failures, partial results and duplicate sync locks',async()=>{
  const previous=[process.env.META_ACCESS_TOKEN,process.env.META_GRAPH_API_VERSION];process.env.META_ACCESS_TOKEN='fixture-token';process.env.META_GRAPH_API_VERSION='v99.0';
  try {
    const initial={...campaign,meta_ad_account_id:'act_123',meta_campaign_ids:[idA,idB]};
    const typed=setup({initial,fetchRows:async()=>{throw {type:'rate_limit',stage:'insights',retryable:true,completedCampaigns:1,totalCampaigns:2};}});
    const response=await typed.meta.POST(typed.request({})),body=await response.json();
    assert.equal(response.status,429);assert.equal(body.type,'rate_limit');assert.equal(body.outcome,'partial_failure');assert.equal(typed.rpcCalls.length,0);assert.match(typed.row().meta_sync_error,/저장은 적용하지 않았습니다/);
    let fetched=false;const locked=setup({initial:{...initial,meta_sync_status:'syncing',meta_sync_attempted_at:new Date().toISOString()},fetchRows:async()=>{fetched=true;return[];}});
    const duplicate=await locked.meta.POST(locked.request({}));assert.equal(duplicate.status,409);assert.equal(fetched,false);assert.equal(locked.rpcCalls.length,0);
  } finally {for(const [i,key]of['META_ACCESS_TOKEN','META_GRAPH_API_VERSION'].entries())if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}
});
test('Meta fetch retrieves and deduplicates multiple campaign IDs, rejects mixed accounts',async()=>{
  const original=global.fetch, fetched=[];let mismatch=false;
  global.fetch=async input=>{const url=new URL(input);const parts=url.pathname.split('/'),id=parts[2];fetched.push(url.pathname);
    if(parts.length===3)return Response.json({id,account_id:mismatch?'999':'123',name:'Fixture'});
    if(parts[3]==='ads')return Response.json({data:[]});
    return Response.json({data:[{date_start:'2026-09-14',campaign_id:id,adset_id:'1',ad_id:id,impressions:'100',spend:'12.50'}]});};
  try{const api=load('lib/meta-marketing.ts');const input={version:'v99.0',token:'test',accountId:'act_123',campaignIds:[idA,idB,idA],startDay:'2026-09-14',endDay:'2026-09-15'};
    const rows=await api.fetchMetaCampaigns(input);assert.equal(rows.length,2);assert.equal(rows.reduce((n,r)=>n+r.spend,0),25);assert.equal(fetched.filter(p=>p.endsWith('/insights')).length,2);
    mismatch=true;await assert.rejects(api.fetchMetaCampaigns(input),/META_SYNC_INVALID_ACCOUNT/);
  }finally{global.fetch=original;}
});
test('Meta errors preserve safe type, stage and retry policy without exposing upstream messages',async()=>{
  const original=global.fetch; let calls=0;
  try {
    const api=load('lib/meta-marketing.ts'), input={version:'v99.0',token:'secret-never-returned',accountId:'act_123',campaignIds:[idA],startDay:'2026-09-15',endDay:'2026-09-15'};
    global.fetch=async()=>new Response(JSON.stringify({error:{message:'expired secret-never-returned',code:190,error_subcode:463}}),{status:400});
    await assert.rejects(api.fetchMetaCampaigns(input),error=>error.type==='token_expired'&&error.stage==='campaign_identity'&&!error.retryable&&!error.message.includes('secret'));
    global.fetch=async()=>{calls++;return new Response(JSON.stringify({error:{message:'busy',code:613}}),{status:429});};
    await assert.rejects(api.fetchMetaCampaigns(input),error=>error.type==='rate_limit'&&error.retryable); assert.equal(calls,3);
  } finally { global.fetch=original; }
});
test('Meta registration count and result cost are copied from action arrays without recalculation',async()=>{
  const original=global.fetch;
  global.fetch=async input=>{const url=new URL(input),parts=url.pathname.split('/'),id=parts[2];
    if(parts.length===3)return Response.json({id,account_id:'123',name:'Fixture'});
    if(parts[3]==='ads')return Response.json({data:[]});
    assert.match(url.searchParams.get('fields'),/cost_per_action_type/);
    return Response.json({data:[{date_start:'2026-09-15',campaign_id:id,adset_id:'1',adset_name:'Set',ad_id:'2',ad_name:'Creative',impressions:'100',spend:'7000',actions:[{action_type:'offsite_conversion.fb_pixel_complete_registration',value:'4'}],cost_per_action_type:[{action_type:'offsite_conversion.fb_pixel_complete_registration',value:'1750'}]}]});
  };
  try{const api=load('lib/meta-marketing.ts');const rows=await api.fetchMetaCampaigns({version:'v99.0',token:'test',accountId:'act_123',campaignIds:[idA],startDay:'2026-09-15',endDay:'2026-09-15'});assert.equal(rows[0].registrations,4);assert.equal(rows[0].registration_cost,1750);assert.equal(rows[0].registration_available,true);assert.equal(api.metaActionValue([{action_type:'complete_registration',value:'9'}],'complete_registration'),9);assert.equal(api.metaRegistrationValue([{action_type:'unrelated_complete_registration',value:'91'}]),null);}
  finally{global.fetch=original;}
});

test('list and detail always use common account for null and stale campaign rows',async()=>{
  for(const account of [null,'act_999']){
    const h=setup({initial:{...campaign,meta_ad_account_id:account}});
    const list=await(await h.api.GET(new Request('https://fixture.test/api/landing/performance'))).json();
    assert.equal(list.courses[0].campaigns[0].meta_ad_account_id,commonAccount);
    const detail=await(await h.api.GET(new Request(`https://fixture.test/api/landing/performance?landing=${campaign.landing_id}&campaign=${campaign.id}&start=2026-09-14&end=2026-09-15`))).json();
    assert.equal(detail.campaign.meta_ad_account_id,commonAccount);assert.equal(detail.summary_b.spend,37.5);assert.equal(h.writes(),0);
  }
});
test('legacy account payload cannot change or clear the common account, including invalid input',async()=>{
  for(const value of ['',null,'act_999','invalid',123]){
    const h=setup();const response=await h.api.POST(h.request({...values,meta_ad_account_id:value,meta_campaign_ids:[idA]}));
    assert.equal(response.status,200);assert.equal(h.row().meta_ad_account_id,commonAccount);assert.equal(h.row().meta_sync_status,'idle');
  }
});
test('missing shared account prevents Meta requests even when a stale row has an account',async()=>{
  let fetched=false;const h=setup({account:null,initial:{...campaign,meta_ad_account_id:'act_999',meta_campaign_ids:[idA]},fetchRows:async()=>{fetched=true;return[]}});
  const response=await h.meta.POST(h.request({}));assert.equal(response.status,503);assert.match((await response.json()).error,/공통 광고계정/);assert.equal(fetched,false);assert.equal(h.writes(),0);assert.equal(h.rpcCalls.length,0);
});
test('shared setting query failure leaves stored campaign values untouched',async()=>{
  const h=setup({accountError:{message:'fixture failure'}});const response=await h.api.POST(h.request({...values,meta_campaign_ids:[idA]}));
  assert.equal(response.status,400);assert.match((await response.json()).error,/공통 설정/);assert.equal(h.writes(),0);
});
