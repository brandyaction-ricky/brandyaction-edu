import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';

// Only synthetic GET responses. This fixture never connects to Auth, DB or Meta.
const today = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const relativeDay = days => new Date(Date.parse(today)+days*86400000).toISOString().slice(0,10);
const campaign = {id:'bbbbbbbb-bbbb-4000-8000-000000000002',landing_id:'aaaaaaaa-aaaa-4000-8000-000000000001',name:'포커스 검증 캠페인',utm_campaign:'focus-fixture',start_day:relativeDay(-30),end_day:relativeDay(30),new_customer_price:1000,existing_customer_price:500,live_peak:null,meta_ad_account_id:null,meta_campaign_id:null,meta_campaign_ids:[],meta_sync_status:'not_configured',meta_last_synced_at:null,meta_sync_error:null};
const actual = {campaign_id:campaign.id,day:relativeDay(-1),kakao_members:10,new_payments:0,existing_payments:0,memo:null,new_price_snapshot:1000,existing_price_snapshot:500};
const summary = {has_data:false,sessions:0,visitors:0,cta_click_sessions:0,cta_clicks:0,converted_visitors:0,avg_dwell_ms:0,avg_scroll_depth:0,meta_impressions:0,meta_link_clicks:0,spend:0};
const report = {campaign,summary_b:summary,summary_a:null,performance:[],daily:[],actuals:[actual],campaign_summary:{live_peak:null,kakao_members:10,kakao_delta:null,new_payments:0,existing_payments:0,revenue:0,spend:0,roas:null},options:{campaigns:[],ad_types:[],adsets:[],creatives:[],devices:[],layouts:[]},data_state:{sessions_exist:false,filtered_sessions_exist:false,meta_exists:false}};
const result = await build({entryPoints:['tests/browser/fixture/app.tsx'],bundle:true,write:false,outdir:'focus-fixture',platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'next/link':resolve('tests/browser/fixture/link.tsx')}});
const assets = new Map(result.outputFiles.map(file=>['/'+file.path.split('/').at(-1),file.contents]));
const server = createServer((request,response)=>{
  const url=new URL(request.url,'http://localhost');
  if(request.method!=='GET'){response.writeHead(405).end();return;}
  if(url.pathname==='/api/landing/performance'){
    response.setHeader('Content-Type','application/json');
    const start=url.searchParams.get('start'),end=url.searchParams.get('end');
    response.end(JSON.stringify(start ? {...report,actuals:actual.day>=start&&actual.day<=end?[actual]:[],range:{startDay:start,endDay:end,compareStartDay:null,compareEndDay:null}} : {can_manage_campaign:true,courses:[{id:campaign.landing_id,title:'포커스 검증 클래스',slug:'focus-fixture',status:'published',category:'free',tracking:'active',campaigns:[campaign]}]}));return;
  }
  const asset=assets.get(url.pathname);
  if(asset){response.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');response.end(asset);return;}
  response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin focus fixture</title><link rel="stylesheet" href="/app.css"></head><body style="overflow:auto"><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
server.listen(4173,'0.0.0.0',()=>console.log('Focus fixture ready on port 4173'));
