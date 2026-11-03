import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {contract,adControls as a} from './helpers/edu-export.mjs';

test('180-day horizon is inclusive and independent of the 31-day batch limit',()=>{
 const now=new Date('2026-10-01T00:00:00+09:00');
 const day=n=>new Date(now.getTime()+9*3600000-n*86400000).toISOString().slice(0,10);
 assert.equal(contract.exportRange(day(180),day(180),now).length,1);
 assert.equal(contract.exportRange(day(181),day(181),now),null);
 assert.equal(contract.exportRange(day(30),day(0),now).length,31);
 assert.equal(contract.exportRange(day(31),day(0),now),null);
});

test('backfill SQL gates KST boundaries and historical refresh, holds one transaction lock while collecting, and restricts roles',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 alter default privileges in schema public grant all on tables to service_role;
 create table edu_analytics_orders(id integer,status text,paid_at timestamptz);
 create table order_items(order_id integer,cohort_id integer);
 create table cohorts(id integer,operation_end_at timestamptz);
 create function edu_export_v1_source(date,date,timestamptz) returns jsonb language sql as
 $$select jsonb_build_object('e5',false,'lock_held',exists(select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid()))$$;
 create function edu_export_v1_source_e5(date,date,timestamptz) returns jsonb language sql as
 $$select public.edu_export_v1_source($1,$2,$3)||'{"e5":true}'::jsonb$$;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261008015252_edu_export_backfill_guard.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role');
 const get=async({ds='daily_totals',from='2026-08-01',to=from,at='2026-10-01T02:00:00+09:00',controls=false}={})=>
  (await db.query('select edu_export_v1_guarded_source($1,$2,$3,$4,$5) v',[ds,from,to,at,controls])).rows[0].v;
 assert.equal((await get({at:'2026-10-01T01:59:59+09:00'})).status,'backfill_window');
 const ok=await get();assert.equal(ok.status,'ok');assert.equal(ok.source.lock_held,true);
 assert.equal((await db.query("select count(*)::int n from pg_locks where locktype='advisory' and pid=pg_backend_pid()")).rows[0].n,0);
 assert.equal((await get({at:'2026-10-01T05:59:59+09:00',controls:true})).source.e5,true);
 assert.equal((await get({at:'2026-10-01T06:00:00+09:00'})).status,'backfill_window');
 assert.equal((await get({from:'2026-03-01'})).status,'invalid_range');
 assert.equal((await get({from:'2026-09-30',at:'2026-10-01T07:00:00+09:00'})).status,'ok');
 assert.equal((await get({from:'2026-09-23',at:'2026-10-01T07:00:00+09:00'})).status,'ok');
 // A real unfinalized cohort sale can refresh at 07:00; an arbitrary old range cannot.
 await db.exec("insert into cohorts values(1,'2026-11-01');insert into edu_analytics_orders values(1,'paid','2026-08-01T10:00:00+09:00');insert into order_items values(1,1)");
 assert.equal((await get({at:'2026-10-01T07:00:00+09:00'})).status,'ok');
 assert.equal((await get({ds:'daily_campaign_perf',at:'2026-10-01T07:00:00+09:00'})).status,'ok');
 assert.equal((await get({to:'2026-08-02',at:'2026-10-01T07:00:00+09:00'})).status,'backfill_window');
 assert.equal((await get({ds:'ops_daily',at:'2026-10-01T07:00:00+09:00'})).status,'backfill_window');
 await db.exec("update cohorts set operation_end_at='2026-09-24T07:00:00+09:00'");
 assert.equal((await get({at:'2026-10-01T06:59:59+09:00'})).status,'ok');
 assert.equal((await get({at:'2026-10-01T07:00:00+09:00'})).status,'backfill_window');
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role);await assert.rejects(get(),/permission denied/);
 }
});

test('configured thresholds retain exact boundaries and legacy defaults, indefinite freeze never becomes indefinite release',()=>{
 const policy={enabled:true,budget_krw:10000,ads_start:'2026-09-01',ads_end:'2026-10-01',sales_end:'2026-10-02',mode:'auto',reason:'검수 사유',override_until:null,updated_at:'2026-09-01T00:00:00Z',revision:1};
 const now=new Date('2026-10-01T03:00:00Z');
 const e={date_kst:'2026-10-01',cohort_code:'course:1',policy:{...policy,cpr_limit_krw:6000,roas_floor:4.5,refund_request_limit:8},cpr_today:6001,cpr_previous:6000,net_krw:450000,spend_krw:100000,reserve_krw:0,refund_requests:7};
 assert.equal(a.evaluateAdControl(e,now).freeze,false);
 e.cpr_previous=6001;assert.deepEqual(a.evaluateAdControl(e,now).freeze_reasons,['cpr_high']);
 e.policy.mode='freeze';assert.equal(a.evaluateAdControl(e,now).freeze_source,'manual');assert.equal(a.evaluateAdControl(e,now).override_until,null);
 e.policy.mode='release';assert.equal(a.evaluateAdControl(e,now).freeze_source,'auto');
 e.policy.mode='auto';e.date_kst='2026-10-03';const after=new Date('2026-10-03T03:00:00Z');
 assert.equal(a.evaluateAdControl(e,after).freeze,false);
 e.net_krw=449999;e.refund_requests=8;assert.deepEqual(a.evaluateAdControl(e,after).freeze_reasons,['mer_provisional_low','refund_requests_high']);
 assert.equal(a.adThresholds(policy).cpr_limit_krw,4500);
 const raw={...policy,cohort_id:'11111111-1111-4111-8111-111111111111',hours:null,mode:'freeze'};
 assert.equal(a.validateAdPolicy(raw).hours,null);
 assert.throws(()=>a.validateAdPolicy({...raw,mode:'release'}));
 for(const delta of [{cpr_limit_krw:0},{cpr_limit_krw:1.1},{roas_floor:0},{roas_floor:Infinity},{refund_request_limit:-1}])assert.throws(()=>a.validateAdPolicy({...raw,...delta}));
});
