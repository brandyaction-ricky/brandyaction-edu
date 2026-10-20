import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { randomUUID as uuid } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function load(file,mocks={}){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>name in mocks?mocks[name]:name.startsWith('@/')?load(name.slice(2)+'.ts',mocks):name.startsWith('.')?load(path.join(path.dirname(file),name)+'.ts',mocks):require(name));return out;}
const logic=load('lib/landing-campaign-management.ts'), meta=load('lib/meta-marketing.ts'), operations=load('lib/landing-operations-phase1.ts');
const migration=fs.readFileSync('supabase/migrations/20261020041401_edu_campaign_cohort_separation.sql','utf8');
test('active cohort default, bounded export windows and missing/zero Meta actions',()=>{
 const old={id:'4',start_day:'2026-09-14',end_day:'2026-09-28'},current={id:'5',start_day:'2026-10-20',end_day:'2026-11-05'},future={id:'6',start_day:'2026-12-01',end_day:'2026-12-31'};
 assert.equal(logic.preferredCampaign([{status:'published',tracking:'active',campaigns:[future,old,current]}],'2026-10-20').id,'5');
 const windows=logic.exportWindows('2026-09-14','2026-09-28');assert.equal(windows.length,8);assert.deepEqual(windows.at(-1),{startDay:'2026-09-28',endDay:'2026-09-28'});
 assert.throws(()=>logic.exportWindows('2026-99-01','2026-11-01'));assert.throws(()=>logic.exportWindows('2026-11-02','2026-11-01'));
 assert.equal(meta.metaLandingPageViews([{action_type:'landing_page_view',value:'0'}]),0);assert.equal(meta.metaLandingPageViews([{action_type:'fake_landing_page_view',value:'12'}]),null);assert.equal(meta.metaLandingPageViews([]),null);
 assert.equal(logic.registrationCost({spend:358189,registrations:182,registration_available:true,registration_cost:null}),358189/182);
 assert.equal(logic.registrationCost({spend:20,registrations:0,registration_available:true,registration_cost:null}),null);
 assert.equal(logic.registrationCost({spend:20,registrations:2,registration_available:null,registration_cost:10}),null);
 const actual=operations.periodActuals([{day:'2026-09-13',kakao_members:0,new_payments:null,existing_payments:null},{day:'2026-09-28',kakao_members:4845,new_payments:null,existing_payments:null}],'2026-09-14','2026-09-28');assert.equal(actual.kakao_delta,4845);assert.equal(actual.baseline_members,0);
});

test('campaign SQL: atomic creation, permissions, overlap, stale edits, cohort isolation, baseline, Meta LPV, long export and retained raw rows',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role service_role bypassrls;create role anon;create role authenticated;
 create table profiles(id uuid primary key,role text,status text,deleted_at timestamptz);
 create table site_settings(key text primary key,value jsonb);
 create table courses(id uuid primary key,title text,category text,archived_at timestamptz);
 create table cohorts(id uuid primary key,course_id uuid,cohort_code text);
 create table landing_configs(id uuid primary key references courses(id));
 create table edu_recruitment_marketing_links(campaign_id uuid primary key,period_id text);
 create table edu_webinar_campaigns(period_id text primary key,paid_cohort_id uuid);
 create table funnel_sessions(session_id uuid primary key,landing_id uuid,visitor_id uuid,created_at timestamptz,last_seen_at timestamptz,attribution jsonb,clicks int,layout_ver int,max_scroll_depth numeric,page_dwell_ms numeric,sections jsonb);
 create index on funnel_sessions(landing_id,created_at);
 create table section_snapshots(landing_id uuid,layout_ver int,created_at timestamptz,note text,sections jsonb);
 create table edu_analytics_orders(id uuid,user_id uuid,status text,currency text,paid_at timestamptz,total_amount int);
 create table order_items(id uuid,order_id uuid,cohort_id uuid);
 create table payments(id uuid,order_id uuid,status text,approved_at timestamptz,approved_amount int,cancelled_amount int);
 create table refunds(payment_id uuid,amount int,status text,completed_at timestamptz);`);
 const original=fs.readFileSync('supabase/migrations/20260914124755_free_class_marketing_dashboard.sql','utf8');await db.exec(original.slice(0,original.indexOf('-- One compatible campaign')));
 const multiple=fs.readFileSync('supabase/migrations/20260915021644_support_multiple_meta_campaigns.sql','utf8');await db.exec(multiple.slice(0,multiple.indexOf('-- Meta rows')));
 await db.exec(`alter table landing_campaigns add column uses_ads boolean not null default false,add column meta_sync_attempted_at timestamptz;
 alter table landing_campaign_meta_daily add column registrations bigint not null default 0,add column registration_cost numeric,add column registration_available boolean;
 grant select on all tables in schema public to service_role;grant usage,select on all sequences in schema public to service_role;`);
 const align=fs.readFileSync('supabase/migrations/20260929150200_free_class_marketing_dashboard_alignment.sql','utf8');await db.exec(align.slice(align.indexOf('create or replace function public.edu_decode_landing_utm_once'),align.indexOf('create or replace function public.edu_store_campaign_meta')));
 await db.exec(fs.readFileSync('supabase/migrations/20261015112712_edu_marketing_approved_cohort_links.sql','utf8'));await db.exec(migration);
 await db.exec('alter function public.edu_marketing_export(uuid,date,date,text[],text[],text[],text[],text[],integer[]) rename to edu_marketing_export_reference');
 await db.exec(fs.readFileSync('supabase/migrations/20261020055100_edu_marketing_export_decode_once.sql','utf8'));
 const admin=uuid(),staff=uuid(),student=uuid(),free=uuid(),paid=uuid(),cohort=uuid(),c4=uuid(),c5=uuid();
 for(const [id,role] of [[admin,'admin'],[staff,'staff'],[student,'student']])await db.query("insert into profiles values($1,$2,'active',null)",[id,role]);
 await db.query("insert into courses values($1,'무료강의','free',null),($2,'문샷','paid_class',null)",[free,paid]);await db.query('insert into landing_configs values($1)',[free]);await db.query("insert into cohorts values($1,$2,'MOONSHOT_004')",[cohort,paid]);await db.exec(`insert into site_settings values('edu_meta_marketing','{"adAccountId":"act_245402678098216"}')`);
 const values=(name,from,to,ids,linked=null)=>({name,utm_campaign:name,start_day:from,end_day:to,new_customer_price:1650000,existing_customer_price:1100000,live_peak:null,uses_ads:true,meta_campaign_ids:ids,paid_cohort_id:linked});
 const v4=values('4기','2026-09-14','2026-09-28',['120252432290300270','120252577373400270'],cohort),v5=values('5기','2026-10-20','2026-11-05',['120253093437610270']);
 const save=async(id,v,create=true,expected=null,actor=admin)=>(await db.query('select public.edu_manage_marketing_campaign($1,$2,$3,$4,$5,$6) value',[actor,id,free,create,expected,v])).rows[0].value;
 await db.exec('set role service_role');
 await assert.rejects(()=>save(uuid(),v5,true,null,student),/CAMPAIGN_FORBIDDEN/);await assert.rejects(()=>save(uuid(),v5,true,null,staff),/CAMPAIGN_FORBIDDEN/);
 const first=await save(c4,v4);assert.equal(first.paid_cohort_id,cohort);await save(c4,v4);assert.equal((await db.query('select count(*)::int n from landing_campaigns')).rows[0].n,1);
 const second=await save(c5,v5);assert.equal(second.paid_cohort_id,null);
 await assert.rejects(()=>save(uuid(),{...v5,name:'중복',utm_campaign:'duplicate'}),/CAMPAIGN_META_OVERLAP/);
 await assert.rejects(()=>save(c5,{...v5,name:'오래된 저장'},false,'2026-01-01'),/CAMPAIGN_CHANGED/);
 await assert.rejects(()=>save(c4,{...v4,paid_cohort_id:null},false,first.updated_at),/CAMPAIGN_COHORT_REVIEW/);
 const binding=(await db.query('select * from edu_marketing_campaign_cohorts where campaign_id=$1',[c5])).rows[0];assert.equal(binding.cohort_id,null);
 const catalog=(await db.query('select edu_marketing_campaign_catalog($1) v',[admin])).rows[0].v;assert.equal(catalog.cohorts[0].id,cohort);
 await assert.rejects(()=>db.query("insert into edu_marketing_approved_cohort_links values($1,$2,'직접 쓰기 금지',now())",[c5,cohort]),/permission denied/);
 const actual=(day,v)=>db.query('select public.edu_upsert_campaign_actual($1,$2,$3,$4,$5) v',[c4,day,v,[],admin]);
 await actual('2026-09-13',{kakao_members:0});await actual('2026-09-28',{kakao_members:4845});await assert.rejects(()=>actual('2026-09-13',{new_payments:0}),/INVALID_BASELINE_FIELDS/);await assert.rejects(()=>actual('2026-09-12',{kakao_members:0}),/INVALID_CAMPAIGN_DAY/);
 await db.exec('reset role');
 await db.query("update landing_campaigns set meta_sync_status='syncing' where id=$1",[c5]);
 const updated=(await db.query('select updated_at from landing_campaigns where id=$1',[c5])).rows[0].updated_at;
 const rows=[{day:'2026-10-20',campaign_name:'5기',adset_name:'세트',creative_name:'J_Img_01',meta_campaign_id:v5.meta_campaign_ids[0],meta_adset_id:'1001',meta_ad_id:'2001',meta_creative_id:'3001',impressions:1000,link_clicks:859,spend:358189,registrations:182,registration_cost:null,registration_available:true,landing_page_views:696,landing_page_view_available:true}];
 await db.exec('set role service_role');await db.query('select edu_store_campaign_meta($1,$2,$3,$4,$5)',[c5,updated,rows,[],admin]);
 // Retained raw row from a removed campaign must never count in totals/ROAS.
 await db.query("insert into landing_campaign_meta_daily(campaign_id,day,campaign_name,meta_campaign_id,meta_adset_id,meta_ad_id,impressions,link_clicks,spend) values($1,'2026-09-20','다른 기수','999','1002','2002',20,10,900000)",[c4]);
 await db.exec('reset role');
 await db.query("insert into funnel_sessions values($1,$2,$3,'2026-10-20T02:00Z','2026-10-20T02:00Z','{}',1,1,70,1000,'{}')",[uuid(),free,uuid()]);
 await db.exec('set role service_role');
 const dash=async(id,from,to)=>(await db.query('select edu_marketing_dashboard($1,$2,$3) v',[id,from,to])).rows[0].v;
 // Legacy encoded and normalized session values must keep identical export rows,
 // classification, filters and ordering after decoding is materialized once.
 await db.exec('reset role');
 for(const attribution of [{utm_campaign:encodeURIComponent('광고 4기'),utm_term:encodeURIComponent('한글 세트'),utm_content:encodeURIComponent('소재_01'),device:'mobile'},{utm_campaign:encodeURIComponent('다른 원본'),utm_campaign_normalized:'광고 4기',utm_term_normalized:'한글 세트',utm_content_normalized:'소재_01',device:'desktop'}])
  await db.query("insert into funnel_sessions values($1,$2,$3,'2026-09-20T02:00Z','2026-09-20T02:00Z',$4,1,1,70,1000,'{}')",[uuid(),free,uuid(),attribution]);
 await db.query("insert into landing_campaign_dimensions(campaign_id,adset_key,creative_key,ad_type) values($1,'한글 세트','소재_01','cold')",[c4]);
 await db.exec('set role service_role');
 for(const filters of [[null,null,null,null,null,null],[['광고 4기'],['cold'],['한글 세트'],['소재_01'],null,null],[null,null,null,null,['mobile'],[1]],[['없음'],null,null,null,null,null]]) {
  const args=[c4,'2026-09-14','2026-09-28',...filters];
  const reference=(await db.query('select edu_marketing_export_reference($1,$2,$3,$4,$5,$6,$7,$8,$9) v',args)).rows[0].v;
  const optimized=(await db.query('select edu_marketing_export($1,$2,$3,$4,$5,$6,$7,$8,$9) v',args)).rows[0].v;
  assert.deepEqual(optimized,reference);
 }
 const four=await dash(c4,'2026-09-14','2026-09-28');assert.equal(four.campaign_summary.spend,0);assert.equal(four.ui.period_actuals.kakao_delta,4845);
 const five=await dash(c5,'2026-10-20','2026-11-05');assert.equal(five.summary_b.spend,358189);assert.equal(five.performance.find(r=>r.creative==='J_Img_01').landing_page_views,696);assert.equal(five.performance.find(r=>r.creative==='').sessions,1);
 const exported=(await db.query("select edu_marketing_export($1,'2026-10-20','2026-11-05') v",[c5])).rows[0].v;assert.equal(exported.find(r=>r.creative==='J_Img_01').landing_page_views,696);
 const insights=(await db.query("select edu_marketing_insights($1,$2,'2026-10-20','2026-11-05') v",[admin,c5])).rows[0].v;assert.equal(insights.revenue.state,'unmapped');assert.equal(insights.revenue.net,null);
 await db.exec('reset role');
 for(const name of ['edu_manage_marketing_campaign','edu_marketing_campaign_catalog']) {const rights=(await db.query("select has_function_privilege('anon',oid,'execute') a,has_function_privilege('authenticated',oid,'execute') b from pg_proc where proname=$1",[name])).rows[0];assert.deepEqual(rights,{a:false,b:false});}
 assert.equal((await db.query('select count(*)::int n from edu_marketing_campaign_audit')).rows[0].n,2);
});


test('15-day CSV uses eight bounded queries with all filters, computes costs and never returns partial data', async () => {
 const campaign={id:uuid(),landing_id:uuid(),name:'4기',start_day:'2026-09-14',end_day:'2026-09-28',landing_configs:{courses:{title:'시험'}}};
 async function run(failAt=0) {
  const calls=[];const query={select(){return this},eq(){return this},async maybeSingle(){return{data:campaign,error:null}}};
  const db={from(){return query},rpc(name,args){calls.push({name,args});return{async abortSignal(signal){assert.equal(signal.aborted,false);return calls.length===failAt?{data:null,error:{message:'timeout'}}:{data:[{day:args.p_start,ad_type:'cold',campaign:'5기',adset:'A',creative:'J_Img_01',sessions:0,visitors:0,cta_click_sessions:0,spend:358189,registrations:182,registration_available:true,registration_cost:null,landing_page_views:696,landing_page_view_available:true}],error:null}}}}};
  const api=load('app/api/landing/performance/export/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/operator-permissions':{getOperatorUser:async()=>({id:uuid(),role:'admin'})}});
  const response=await api.GET(new Request(`https://fixture.test/api/landing/performance/export?campaign=${campaign.id}&start=2026-09-14&end=2026-09-28&creative=J_Img_01&ad_type=cold`));return{response,calls};
 }
 const okay=await run();assert.equal(okay.response.status,200);assert.equal(okay.calls.length,8);assert.deepEqual(okay.calls.at(-1).args.p_creatives,['J_Img_01']);assert.equal(okay.calls.at(-1).args.p_end,'2026-09-28');const csv=await okay.response.text();assert.match(csv,/Meta 랜딩 조회/);assert.match(csv,/1968/);assert.match(csv,/광고비 ÷ 등록완료/);assert.equal(csv.split('\r\n').length,9);
 const failed=await run(3);assert.equal(failed.response.status,400);assert.match(failed.response.headers.get('content-type'),/json/);assert.match((await failed.response.json()).error,/CSV 데이터를 만들지 못했습니다/);assert.equal(failed.calls.length,3);
});
