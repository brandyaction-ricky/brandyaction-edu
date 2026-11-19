import {ARRIVAL_AUDIENCE_LABELS, ARRIVAL_STATIONS} from './analytics';

export type ArrivalRow = {session_id: string; kind: 'enter' | 'step' | 'click' | 'exit'; station: number; target: string | null; seconds: number | null; source: string | null; medium: string | null; campaign: string | null; occurred_at: string};
type Audience = keyof typeof ARRIVAL_AUDIENCE_LABELS;
const kstDate = (iso: string) => new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 10);
const LOUNGE = 7;
const order = ARRIVAL_STATIONS.map(s => s.station as number);
const reachIndex = (station: number) => { let at = -1; order.forEach((s, i) => { if (s <= station) at = i; }); return at; };

/** Aggregates raw visit rows for the admin view. Sessions are tab visits, not people. */
export function buildArrivalReport(rows: ArrivalRow[], days: string[]) {
  type S = {first: string; date: string; furthest: number; clicks: number; audience?: Audience; seconds: number; source: string};
  const sessions = new Map<string, S>();
  const sorted = [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  for (const r of sorted) {
    let s = sessions.get(r.session_id);
    if (!s) { s = {first: r.occurred_at, date: kstDate(r.occurred_at), furthest: -1, clicks: 0, seconds: 0, source: '직접 방문'}; sessions.set(r.session_id, s); }
    if (r.kind === 'enter' && (r.source || r.campaign)) s.source = [r.source, r.campaign].filter(Boolean).join(' · ');
    if (r.kind === 'enter' || r.kind === 'step') s.furthest = Math.max(s.furthest, reachIndex(r.kind === 'enter' ? 0 : r.station));
    if (r.kind === 'click') { s.clicks++; if (r.target?.startsWith('audience:')) { const a = r.target.slice(9); if (a in ARRIVAL_AUDIENCE_LABELS) s.audience = a as Audience; } }
    s.seconds = Math.max(s.seconds, r.kind === 'exit' ? r.seconds ?? 0 : Math.round((Date.parse(r.occurred_at) - Date.parse(s.first)) / 1000));
  }
  const list = [...sessions.values()];
  const lounge = (s: S) => s.furthest >= reachIndex(LOUNGE);
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const funnel = ARRIVAL_STATIONS.map((st, i) => {
    const reached = list.filter(s => s.furthest >= i).length, stopped = list.filter(s => s.furthest === i).length;
    return {station: st.station, label: st.label, reached, stoppedHere: i === ARRIVAL_STATIONS.length - 1 ? 0 : stopped};
  });
  const daily = days.map(date => {
    const ds = list.filter(s => s.date === date);
    return {date, sessions: ds.length, started: ds.filter(s => s.furthest >= 1).length, lounge: ds.filter(lounge).length, clicks: ds.reduce((a, s) => a + s.clicks, 0)};
  });
  const audiences = (Object.keys(ARRIVAL_AUDIENCE_LABELS) as Audience[]).map(id => {
    const as = list.filter(s => s.audience === id);
    return {id, label: ARRIVAL_AUDIENCE_LABELS[id], sessions: as.length, lounge: as.filter(lounge).length, avgSeconds: avg(as.map(s => s.seconds))};
  });
  const buttons = new Map<string, {station: number; label: string; count: number; sessions: Set<string>}>();
  for (const r of rows) {
    if (r.kind !== 'click' || !r.target || r.target.startsWith('audience:')) continue;
    const key = `${r.station}\u0000${r.target}`, b = buttons.get(key) ?? {station: r.station, label: r.target, count: 0, sessions: new Set<string>()};
    b.count++; b.sessions.add(r.session_id); buttons.set(key, b);
  }
  const sources = new Map<string, {source: string; sessions: number; lounge: number}>();
  for (const s of list) { const v = sources.get(s.source) ?? {source: s.source, sessions: 0, lounge: 0}; v.sessions++; if (lounge(s)) v.lounge++; sources.set(s.source, v); }
  return {
    summary: {sessions: list.length, started: list.filter(s => s.furthest >= 1).length, lounge: list.filter(lounge).length, clicks: list.reduce((a, s) => a + s.clicks, 0), avgSeconds: avg(list.map(s => s.seconds))},
    daily, funnel, audiences,
    buttons: [...buttons.values()].map(b => ({station: b.station, label: b.label, count: b.count, sessions: b.sessions.size})).sort((a, b) => b.count - a.count).slice(0, 60),
    sources: [...sources.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 20),
  };
}
export type ArrivalReport = ReturnType<typeof buildArrivalReport> & {trackingEnabled: boolean; from: string; to: string; truncated: boolean};
