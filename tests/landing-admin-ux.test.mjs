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
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/') || name.startsWith('.')) { const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name); return load(['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync), mocks); }
    return require(name);
  });
  return exports;
}
const state = load('lib/landing-admin-state.ts');
const server = load('lib/landing-performance-ui-server.ts');
const campaign = { id: 'bbbbbbbb-bbbb-4000-8000-000000000002', landing_id: 'aaaaaaaa-aaaa-4000-8000-000000000001', name: '테스트', utm_campaign: 'cold,"one', start_day: '2026-09-01', end_day: '2026-09-30', new_customer_price: 1650000, existing_customer_price: 1100000, live_peak: null, meta_ad_account_id: 'act_245402678098216', meta_campaign_id: null, meta_sync_status: 'not_configured', meta_last_synced_at: null, meta_sync_error: null };
const makeQuery = () => new URLSearchParams({ landing: campaign.landing_id, campaign: campaign.id, start: '2026-09-08', end: '2026-09-14', compare_start: '2026-09-01', compare_end: '2026-09-07' });

test('legacy metrics redirect preserves repeated filters and safe internal destination', () => {
  const url = state.metricsRedirect({ course: 'class', campaign: 'campaign', start: '2026-09-08', end: '2026-09-14', adset: ['a&b', 'c'], creative: ['a/b'], tab: 'settings', next: 'https://evil.test', testmode: '1' });
  assert.equal(url.split('?')[0], '/admin/landing');
  const q = new URL(url, 'https://example.test').searchParams;
  assert.equal(q.get('tab'), 'actuals'); assert.equal(q.get('course'), 'class'); assert.deepEqual(q.getAll('adset'), ['a&b', 'c']); assert.equal(q.get('testmode'), '1');
});
test('tab parsing rejects unknown and prototype property names', () => { for (const key of ['constructor', '__proto__', 'bad', null]) assert.equal(state.parseTab(key), 'dashboard'); assert.equal(state.parseTab('actuals'), 'actuals'); });
test('unsaved confirmation uses an accessible in-page dialog with explicit choices', () => {
  const { DiscardConfirmation } = load('app/ui/landing/tracking-controls.tsx');
  const html = renderToStaticMarkup(React.createElement(DiscardConfirmation, { message: '입력 유지 확인', onCancel() {}, onDiscard() {} }));
  assert.match(html, /<dialog[^>]*aria-labelledby/); assert.match(html, /계속 편집/); assert.match(html, /변경사항 버리기/);
  for (const file of ['admin.tsx', 'tracking-operations.tsx']) assert.doesNotMatch(fs.readFileSync('app/ui/landing/' + file, 'utf8'), /\bconfirm\(/);
});
test('all six multi filters round-trip without changing raw UTM values', () => {
  const source = new URLSearchParams('adset=a%2520b&adset=c&creative=1&device=mobile&device=tablet&layout=2&utm_campaign=sept&ad_type=cold');
  const filters = state.readFilters(source), output = new URLSearchParams(); state.appendFilters(output, filters);
  assert.deepEqual(state.readFilters(output), filters); assert.deepEqual(filters.adset, ['a%20b', 'c']);
});
test('period restoration preserves custom dates, compare and validation failures', () => {
  const period = state.readPeriod(makeQuery(), campaign); assert.equal(period.compare, true); assert.equal(state.periodError(period, campaign), '');
  assert.match(state.periodError({ ...period, start: '2026-08-31' }, campaign), /캠페인/);
  assert.match(state.periodError({ ...period, compareEnd: '2026-09-06' }, campaign), /같은 길이/);
  assert.match(state.periodError({ ...period, compareStart: '2026-09-08', compareEnd: '2026-09-14' }, campaign), /이전/);
  const invalid = state.readPeriod(new URLSearchParams('start=2026-99-99&end=bad'), campaign); assert.equal(invalid.start, '2026-99-99'); assert.ok(state.periodError(invalid, campaign));
});
test('KST operating state is derived at day boundaries without mutable status', () => {
  assert.equal(state.campaignStatus(campaign, new Date('2026-08-31T14:59:00Z')), '시작 전');
  assert.equal(state.campaignStatus(campaign, new Date('2026-08-31T15:00:00Z')), '운영 중');
  assert.equal(state.campaignStatus(campaign, new Date('2026-09-30T15:00:00Z')), '종료');
  assert.equal(state.campaignStatus(), '설정 필요');
});
test('Meta labels never expose status enums and prioritize missing campaign ID', () => {
  assert.equal(state.metaStatus(campaign), 'Meta 미연동');
  for (const [status, label] of [['not_configured', '설정 필요'], ['idle', '동기화 대기'], ['syncing', '동기화 중'], ['success', '동기화 성공'], ['failed', '동기화 오류']]) assert.equal(state.metaStatus({ ...campaign, meta_campaign_id: '123', meta_sync_status: status }), label);
});
test('actual drawer submits only explicit changes, keeps zero and separates clears', () => {
  const form = new FormData(); form.set('day', '2026-09-15'); form.set('new_payments', '0'); form.set('existing_payments', ''); form.set('kakao_members', '500'); form.set('memo', '');
  assert.deepEqual(state.actualPayload(form, ['kakao_members']), { day: '2026-09-15', clear: ['kakao_members'], new_payments: '0' });
  assert.equal(state.actualRevenue({ new_payments: null, existing_payments: null, revenue: 0 }), null);
  assert.equal(state.actualRevenue({ new_payments: 0, existing_payments: null, revenue: 0 }), 0);
});
test('new and edit drawer render distinct clear controls and shared partial save semantics', () => {
  const { ActualDrawer } = load('app/ui/landing/tracking-operations.tsx');
  const props = { campaign, pending: false, onClose() {}, onSave: async () => true };
  const fresh = renderToStaticMarkup(React.createElement(ActualDrawer, { ...props, initial: null }));
  assert.doesNotMatch(fresh, /값 비우기|name="clear"/); assert.match(fresh, /<dialog/);
  const edit = renderToStaticMarkup(React.createElement(ActualDrawer, { ...props, initial: { day: '2026-09-15', kakao_members: 0, new_payments: 1, existing_payments: null, new_price_snapshot: 100, existing_price_snapshot: 200 } }));
  assert.equal((edit.match(/값 비우기/g) || []).length, 4); assert.match(edit, /현재: 0/); assert.match(edit, /신규 100원/);
});
test('settings save and sync are disabled initially, common account is read-only, marketing staff cannot mutate', () => {
  const { CampaignSettings } = load('app/ui/landing/tracking-operations.tsx');
  const html = renderToStaticMarkup(React.createElement(CampaignSettings, { campaign, canManage: false, pending: false, syncing: false, onDirty() {}, onSave: async () => true, onSync: async () => true }));
  assert.match(html, /<fieldset disabled/); assert.match(html, /aria-readonly="true"/); assert.match(html, /Meta 미연동/); assert.doesNotMatch(html, />not_configured</);
  assert.match(html, /<button[^>]*disabled[^>]*>[\s\S]*?설정 저장/);
});
test('daily A aggregation separates repeat visitor, click session and total clicks in KST', () => {
  const rows = [
    { created_at: '2026-09-01T15:00:00Z', visitor_id: 'visitor-private-1', session_id: 'session-private-1', clicks: 8 },
    { created_at: '2026-09-01T16:00:00Z', visitor_id: 'visitor-private-1', session_id: 'session-private-2', clicks: 0 },
    { created_at: '2026-09-01T14:59:00Z', visitor_id: 'visitor-private-2', session_id: 'session-private-3', clicks: 2 },
  ];
  const daily = server.dailySessions(rows);
  assert.deepEqual(daily, [{ day: '2026-09-01', sessions: 1, visitors: 1, cta_click_sessions: 1, cta_clicks: 2 }, { day: '2026-09-02', sessions: 2, visitors: 1, cta_click_sessions: 1, cta_clicks: 8 }]);
  assert.doesNotMatch(JSON.stringify(daily), /visitor-private|session-private|visitor_id|session_id/);
});
test('explicit ad classification uses exact adset/material pairs, never name heuristics', () => {
  const rows = [{ attribution: { utm_term: 'cold campaign', utm_content: 'one' } }, { attribution: null }];
  assert.deepEqual(server.filterAdTypes(rows, [], ['cold']), []);
  assert.deepEqual(server.filterAdTypes(rows, [], ['unclassified']), rows);
  assert.deepEqual(server.filterAdTypes(rows, [{ adset_key: 'cold campaign', creative_key: 'one', ad_type: 'retarget' }], ['retarget']), [rows[0]]);
});
function fakeDb(handler) {
  const calls = [];
  return { calls, from(table) { const call = { table, steps: [] }; calls.push(call); const chain = new Proxy({}, { get(_, key) { if (key === 'then') return (resolve, reject) => Promise.resolve(handler(call)).then(resolve, reject); return (...args) => { call.steps.push([key, ...args]); return chain; }; } }); return chain; } };
}
test('supplemental reads are paginated, campaign-scoped, filtered and preserve real zero presence', async () => {
  const db = fakeDb(call => {
    if (call.table === 'landing_campaign_actuals') return { data: [{ day: '2026-09-01', kakao_members: 100, new_payments: 0, existing_payments: null }, { day: '2026-09-02', kakao_members: 105, new_payments: null, existing_payments: null }], error: null };
    if (call.steps.some(step => step[0] === 'select' && step[1].includes('visitor_id'))) return { data: [{ session_id: 'private', visitor_id: 'private', created_at: '2026-09-01T03:00:00Z', last_seen_at: '2026-09-01T04:00:00Z', clicks: 3 }], error: null };
    return { data: [{ session_id: 'private', created_at: '2026-09-14T03:00:00Z', last_seen_at: '2026-09-14T04:00:00Z' }], error: null };
  });
  const query = makeQuery(); query.append('device', 'unknown'); query.append('device', 'mobile'); query.append('adset', 'set1'); query.append('layout', '2');
  const result = await server.performanceUiDetails(db, campaign, query, new AbortController().signal);
  assert.equal(result.daily_a[0].cta_clicks, 3); assert.equal(result.last_collected_at, '2026-09-14T04:00:00Z');
  assert.deepEqual(result.actual_presence, { new_payments: true, existing_payments: false }); assert.equal(result.previous_day_members['2026-09-02'], 100);
  for (const call of db.calls.filter(call => call.table === 'funnel_sessions')) {
    assert.ok(call.steps.some(step => step[0] === 'eq' && step[1] === 'landing_id' && step[2] === campaign.landing_id));
    assert.ok(call.steps.some(step => step[0] === 'in' && step[1] === 'attribution->>utm_term')); assert.ok(call.steps.some(step => step[0] === 'range'));
    assert.ok(call.steps.some(step => step[0] === 'or' && step[1].includes(JSON.stringify(campaign.utm_campaign))));
  }
  assert.doesNotMatch(JSON.stringify(result), /private|visitor_id|session_id/);
});
test('supplemental failure is regional and never returns partial values as zero', async () => {
  const db = fakeDb(() => ({ data: null, error: new Error('private provider details') }));
  const result = await server.performanceUiDetails(db, campaign, makeQuery(), new AbortController().signal);
  assert.equal(result.daily_a, null); assert.equal(result.last_collected_at, null); assert.equal(result.actual_presence, null);
  assert.ok(result.errors.trend && result.errors.collection && result.errors.actuals); assert.doesNotMatch(JSON.stringify(result), /private provider/);
});
test('supplemental daily A pagination processes a second page without double counting visitors', async () => {
  const db = fakeDb(call => {
    const select = call.steps.find(step => step[0] === 'select')?.[1] || '';
    if (!select.includes('visitor_id')) return { data: [], error: null };
    const offset = call.steps.find(step => step[0] === 'range')[1];
    return { data: offset === 0 ? Array.from({ length: 1000 }, (_, index) => ({ session_id: String(index), visitor_id: 'one', created_at: '2026-09-01T03:00:00Z', clicks: 1 })) : [{ session_id: 'last', visitor_id: 'one', created_at: '2026-09-01T04:00:00Z', clicks: 0 }], error: null };
  });
  const result = await server.performanceUiDetails(db, campaign, makeQuery(), new AbortController().signal);
  assert.equal(result.daily_a[0].sessions, 1001); assert.equal(result.daily_a[0].visitors, 1); assert.equal(result.daily_a[0].cta_click_sessions, 1000);
});
test('performance and export routes deny non-marketing requests before touching data', async () => {
  for (const file of ['app/api/landing/performance/route.ts', 'app/api/landing/performance/export/route.ts']) {
    let touched = false;
    const route = load(file, { '@/lib/operator-permissions': { getOperatorUser: async scope => { assert.equal(scope, 'marketing'); return null; } }, '@/lib/supabase/admin': { createAdminClient() { touched = true; throw Error(); } } });
    const response = await route.GET(new Request('https://example.test/api?include=ui'));
    assert.equal(response.status, 403); assert.equal(touched, false);
  }
});
test('material sort is numeric, immutable and uses click sessions for conversion', () => {
  const { sortPerformance } = load('app/ui/landing/performance-dashboard.tsx');
  const rows = [{ sessions: 20, cta_click_sessions: 1, cta_clicks: 100 }, { sessions: 3, cta_click_sessions: 2, cta_clicks: 2 }];
  assert.deepEqual(sortPerformance(rows, 'sessions', 'desc'), rows);
  assert.equal(sortPerformance(rows, 'conversion', 'desc')[0], rows[1]); assert.equal(rows[0].sessions, 20);
});
