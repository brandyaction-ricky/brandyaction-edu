import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArrivalBatch } from '../features/campus/arrival/analytics.ts';
import * as analytics from '../features/campus/arrival/analytics.ts';
import fs from 'node:fs';
import ts from 'typescript';
const reportModule = {};
new Function('exports', 'require', ts.transpileModule(fs.readFileSync(new URL('../features/campus/arrival/analytics-report.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(reportModule, name => { assert.equal(name, './analytics'); return analytics; });
const { buildArrivalReport } = reportModule;
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
