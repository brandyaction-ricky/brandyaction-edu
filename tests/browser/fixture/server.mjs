import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { reviewFixture } from './submission-review-api.mjs';

// Synthetic responses only, including local in-memory review writes. Never connects to Auth, DB or Meta.
const today = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const relativeDay = days => new Date(Date.parse(today)+days*86400000).toISOString().slice(0,10);
const campaign = {id:'bbbbbbbb-bbbb-4000-8000-000000000002',landing_id:'aaaaaaaa-aaaa-4000-8000-000000000001',name:'포커스 검증 캠페인',utm_campaign:'focus-fixture',start_day:relativeDay(-30),end_day:relativeDay(30),new_customer_price:1000,existing_customer_price:500,live_peak:null,uses_ads:false,meta_ad_account_id:null,meta_campaign_id:null,meta_campaign_ids:[],meta_sync_status:'not_configured',meta_last_synced_at:null,meta_sync_error:null};
const actual = {campaign_id:campaign.id,day:relativeDay(-1),kakao_members:10,new_payments:0,existing_payments:0,memo:null,new_price_snapshot:1000,existing_price_snapshot:500};
const summary = {has_data:false,sessions:0,visitors:0,cta_click_sessions:0,cta_clicks:0,converted_visitors:0,avg_dwell_ms:0,avg_scroll_depth:0,meta_impressions:0,meta_link_clicks:0,spend:0};
const report = {campaign,summary_b:summary,summary_a:null,performance:[],daily:[],actuals:[actual],campaign_summary:{live_peak:null,kakao_members:10,kakao_delta:null,new_payments:0,existing_payments:0,revenue:0,spend:0,roas:null},options:{campaigns:[],ad_types:[],adsets:[],creatives:[],devices:[],layouts:[]},data_state:{sessions_exist:false,filtered_sessions_exist:false,meta_exists:false}};
const result = await build({entryPoints:['tests/browser/fixture/app.tsx'],bundle:true,write:false,outdir:'focus-fixture',platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},alias:{'next/image':resolve('tests/browser/fixture/image.tsx'),'next/link':resolve('tests/browser/fixture/link.tsx'),'next/navigation':resolve('tests/browser/fixture/navigation.ts')}});
const assets = new Map(result.outputFiles.map(file=>['/'+file.path.split('/').at(-1),file.contents]));
const brandLogo = readFileSync(resolve('public/brandy-action-logo.png'));
const failedMemberReads = new Set();
const server = createServer((request,response)=>{
  const url=new URL(request.url,'http://localhost');
  if(reviewFixture(request,response,url))return;
  if(request.method!=='GET'){response.writeHead(405).end();return;}
  if(url.pathname==='/api/platform'){
    const courses=[{id:'visible',title:'합성 공개 상품',slug:'visibility-public',category:'free',status:'published',list_price:0,metadata:{}},{id:'hidden',title:'합성 링크 전용 상품',slug:'visibility-hidden',category:'free',status:'published',list_price:0,metadata:{is_listed:false,cta_label:'링크로 신청',cta_url:'/webinar/11111111-1111-4111-8111-111111111111/organic'}}];
    courses.push({id:'paid-hidden',title:'합성 비노출 유료 상품',slug:'visibility-paid',category:'paid_class',status:'published',list_price:10000,description:'합성 상세',duration_label:'4주',schedule_label:'매주',metadata:{is_listed:false}});
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({user:null,data:{courses,cohorts:[{id:'paid-cohort',course_id:'paid-hidden',status:'recruiting',name:'합성 1기',price:10000,recruitment_end_at:'2099-12-31T14:59:00Z'}],curriculum_weeks:[{id:'paid-week',course_id:'paid-hidden',is_published:true}],curriculum_lessons:[{id:'paid-lesson',week_id:'paid-week',is_published:true}]},support:{}}));return;
  }
  if(url.pathname==='/api/platform/workflows'&&url.searchParams.get('kind')==='participants'){
    const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({cohortId:id(11),weekId:id(15),cohorts:[{id:id(11),name:'1기',course_id:id(10),course_title:'합성 신규 상품'}],weeks:[{id:id(15),week:1,title:'실행 시작'}],columns:[{id:id(16),day_number:1,title:'첫 학습'}],matrix:{[id(12)]:[{lessonId:id(16),status:'changes_requested',submissionId:id(30),approved:0,total:1}]},rows:[{id:id(12),user_id:id(1),full_name:'운영 동선 QA 회원',email:'operations-fixture@example.test',learning_percent:50,mission_total:1,approved:0,achievement:0,last_activity:'2026-09-24T09:00:00Z'}],total:1,stats:{participants:1,average:0,participation:100,attention:0}}));return;
  }
  if(url.pathname==='/api/admin/member-overview'){
    const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    const member=url.searchParams.get('member'),view=url.searchParams.get('view'),page=Number(url.searchParams.get('page')||1);
    response.setHeader('Content-Type','application/json');
    if(member===id(3)&&!failedMemberReads.has(view)){setTimeout(()=>{if(response.destroyed)return;failedMemberReads.add(view);response.writeHead(503).end(JSON.stringify({error:'합성 조회 오류: 다시 시도해 주세요.'}));},500);return;}
    const enrollment={courses:{id:id(10),title:'합성 신규 상품'},cohorts:{id:id(11),name:'1기'},cohort_id:id(11)};
    const records=view==='enrollments'?[
      {id:id(12),...enrollment,status:'active',access_starts_at:'2026-01-01',access_ends_at:'2099-01-01'},
      {id:id(13),...enrollment,status:'active',access_starts_at:'2099-01-01'},
      {id:id(14),...enrollment,status:'active',access_ends_at:'2025-01-01'},
    ]:view==='progress'?[]:view==='submissions'?Array.from({length:21},(_,n)=>({id:id(30+n),status:'approved',attempt_number:2,submitted_at:'2026-09-24T09:00:00Z',reviewed_at:'2026-09-24T10:00:00Z',reviewer_feedback:'실행 확인 완료',enrollments:enrollment,curriculum_missions:{id:id(20),title:`첫 실행 미션 ${n+1}`}})):[{id:id(40),courses:enrollment.courses,title:'합성 보관 질문',status:'answered',is_archived:true,created_at:'2026-09-24T09:00:00Z'}];
    const rows=member===id(4)?[]:records;
    setTimeout(()=>response.end(JSON.stringify({rows:rows.slice((page-1)*20,page*20),total:rows.length,page,pageSize:20})),500);return;
  }
  if(url.pathname==='/brandy-action-logo.png'){response.setHeader('Content-Type','image/png');response.end(brandLogo);return;}
  if(url.pathname==='/api/landing/performance'){
    response.setHeader('Content-Type','application/json');
    const start=url.searchParams.get('start'),end=url.searchParams.get('end');
    response.end(JSON.stringify(start ? {...report,actuals:actual.day>=start&&actual.day<=end?[actual]:[],range:{startDay:start,endDay:end,compareStartDay:null,compareEndDay:null}} : {can_manage_campaign:true,courses:[{id:campaign.landing_id,title:'포커스 검증 클래스',slug:'focus-fixture',status:'published',category:'free',tracking:'active',campaigns:[campaign]}]}));return;
  }
  const asset=assets.get(url.pathname);
  if(asset){response.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'text/javascript');response.end(asset);return;}
  response.setHeader('Content-Type','text/html');response.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin focus fixture</title><link rel="stylesheet" href="/app.css"></head><body style="overflow:auto"><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
const port = Number(process.env.FIXTURE_PORT || 4173);
server.listen(port,'127.0.0.1',()=>console.log(`Focus fixture ready on port ${port}`));
