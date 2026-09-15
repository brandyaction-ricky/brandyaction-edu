import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync));
    }
    return require(name);
  });
  return exports;
}
const { parseSampleMin, periodActuals, funnelRate, sortPerformance } = load('lib/landing-operations-phase1.ts');
test('sample threshold accepts inclusive bounds and rejects missing, fractional and abusive values', () => {
  assert.equal(parseSampleMin(null), 30);
  for (const value of ['1', '30', '10000']) assert.equal(parseSampleMin(value), Number(value));
  for (const value of ['', '0', '-1', '1.5', '1e2', '10001', 'NaN', ' 2', 'Infinity']) assert.equal(parseSampleMin(value), null);
});
test('conversion sorting places insufficient rows last in either direction, preserves rows and uses clicked sessions', () => {
  const rows = [
    { creative: 'small', sessions: 2, cta_click_sessions: 2, cta_clicks: 10 },
    { creative: 'low', sessions: 40, cta_click_sessions: 4, cta_clicks: 100 },
    { creative: 'high', sessions: 60, cta_click_sessions: 20, cta_clicks: 20 },
    { creative: 'zero', sessions: 0, cta_click_sessions: 0, cta_clicks: 0 },
  ];
  assert.deepEqual(sortPerformance(rows, 'conversion', 'desc').map(r => r.creative), ['high', 'low', 'small', 'zero']);
  assert.deepEqual(sortPerformance(rows, 'conversion', 'asc').map(r => r.creative), ['low', 'high', 'small', 'zero']);
  assert.equal(sortPerformance(rows, 'conversion', 'desc', 1)[0].creative, 'small');
  assert.equal(sortPerformance(rows, 'sessions', 'asc')[0].creative, 'zero');
  assert.deepEqual(rows.map(r => r.creative), ['small', 'low', 'high', 'zero']);
});
test('funnel snapshots respect end date and payment flow respects both inclusive boundaries', () => {
  const rows = [
    { day: '2026-09-16', kakao_members: 100, new_payments: 20, existing_payments: 5 },
    { day: '2026-09-10', kakao_members: 80, new_payments: 9, existing_payments: 1 },
    { day: '2026-09-15', kakao_members: null, new_payments: 2, existing_payments: 1 },
  ];
  assert.deepEqual(periodActuals(rows, '2026-09-15', '2026-09-15'), { kakao_members: 80, kakao_day: '2026-09-10', payments: 3 });
  assert.equal(periodActuals(rows, '2026-09-10', '2026-09-15').payments, 13);
  assert.deepEqual(periodActuals([], '2026-09-15', '2026-09-15'), { kakao_members: null, kakao_day: null, payments: null });
  assert.equal(periodActuals([{ day: '2026-09-15', kakao_members: 0, new_payments: 0, existing_payments: null }], '2026-09-15', '2026-09-15').payments, 0);
});
test('funnel rates distinguish measured zero, no data, zero denominator and snapshot ratios above 100%', () => {
  assert.equal(funnelRate(0, 10), 0); assert.equal(funnelRate(1, 0), null);
  assert.equal(funnelRate(null, 10), null); assert.equal(funnelRate(1, undefined), null);
  assert.equal(funnelRate(80, 20), 400);
});
const row = { campaign: 'qa', adset: '광고세트', creative: '소재', ad_type: 'unclassified', sessions: 2, visitors: 1, cta_click_sessions: 1, cta_clicks: 100, avg_dwell_ms: null, avg_scroll_depth: null, impressions: 0, link_clicks: 0, spend: 0 };
const summary = { has_data: true, sessions: 100, visitors: 80, cta_click_sessions: 20, cta_clicks: 200, converted_visitors: 16, spend: 0, meta_impressions: 0, meta_link_clicks: 0 };
const report = {
  campaign: { meta_campaign_ids: [], meta_ad_account_id: null }, summary_b: summary, summary_a: null,
  performance: [row], daily: [], actuals: [], options: {}, range: { startDay: '2026-09-15', endDay: '2026-09-15' },
  data_state: { sessions_exist: true, meta_exists: false },
  campaign_summary: { new_payments: 31, existing_payments: 7, revenue: 100, roas: null, spend: 0 },
  ui: { errors: {}, last_collected_at: null, actual_presence: { new_payments: true, existing_payments: true }, period_actuals: { kakao_members: 80, kakao_day: '2026-09-10', payments: 3 } },
};
test('funnel renders ordered session-based quantities, separate cumulative data, and hides unattributed conversion under filters', () => {
  const { PerformanceDashboard } = load('app/ui/landing/performance-dashboard.tsx');
  const render = filtered => renderToStaticMarkup(React.createElement(PerformanceDashboard, { report, compare: false, filtered, onClassify: async () => true }));
  const html = render(false);
  const positions = ['1. 방문', '2. CTA 클릭', '3. 카카오톡방', '4. 결제'].map(label => html.indexOf(label));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  assert.match(html, /방문 → CTA 20.0%/); assert.match(html, /CTA → 카톡방 400.0%/); assert.match(html, /카톡방 → 결제 3.8%/);
  assert.match(html, /연동 전/); assert.match(html, /누적 매출/); assert.match(html, /CTA 클릭 횟수/);
  const filtered = render(true);
  assert.doesNotMatch(filtered, /CTA → 카톡방|카톡방 → 결제/); assert.match(filtered, /실측값은 소재·기기 필터가 적용되지 않습니다/);
});
test('material table exposes sort direction, insufficient count, saved classification and raw count without deleting rows', () => {
  const { PerformanceTable } = load('app/ui/landing/performance-dashboard.tsx');
  const html = renderToStaticMarkup(React.createElement(PerformanceTable, { report, onClassify: async () => true, sampleMin: '30' }));
  assert.match(html, /aria-sort="descending"/); assert.match(html, /aria-sort="none"/);
  assert.match(html, /표본 부족/); assert.match(html, /방문 2회/); assert.match(html, /전체 클릭 100회/);
  assert.match(html, /저장됨 · 미분류/); assert.match(html, /1~10,000|원본 수치와 CSV는 유지/);
});
