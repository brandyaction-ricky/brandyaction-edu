import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20260929150200_free_class_marketing_dashboard_alignment.sql', import.meta.url), 'utf8');

test('dashboard alignment migration executes and joins web/Meta only by exact ad ID', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role service_role;
      create role anon;
      create role authenticated;
      create table public.landing_campaigns (
        id uuid primary key, landing_id uuid not null, uses_ads boolean not null,
        meta_campaign_ids text[] not null default '{}', start_day date not null, end_day date not null,
        live_peak integer, meta_sync_status text, meta_last_synced_at timestamptz,
        meta_sync_attempted_at timestamptz, meta_sync_error text, updated_at timestamptz,
        updated_by uuid
      );
      create table public.landing_campaign_dimensions (
        campaign_id uuid not null, adset_key text not null, creative_key text not null,
        meta_adset_id text, meta_ad_id text, meta_creative_id text, ad_type text not null,
        updated_by uuid, updated_at timestamptz not null default now(),
        primary key(campaign_id,adset_key,creative_key)
      );
      create table public.landing_campaign_meta_daily (
        campaign_id uuid not null, day date not null, campaign_name text not null,
        adset_name text not null default '', creative_name text not null default '',
        meta_campaign_id text not null, meta_adset_id text not null, meta_ad_id text not null,
        meta_creative_id text, impressions bigint not null, link_clicks bigint not null,
        spend numeric not null, registrations bigint not null default 0, registration_cost numeric,
        synced_at timestamptz not null default now(), primary key(campaign_id,day,meta_ad_id)
      );
      create table public.funnel_sessions (
        landing_id uuid not null, created_at timestamptz not null, visitor_id uuid not null,
        clicks integer not null default 0, page_dwell_ms integer, max_scroll_depth numeric,
        last_seen_at timestamptz default '2026-09-15 05:00:00+00', layout_ver integer, attribution jsonb not null default '{}'
      );
      create table public.landing_campaign_actuals (
        campaign_id uuid not null, day date not null, kakao_members integer,
        new_payments integer, existing_payments integer, new_price_snapshot numeric not null default 0,
        existing_price_snapshot numeric not null default 0, memo text, updated_at timestamptz not null default now()
      );
    `);
    await db.exec(migration);
    const campaignId = 'bbbbbbbb-bbbb-4000-8000-000000000002';
    const landingId = 'aaaaaaaa-aaaa-4000-8000-000000000001';
    await db.query(`insert into public.landing_campaigns(id,landing_id,uses_ads,meta_campaign_ids,start_day,end_day,meta_sync_status,updated_at)
      values($1,$2,true,array['campaign-meta-1']::text[],'2026-09-01','2026-09-30','success',now())`, [campaignId, landingId]);
    await db.query(`insert into public.landing_campaign_dimensions(campaign_id,adset_key,creative_key,meta_adset_id,meta_ad_id,ad_type)
      values($1,'%E1%84%8F%E1%85%A9%E1%86%AF%E1%84%83%E1%85%B3','image%25201','adset-1','ad-1','cold')`, [campaignId]);
    await db.query(`insert into public.funnel_sessions(landing_id,created_at,visitor_id,clicks,page_dwell_ms,max_scroll_depth,layout_ver,attribution)
      values($1,'2026-09-15 03:00:00+00','dddddddd-dddd-4000-8000-000000000004',1,1000,50,1,
      '{"utm_campaign":"META%20Campaign","utm_campaign_normalized":"META Campaign","utm_term":"%E1%84%8F%E1%85%A9%E1%86%AF%E1%84%83%E1%85%B3","utm_term_normalized":"콜드","utm_content":"image%25201","utm_content_normalized":"image%201"}'::jsonb)`, [landingId]);
    await db.query(`insert into public.landing_campaign_meta_daily(campaign_id,day,campaign_name,adset_name,creative_name,meta_campaign_id,meta_adset_id,meta_ad_id,impressions,link_clicks,spend,registrations,registration_cost,registration_available)
      values($1,'2026-09-15','Meta campaign label','Meta set','Meta image','campaign-meta-1','adset-1','ad-1',100,10,500,2,250,true),
      ($1,'2026-09-15','Meta campaign label','Meta set','Meta image 2','campaign-meta-1','adset-2','ad-2',20,2,100,0,null,false)`, [campaignId]);

    const decoded = await db.query(`select public.edu_decode_landing_utm_once('%ED%95%9C%EA%B8%80+%2520') value,
      public.edu_decode_landing_utm_once('%ZZ') malformed`);
    assert.deepEqual(decoded.rows[0], { value: '한글+%20', malformed: '%ZZ' });
    const report = await db.query(`select public.edu_marketing_dashboard($1,'2026-09-15','2026-09-15',null,null,null,null,null,null,null,null) report`, [campaignId]);
    const rows = report.rows[0].report.performance;
    assert.equal(rows.length, 2, 'one matched pair and one Meta-only ad row, with no fuzzy name join');
    const joined = rows.find(row => row.sessions === 1);
    assert.ok(joined);
    assert.equal(joined.sessions, 1);
    assert.equal(joined.spend, 500);
    assert.equal(joined.ad_type, 'cold');
    assert.equal(joined.registration_available, true);
    const metaOnly = rows.find(row => row.spend === 100);
    assert.equal(metaOnly.sessions, 0);
    assert.equal(metaOnly.registration_available, false);
    const filtered = await db.query(`select public.edu_marketing_dashboard($1,'2026-09-15','2026-09-15',null,null,array['META Campaign']::text[],null,null,null,null,null) report`, [campaignId]);
    assert.equal(filtered.rows[0].report.performance.length, 1);
    const readReport = async (filter = false) => (await db.query(`select public.edu_marketing_dashboard($1,'2026-09-15','2026-09-15','2026-09-14','2026-09-14',null,null,null,$2::text[]) report`, [campaignId,filter?['image%201']:null])).rows[0].report;
    await db.query(`insert into public.landing_campaign_actuals(campaign_id,day,kakao_members,new_payments,existing_payments) values($1,'2026-09-14',10,null,null),($1,'2026-09-15',12,0,null)`,[campaignId]);
    await db.query(`insert into public.funnel_sessions(landing_id,created_at,visitor_id,clicks,layout_ver,attribution) select $1,'2026-09-15 03:00:00+00',md5(i::text)::uuid,i%2,1,jsonb_build_object('utm_campaign','한글 캠페인+literal','utm_term','광고 세트 이름','utm_content','소재 이름') from generate_series(1,2000) i`,[landingId]);
    const started = performance.now();
    const baseline = await readReport(), filteredBaseline = await readReport(true);
    const beforeMs = performance.now()-started;
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261012022422_edu_marketing_query_performance.sql', import.meta.url),'utf8'));
    const optimizedStarted=performance.now();
    const optimized=await readReport(), filteredOptimized=await readReport(true);
    console.log(JSON.stringify({benchmark:'2001 synthetic sessions / two filtered reports',beforeMs,afterMs:performance.now()-optimizedStarted}));
    for (const [before,after] of [[baseline,optimized],[filteredBaseline,filteredOptimized]]) {
      const {ui,...contract}=after;
      assert.deepEqual(contract,before,'existing counts, filters, Meta and manual amounts are unchanged');
      assert.equal(ui.period_actuals.kakao_delta,2);
      assert.equal(ui.period_actuals.payments,0,'explicit zero stays zero');
      assert.equal(ui.previous_day_members['2026-09-15'],10);
      assert.equal(ui.actual_presence.new_payments,true);
      assert.equal(ui.actual_presence.existing_payments,false);
      assert.deepEqual(ui.daily_a,[]);
    }
    // Repeated encoded historical values are decoded once; cached normalized values
    // (including empty strings) and raw-key matching must keep their precedence.
    await db.query(`insert into public.funnel_sessions(landing_id,created_at,visitor_id,clicks,layout_ver,attribution)
      select $1,'2026-09-10 03:00:00+00',md5(('encoded-'||i)::text)::uuid,i%2,1,
      case when i%3=0 then '{"utm_campaign":"META%20Campaign","utm_campaign_normalized":"","utm_term":"%E1%84%8F%E1%85%A9%E1%86%AF%E1%84%83%E1%85%B3","utm_content":"image%25201"}'::jsonb
      when i%3=1 then '{"utm_campaign":"META%20Campaign","utm_term":"%E1%84%8F%E1%85%A9%E1%86%AF%E1%84%83%E1%85%B3","utm_content":"image%25201"}'::jsonb
      else '{"utm_campaign":"%ZZ+literal","utm_term_normalized":"광고 세트 이름","utm_content_normalized":"소재 이름"}'::jsonb end
      from generate_series(1,4000)i`,[landingId]);
    const wideReport = async (filters = [null,null,null,null,null,null]) => (await db.query(
      `select public.edu_marketing_dashboard($1,'2026-09-09','2026-09-15','2026-09-02','2026-09-08',$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::integer[]) report`,
      [campaignId,...filters])).rows[0].report;
    const filterCases = [
      [null,null,null,null,null,null], [['META Campaign'],null,null,null,null,null],
      [[''],null,null,null,null,null], [null,['cold'],null,null,null,null],
      [null,null,['콜드'],null,null,null], [null,null,null,['image%201'],null,null],
      [null,null,null,null,['unknown'],[1]], [['%ZZ+literal'],null,null,null,null,null],
    ];
    const previousReports = [];
    for (const filters of filterCases) previousReports.push(await wideReport(filters));
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261012042500_edu_marketing_distinct_utm_decoding.sql', import.meta.url),'utf8'));
    for (let i=0;i<filterCases.length;i++) assert.deepEqual(await wideReport(filterCases[i]),previousReports[i],`distinct decoding preserves the entire report: case ${i}`);
    assert.equal((await db.query(`select has_function_privilege('anon','public.edu_marketing_dashboard(uuid,date,date,date,date,text[],text[],text[],text[],text[],integer[])','EXECUTE') allowed`)).rows[0].allowed,false);

    const noData=(await db.query(`select public.edu_marketing_dashboard($1,'2026-09-16','2026-09-16') report`,[campaignId])).rows[0].report;
    assert.equal(noData.ui.period_actuals.payments,null,'missing payments do not become zero');
    assert.equal(noData.ui.last_collected_at,null);
    assert.equal((await db.query("select edu_decode_landing_utm_once('한글+literal') value")).rows[0].value,'한글+literal');

  } finally {
    await db.close();
  }
});
