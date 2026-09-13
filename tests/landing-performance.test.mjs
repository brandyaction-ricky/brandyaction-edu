import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(['.ts', '.tsx'].map(extension => base + extension).find(file => fs.existsSync(file)), mocks);
    }
    return require(name);
  });
  return exports;
}
const logic = load('lib/landing-performance.ts');
const id = 'aaaaaaaa-aaaa-4000-8000-000000000001';
const empty = { summary: { visitors: 0, clicks: 0, converted_visitors: 0, sessions: 0, measured_sessions: 0, avg_dwell_ms: null, avg_scroll_depth: null }, daily: [{ day: '2026-09-13', visitors: 0, clicks: 0 }], sources: [], last_event_at: null, range: { startDay: '2026-09-13', endDay: '2026-09-13' } };

test('performance periods include today in KST and reject unbounded queries', () => {
  const now = new Date('2026-09-13T15:01:00Z');
  const seven = logic.performanceRange('7', now);
  assert.equal(seven.startDay, '2026-09-08'); assert.equal(seven.endDay, '2026-09-14');
  assert.equal(seven.start, '2026-09-07T15:00:00.000Z'); assert.equal(seven.end, '2026-09-14T15:00:00.000Z');
  for (const days of ['7', '30', '90']) { const range = logic.performanceRange(days, now); assert.equal((Date.parse(range.end) - Date.parse(range.start)) / 86400000, Number(days)); }
  for (const days of ['', '1', '365', '7junk', '-1']) assert.throws(() => logic.performanceRange(days, now));
});

test('conversion uses distinct converted visitors and engagement preserves unknown versus zero', () => {
  assert.equal(logic.conversionRate({ visitors: 4, clicks: 17, converted_visitors: 2 }), 50);
  assert.equal(logic.conversionRate(empty.summary), 0);
  assert.equal(logic.engagementLabel(null, 2, 'time'), '미수집');
  assert.equal(logic.engagementLabel(null, 0, 'percent'), '0%');
  assert.equal(logic.engagementLabel(0, 2, 'time'), '0s');
  assert.equal(logic.engagementLabel(12400, 2, 'time'), '12s');
});

test('page engagement excludes background time, retains maximum depth and bounds restored values', () => {
  const { createEngagementMeter } = load('lib/landing-engagement.ts');
  const meter = createEngagementMeter(null, 0);
  assert.deepEqual(meter.sample(true, 10, 0), { dwellMs: 0, scrollPct: 10 });
  assert.deepEqual(meter.sample(true, 75, 1000), { dwellMs: 1000, scrollPct: 75 });
  assert.deepEqual(meter.sample(false, 90, 2000), { dwellMs: 2000, scrollPct: 75 });
  assert.deepEqual(meter.sample(true, 20, 60000), { dwellMs: 2000, scrollPct: 75 });
  assert.deepEqual(meter.sample(true, 55, 63000), { dwellMs: 5000, scrollPct: 75 });
  const restored = createEngagementMeter({ dwellMs: 5000, scrollPct: 75 }, 0);
  assert.equal(restored.sample(true, 10, 0).dwellMs, 5000);
  const malformed = createEngagementMeter({ dwellMs: Infinity, scrollPct: -3 }, 0);
  assert.deepEqual(malformed.sample(true, Infinity, 0), { dwellMs: 0, scrollPct: 0 });
});

test('performance UI matches reference cards and removes all CTA/detail registration forms', () => {
  const { LandingAdmin } = load('app/ui/landing/admin.tsx');
  const admin = renderToStaticMarkup(React.createElement(LandingAdmin));
  for (const value of ['Marketing Performance', '7D', '30D', '90D']) assert.ok(admin.includes(value));
  assert.doesNotMatch(admin, /<form|type="file"|CTA·이미지 저장|랜딩·Pixel 설정|발행 이력/);
  const source = fs.readFileSync('app/ui/landing/admin.tsx', 'utf8');
  assert.doesNotMatch(source, /LiveSetup|UploadField|method:\s*['"]POST|initial\.revision/);
  assert.match(source, /result\.key === requestKey/); assert.match(source, /controller\.abort/);
  const { PerformanceDashboard } = load('app/ui/landing/performance-dashboard.tsx');
  const zero = renderToStaticMarkup(React.createElement(PerformanceDashboard, { report: empty }));
  for (const value of ['Unique Visitors', 'CTA Clicks', 'Conversion Rate', 'Avg Dwell Time', '평균 스크롤 깊이', 'Traffic &amp; Conversions', 'Top Sources', 'No traffic data yet']) assert.ok(zero.includes(value));
  assert.doesNotMatch(zero, /NaN|Infinity/); assert.match(zero, /<caption>/);
  const real = renderToStaticMarkup(React.createElement(PerformanceDashboard, { report: { ...empty, summary: { ...empty.summary, visitors: 4, clicks: 17, converted_visitors: 2, sessions: 5 }, sources: [{ source: '%3Cscript%3E', visitors: 4, clicks: 17 }] } }));
  assert.match(real, /50\.0%/); assert.match(real, /미수집/); assert.match(real, /&lt;script&gt;/); assert.doesNotMatch(real, /<script>/);
});

function routeWith({ allowed = true, course = { id }, rpcError = null } = {}) {
  const calls = [];
  const db = { from(table) {
    calls.push(['from', table]);
    const chain = { select(columns) { calls.push(['select', columns]); return chain; }, eq(...args) { calls.push(['eq', ...args]); return chain; }, is(...args) { calls.push(['is', ...args]); return chain; }, maybeSingle: async () => ({ data: course, error: null }) };
    return chain;
  }, rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: rpcError ? null : empty, error: rpcError }; } };
  return { calls, route: load('app/api/landing/performance/route.ts', { '@/lib/operator-permissions': { getOperatorUser: async scope => { assert.equal(scope, 'marketing'); return allowed ? { id } : null; } }, '@/lib/supabase/admin': { createAdminClient: () => db } }) };
}
test('performance API is read-only, permission-scoped and never returns fake success on DB failure', async () => {
  const denied = routeWith({ allowed: false });
  assert.equal((await denied.route.GET(new Request('https://dev.example/api/landing/performance'))).status, 403); assert.equal(denied.calls.length, 0);
  const good = routeWith(); assert.equal(good.route.POST, undefined);
  for (const query of ['landing=bad', `landing=${id}&days=365`]) assert.equal((await good.route.GET(new Request('https://dev.example/api/landing/performance?' + query))).status, 400);
  assert.equal(good.calls.length, 0);
  const response = await good.route.GET(new Request(`https://dev.example/api/landing/performance?landing=${id}&days=30`));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.ok(good.calls.some(call => call[0] === 'rpc' && call[1] === 'edu_landing_performance'));
  assert.ok(good.calls.some(call => call[0] === 'eq' && call[1] === 'list_price' && call[2] === 0));
  assert.ok(good.calls.some(call => call[0] === 'is' && call[1] === 'archived_at' && call[2] === null));
  assert.ok(!good.calls.some(call => call[0] === 'from' && call[1] === 'funnel_events'));
  const broken = routeWith({ rpcError: { message: 'unavailable' } });
  const failure = await broken.route.GET(new Request(`https://dev.example/api/landing/performance?landing=${id}`));
  assert.equal(failure.status, 503); assert.equal((await failure.json()).summary, undefined);
  const missing = routeWith({ course: null });
  assert.equal((await missing.route.GET(new Request(`https://dev.example/api/landing/performance?landing=${id}`))).status, 404);
});
