import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID as id} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import {adControls as a, contract, logic, emptySource} from './helpers/edu-export.mjs';
const read=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
test('E5 exact SQL audits atomic changes, protects browser roles and computes mapped spend/joins from real E1 eligible orders',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 alter default privileges in schema public grant all on tables to service_role;
 create table profiles(id uuid primary key,role text,status text,is_internal boolean default false,deleted_at timestamptz);
 create table courses(id uuid primary key,course_code text);
 create table cohorts(id uuid primary key,course_id uuid,cohort_code text,operation_end_at timestamptz);
 create table orders(id uuid primary key,user_id uuid,status text,total_amount int,created_at timestamptz,paid_at timestamptz,entry_src text,is_test_order boolean default false);
 create table order_items(id uuid primary key,order_id uuid,cohort_id uuid);
 create table payments(id uuid primary key,order_id uuid,status text,approved_amount int,cancelled_amount int,approved_at timestamptz);
 create table refunds(payment_id uuid,amount int,status text,completed_at timestamptz);
 create table edu_refund_requests(payment_id uuid,created_at timestamptz);
 create table landing_campaigns(id uuid primary key,uses_ads boolean,meta_campaign_ids text[],meta_sync_status text,meta_last_synced_at timestamptz);
 create table edu_recruitment_marketing_links(campaign_id uuid,period_id text);
 create table edu_webinar_campaigns(id uuid,period_id text,paid_cohort_id uuid);
 create table landing_campaign_meta_daily(campaign_id uuid,day date,meta_campaign_id text,spend numeric,synced_at timestamptz);
 create table landing_campaign_actuals(campaign_id uuid,day date,kakao_members int);
 create function public.edu_export_v1_source(date,date,timestamptz) returns jsonb language sql security invoker as 'select ''{}''::jsonb';`);
 const e1=read('20261005020515_edu_internal_order_analytics_e1.sql');for(const name of ['edu_analytics_members','edu_analytics_orders'])await db.exec(e1.match(new RegExp('create view public\\.'+name+'[\\s\\S]*?;'))[0]);
 await db.exec(read('20261007104040_edu_ad_controls_e5.sql'));
 await db.exec(read('20261008015249_edu_ad_control_policy_settings.sql'));
 const admin=id(),student=id(),internal=id(),course=id(),cohort=id(),campaign=id();
 await db.query("insert into profiles values($1,'admin','active',true,null),($2,'student','active',false,null),($3,'student','active',true,null)",[admin,student,internal]);
 await db.query("insert into courses values($1,'moonshot')",[course]);await db.query("insert into cohorts values($1,$2,'5',now()+interval '30 days')",[cohort,course]);
 const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),shift=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),yesterday=shift(-1),two=shift(-2),three=shift(-3);
 const policy={cohort_id:cohort,enabled:true,budget_krw:24000000,ads_start:three,ads_end:shift(2),sales_end:shift(5),mode:'release',reason:'대표 합성 검수 승인',hours:72,revision:0};
 await db.exec('set role service_role');
 const save=async(p=policy,u=admin)=>(await db.query('select edu_ad_control_save($1,$2) v',[u,p])).rows[0].v;
 await assert.rejects(save(policy,student),/DENIED/);
 const saved=await save();assert.equal(saved.revision,1);assert.ok(Date.parse(saved.override_until)-Date.parse(saved.updated_at)<=72*3600000);
 await assert.rejects(save(),/CHANGED/);assert.equal((await db.query('select * from edu_ad_control_history')).rows.length,1);
 await assert.rejects(save({...policy,revision:1,hours:73}),/INVALID/);assert.equal((await db.query('select revision from edu_ad_control_policies')).rows[0].revision,1);
 await db.query('insert into landing_campaigns values($1,true,$2,\'success\',now())',[campaign,['meta-synthetic']]);
 await db.query("insert into edu_webinar_campaigns values($1,'period-5',$2)",[id(),cohort]);await db.query("insert into edu_recruitment_marketing_links values($1,'period-5')",[campaign]);
 for(const[day,count]of[[three,0],[two,10],[yesterday,20],[today,30]]){
 await db.query('insert into landing_campaign_actuals values($1,$2,$3)',[campaign,day,count]);
 await db.query('insert into landing_campaign_meta_daily values($1,$2,\'meta-synthetic\',50000,now())',[campaign,day]);
 }
 async function order(user,test=false){const o=id(),p=id();await db.query("insert into orders values($1,$2,'paid',100000,now(),now(),'organic',$3)",[o,user,test]);await db.query('insert into order_items values($1,$2,$3)',[id(),o,cohort]);await db.query("insert into payments values($1,$2,'done',100000,0,now())",[p,o]);return p;}
 await order(student);await order(internal);await order(student,true);
 const snapshot=async()=> (await db.query('select edu_ad_control_source($1,$1,statement_timestamp()) v',[today])).rows[0].v;
 let source=await snapshot();assert.equal(source.length,1);assert.equal(source[0].net_krw,100000);assert.equal(source[0].reserve_krw,null);
 // The last two completed days are high, so auto blocks. Representative override is valid without inventing inputs.
 assert.equal(source[0].cpr_today,5000);const now=new Date();assert.equal(a.exportedAdControl(source,today,now).freeze,false);
 const exported=logic.aggregateExport('ops_daily',{...emptySource(),ad_controls:source},[today],now);
 assert.equal(contract.validExport('ops_daily',exported),true);assert.ok(!JSON.stringify(exported).includes('대표 합성 검수'));
 // Missing one configured Meta campaign, stale sync, or a missing member baseline must not look safe.
 await db.query('update landing_campaigns set meta_campaign_ids=$2 where id=$1',[campaign,['meta-synthetic','meta-not-synced']]);
 source=await snapshot();assert.equal(source[0].cpr_today,null);assert.equal(source[0].spend_krw,null);
 assert.ok(a.evaluateAdControl({...source[0],policy:{...saved,mode:'auto'}},new Date()).freeze_reasons.includes('input_missing'));
 await db.query('update landing_campaigns set meta_campaign_ids=$2,meta_sync_status=\'failed\' where id=$1',[campaign,['meta-synthetic']]);
 source=await snapshot();assert.equal(source[0].cpr_today,null);
 await db.query('update landing_campaigns set meta_sync_status=\'success\' where id=$1',[campaign]);
 await db.query('delete from landing_campaign_actuals where campaign_id=$1 and day=$2',[campaign,two]);
 source=await snapshot();assert.equal(source[0].cpr_today,null);assert.equal(source[0].cpr_previous,null);
 await db.query('insert into landing_campaign_actuals values($1,$2,10)',[campaign,two]);
 // Completed historical spend for every configured campaign is needed for post-sale ROAS.
 const maturePolicy={...saved,ads_end:yesterday,sales_end:yesterday,mode:'auto',revision:2};
 await db.exec('reset role');
 await db.query("update cohorts set operation_end_at=now()-interval '8 days' where id=$1",[cohort]);
 await db.query('insert into edu_ad_control_history(cohort_id,actor_id,occurred_at,revision,policy) values($1,$2,now(),2,$3)',[cohort,admin,maturePolicy]);
 await db.exec('set role service_role');source=await snapshot();
 assert.equal(source[0].reserve_krw,0);assert.equal(source[0].spend_krw,150000);
 assert.deepEqual(a.evaluateAdControl(source[0],new Date()).freeze_reasons,['mer_provisional_low']);
 for(let n=0;n<5;n++)await db.query('insert into edu_refund_requests values($1,now())',[await order(student)]);
 source=await snapshot();assert.equal(source[0].refund_requests,5);
 assert.ok(a.evaluateAdControl(source[0],new Date()).freeze_reasons.includes('refund_requests_high'));
 await db.exec('reset role');await db.query('delete from edu_ad_control_history where cohort_id=$1 and revision=2',[cohort]);
 await db.exec('set role service_role');
 // Store synthetic dated history to verify yesterday is unaffected by today's release.
 await db.exec('reset role');const historical={...saved,mode:'auto',override_until:null,revision:0,updated_at:three+'T00:00:00+09:00'};
 await db.query('insert into edu_ad_control_history(cohort_id,actor_id,occurred_at,revision,policy) values($1,$2,$3,0,$4)',[cohort,admin,historical.updated_at,historical]);
 await db.exec('set role service_role');source=(await db.query('select edu_ad_control_source($1,$1,statement_timestamp()) v',[yesterday])).rows[0].v;
 assert.equal(source[0].cpr_today,5000);assert.equal(source[0].cpr_previous,5000);assert.equal(a.exportedAdControl(source,yesterday,new Date()).freeze,true);
 assert.deepEqual(a.exportedAdControl(source,yesterday,new Date()).freeze_reasons,['cpr_high']);
 const configured=await save({...policy,revision:1,mode:'freeze',hours:null,cpr_limit_krw:6000,roas_floor:4.5,refund_request_limit:8});
 assert.equal(configured.override_until,null);assert.equal(configured.cpr_limit_krw,6000);assert.equal(configured.roas_floor,4.5);
 const latest=(await db.query('select policy from edu_ad_control_history where revision=2')).rows[0].policy;
 assert.equal(latest.refund_request_limit,8);
 const stillFrozen=a.evaluateAdControl({...fixtureEvidence(configured),cpr_today:1,cpr_previous:1},new Date(configured.updated_at));
 assert.equal(stillFrozen.freeze_source,'manual');assert.equal(stillFrozen.override_until,null);
 await assert.rejects(save({...policy,revision:2,mode:'release',hours:null}),/INVALID/);
 await assert.rejects(save({...policy,revision:2,mode:'freeze',hours:undefined}),/INVALID/);
 await assert.rejects(save({...policy,revision:2,cpr_limit_krw:0}),/check constraint/);
 assert.equal((await db.query('select revision from edu_ad_control_policies')).rows[0].revision,2);
 // The old automatic history remains at its old defaults; current settings do not overwrite history.
 assert.equal(a.adThresholds((await db.query('select policy from edu_ad_control_history where revision=0')).rows[0].policy).cpr_limit_krw,4500);
 function fixtureEvidence(p){return {policy:p,date_kst:today,cohort_code:'moonshot:5',cohort_id:cohort,spend_krw:1,cpr_today:1,cpr_previous:1,net_krw:10,reserve_krw:0,refund_requests:0};}
 for(const role of['authenticated','anon']){
 await db.exec('reset role;set role '+role);
 for(const sql of["select * from edu_ad_control_policies","select * from edu_ad_control_history","select edu_ad_control_source(current_date,current_date,now())","select edu_ad_control_save(null,'{}')","select edu_export_v1_source_e5(current_date,current_date,now())"])await assert.rejects(db.query(sql),/permission denied/);
 }
 await db.exec('reset role;set role service_role');await assert.rejects(db.query('delete from edu_ad_control_history'),/permission denied/);
});
