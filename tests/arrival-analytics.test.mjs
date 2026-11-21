import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArrivalBatch } from '../features/campus/arrival/analytics.ts';
import * as analytics from '../features/campus/arrival/analytics.ts';
import fs from 'node:fs';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
const reportModule = {};
new Function('exports', 'require', ts.transpileModule(fs.readFileSync(new URL('../features/campus/arrival/analytics-report.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(reportModule, name => { assert.equal(name, './analytics'); return analytics; });
const { buildArrivalReport } = reportModule;
const routeSource = fs.readFileSync(new URL('../app/api/admin/campus/arrival-analytics/route.ts', import.meta.url), 'utf8');
const compiledRoute = ts.transpileModule(routeSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
function arrivalReportRoute(readPage) {
  const db = createClient('https://synthetic.example.test', 'test-only', {
    auth: {persistSession: false},
    global: {fetch: async input => {
      const url = new URL(input);
      if (url.pathname.endsWith('/edu_campus_analytics_settings')) return Response.json([{enabled: true}]);
      assert.ok(url.pathname.endsWith('/edu_arrival_events'));
      return readPage(url.searchParams);
    }},
  });
  const deps = {
    '@/lib/operator-permissions': {getOperatorUser: async () => ({id: 'qa'})},
    '@/lib/supabase/admin': {createAdminClient: () => db},
    '@/features/campus/arrival/analytics-report': reportModule,
    '@/features/campus/webinar/domain': {fail: message => { throw Error(message); }},
    '@/features/campus/webinar/server': {privateReply: body => Response.json(body), problem: () => Response.json({error: 'unavailable'}, {status: 503})},
  };
  const route = {};
  new Function('exports', 'require', compiledRoute)(route, name => { assert.ok(deps[name], name); return deps[name]; });
  return (from, to = from) => route.GET(new Request('https://synthetic.example.test/api/admin/campus/arrival-analytics?' + new URLSearchParams({from, to})));
}
const sid = n => `00000000-0000-4000-8000-00000000000${n}`;
test('browser batches are checked: kinds, stations, label length, utm only on entry, seconds on exit', () => {
  const ok = parseArrivalBatch({ session: sid(1), events: [
    { kind: 'enter', station: 0, source: 'kakao', campaign: '5기' }, { kind: 'step', station: 2 },
    { kind: 'click', station: 2, target: '  경쟁사\n분석 보기  '.repeat(10) }, { kind: 'exit', station: 2, seconds: 90, source: 'x' }] });
  assert.equal(ok.events[0].source, 'kakao'); assert.equal(ok.events[2].target.length, 60); assert.equal(ok.events[3].source, undefined);
  for (const bad of [{ session: 'x', events: [{ kind: 'enter', station: 0 }] }, { session: sid(1), events: [] }, { session: sid(1), events: [{ kind: 'buy', station: 0 }] },
    { session: sid(1), events: [{ kind: 'step', station: 12 }] }, { session: sid(1), events: [{ kind: 'exit', station: 1 }] }, { session: sid(1), events: Array(41).fill({ kind: 'step', station: 1 }) }])
    assert.equal(parseArrivalBatch(bad), null);
});
test('report: funnel drop-off, audience split, daily (KST), button ranking and sources', () => {
  const at = (h, m = 0) => new Date(Date.UTC(2026, 10, 18, h, m)).toISOString();
  const rows = [
    { session_id: sid(1), kind: 'enter', station: 0, source: 'kakao', campaign: 'room', occurred_at: at(1) },
    { session_id: sid(1), kind: 'click', station: 0, target: 'audience:work', occurred_at: at(1, 1) },
    ...[1, 2, 3, 4, 7].map((st, i) => ({ session_id: sid(1), kind: 'step', station: st, occurred_at: at(1, 2 + i) })),
    { session_id: sid(1), kind: 'click', station: 2, target: '스파이 보내기', occurred_at: at(1, 3) },
    { session_id: sid(1), kind: 'exit', station: 7, seconds: 400, occurred_at: at(1, 9) },
    { session_id: sid(2), kind: 'enter', station: 0, occurred_at: at(16) },
    { session_id: sid(2), kind: 'click', station: 0, target: 'audience:business', occurred_at: at(16, 1) },
    { session_id: sid(2), kind: 'step', station: 1, occurred_at: at(16, 2) },
    { session_id: sid(2), kind: 'click', station: 1, target: '스파이 보내기', occurred_at: at(16, 3) },
    { session_id: sid(3), kind: 'enter', station: 0, occurred_at: at(16, 30) },
  ].map(r => ({ target: null, seconds: null, source: null, medium: null, campaign: null, ...r }));
  const r = buildArrivalReport(rows, ['2026-11-18', '2026-11-19']);
  assert.deepEqual(r.summary, { sessions: 3, started: 2, lounge: 1, clicks: 4, avgSeconds: Math.round((400 + 180 + 0) / 3) });
  assert.deepEqual(r.funnel.map(f => [f.label, f.reached, f.stoppedHere]), [['첫 화면', 3, 1], ['팀장', 2, 1], ['경쟁사 스파이', 1, 0], ['콘텐츠 담당자', 1, 0], ['정본', 1, 0], ['웰컴 라운지', 1, 0]]);
  assert.deepEqual(r.daily.map(d => [d.date, d.sessions, d.lounge]), [['2026-11-18', 1, 1], ['2026-11-19', 2, 0]]);
  assert.deepEqual(r.audiences.filter(a => a.sessions).map(a => [a.id, a.sessions, a.lounge]), [['work', 1, 1], ['business', 1, 0]]);
  assert.deepEqual(r.buttons.map(b => [b.label, b.station, b.count]), [['스파이 보내기', 2, 1], ['스파이 보내기', 1, 1]]);
  assert.deepEqual(r.sources.map(x => [x.source, x.sessions]), [['직접 방문', 2], ['kakao · room', 1]]);
});

test('report route reads every short API page and counts a cross-midnight visit once per selected period', async () => {
  const events = [];
  function add(session, date, kind, station, repeat = 1) {
    for (let i = 0; i < repeat; i++) {
      const cursor_id = String(9007199254740993n + BigInt(events.length));
      events.push({cursor_id, session_id: sid(session), occurred_at: date, kind, station, target: null});
    }
  }
  const day19 = '2024-11-19T00:00:00.000Z', day20 = '2024-11-20T00:00:00.000Z';
  const midnight = '2024-11-20T15:00:00.000Z';
  add(1, day19, 'enter', 0); add(1, day19, 'step', 1);
  add(2, day20, 'enter', 0); add(2, day20, 'step', 1); add(2, day20, 'click', 1, 600);
  add(3, '2024-11-20T14:59:59.999Z', 'enter', 0);
  add(3, midnight, 'step', 7); add(3, midnight, 'click', 7);
  add(4, midnight, 'enter', 0); add(4, midnight, 'step', 7); add(4, midnight, 'click', 7, 600);
  const report = arrivalReportRoute(params => {
    assert.equal(params.get('order'), 'id.asc');
    assert.ok(params.get('select').split(',').includes('cursor_id:id::text'));
    const [start, end] = params.getAll('occurred_at');
    assert.ok(start.startsWith('gte.') && end.startsWith('lt.'));
    const after = BigInt(params.get('id')?.slice(3) ?? 0);
    const eligible = events.filter(e => BigInt(e.cursor_id) > after && e.occurred_at >= start.slice(4) && e.occurred_at < end.slice(3));
    return Response.json(eligible.slice(0, Math.min(400, Number(params.get('limit')))));
  });
  const snapshots = [];
  for (const [from, to] of [['2024-11-19', '2024-11-19'], ['2024-11-20', '2024-11-20'], ['2024-11-21', '2024-11-21'], ['2024-11-19', '2024-11-21']]) {
    const response = await report(from, to);
    assert.equal(response.status, 200);
    const {summary, truncated} = await response.json();
    assert.equal(truncated, false);
    snapshots.push([summary.sessions, summary.started, summary.lounge, summary.clicks]);
  }
  assert.deepEqual(snapshots, [[1, 1, 0, 0], [2, 1, 0, 600], [2, 2, 2, 601], [4, 4, 2, 1201]]);
});

test('report route fails the whole period when a later page fails', async () => {
  const report = arrivalReportRoute(params => params.has('id')
    ? Response.json({message: 'query failed'}, {status: 400})
    : Response.json([{cursor_id: '1', session_id: sid(1), occurred_at: '2024-11-19T00:00:00Z', kind: 'enter', station: 0}]));
  const response = await report('2024-11-19');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).summary, undefined);
});

test('the 100,000-event report warning requires an actual extra event', async () => {
  for (const total of [100000, 100001]) {
    const report = arrivalReportRoute(params => {
      const after = Number(params.get('id')?.slice(3) ?? 0);
      const length = Math.min(total - after, Number(params.get('limit')), 1000);
      return Response.json(Array.from({length}, (_, i) => ({
        cursor_id: String(after + i + 1), session_id: sid(1), occurred_at: '2024-11-19T00:00:00Z', kind: 'click', station: 0,
      })));
    });
    const response = await report('2024-11-19');
    assert.equal(response.status, 200);
    const {summary, truncated} = await response.json();
    assert.equal(summary.clicks, 100000);
    assert.equal(truncated, total > 100000);
  }
});
