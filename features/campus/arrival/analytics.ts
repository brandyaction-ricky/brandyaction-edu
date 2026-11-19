// 문샷 AI 직원 체험 방문 분석: 입장·단계 도달·버튼 클릭·상황 선택·이탈(CEO 11-19).
// Session-only ids, no personal data. Server stores only when campus analytics collection is on.
export const ARRIVAL_STATIONS = [
  {station: 0, label: '첫 화면'}, {station: 1, label: '팀장'}, {station: 2, label: '경쟁사 스파이'},
  {station: 3, label: '콘텐츠 담당자'}, {station: 4, label: '정본'}, {station: 7, label: '웰컴 라운지'},
] as const;
export const ARRIVAL_AUDIENCE_LABELS = {work: '직장인 · 회사 업무', business: '사업자', preparing: '창업 준비', exploring: '아이템 탐색'} as const;
export type ArrivalEventKind = 'enter' | 'step' | 'click' | 'exit';
export type ArrivalEvent = {kind: ArrivalEventKind; station: number; target?: string; seconds?: number; source?: string; medium?: string; campaign?: string};

const text = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : undefined;
/** Server-side check of one browser batch. Returns null when anything is off. */
export function parseArrivalBatch(input: unknown): {session: string; events: ArrivalEvent[]} | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const v = input as {session?: unknown; events?: unknown};
  if (typeof v.session !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.session)) return null;
  if (!Array.isArray(v.events) || !v.events.length || v.events.length > 40) return null;
  const events: ArrivalEvent[] = [];
  for (const raw of v.events) {
    if (!raw || typeof raw !== 'object') return null;
    const e = raw as Record<string, unknown>;
    if (!['enter', 'step', 'click', 'exit'].includes(String(e.kind)) || !Number.isInteger(e.station) || Number(e.station) < 0 || Number(e.station) > 9) return null;
    const event: ArrivalEvent = {kind: e.kind as ArrivalEventKind, station: Number(e.station)};
    const target = text(e.target, 60); if (target) event.target = target;
    if (e.kind === 'exit') { if (!Number.isInteger(e.seconds) || Number(e.seconds) < 0) return null; event.seconds = Math.min(86400, Number(e.seconds)); }
    if (e.kind === 'enter') for (const key of ['source', 'medium', 'campaign'] as const) { const value = text(e[key], 60); if (value) event[key] = value; }
    events.push(event);
  }
  return {session: v.session.toLowerCase(), events};
}

/** Browser side: one tracker per page view. Clicks are captured once at the document level. */
export function startArrivalTracking(getStation: () => number) {
  let session: string;
  try { session = sessionStorage.getItem('edu-arrival-session') || crypto.randomUUID(); sessionStorage.setItem('edu-arrival-session', session); }
  catch { return {track: () => {}, stop: () => {}}; }
  if (/(?:^|;\s*)edu_landing_test=1(?:;|$)/.test(document.cookie)) return {track: () => {}, stop: () => {}};
  const started = Date.now(), queue: ArrivalEvent[] = [];
  const send = (beacon: boolean) => {
    if (!queue.length) return;
    const body = JSON.stringify({session, events: queue.splice(0, 40)});
    if (beacon && navigator.sendBeacon?.('/api/campus/arrival/events', new Blob([body], {type: 'application/json'}))) return;
    void fetch('/api/campus/arrival/events', {method: 'POST', headers: {'Content-Type': 'application/json'}, body, keepalive: true}).catch(() => {});
  };
  const track = (event: ArrivalEvent) => { if (queue.length < 200) queue.push(event); };
  const params = new URLSearchParams(location.search), pick = (...keys: string[]) => keys.map(k => params.get(k)).find(Boolean) || undefined;
  track({kind: 'enter', station: 0, source: pick('utm_source', 'source'), medium: pick('utm_medium', 'medium'), campaign: pick('utm_campaign', 'campaign')});
  const click = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.('button, a, [role="button"], summary');
    if (!el || el.closest('[data-arrival-untracked]')) return;
    const label = text(el.getAttribute('data-arrival-track') || el.getAttribute('aria-label') || el.textContent, 40);
    if (label) track({kind: 'click', station: getStation(), target: label});
  };
  let exited = false;
  const exit = () => { if (exited) return; exited = true; track({kind: 'exit', station: getStation(), seconds: Math.round((Date.now() - started) / 1000)}); send(true); };
  const hidden = () => { if (document.visibilityState === 'hidden') send(true); };
  document.addEventListener('click', click, true);
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', exit);
  const timer = setInterval(() => send(false), 5000);
  return {
    track,
    stop: () => { exit(); clearInterval(timer); document.removeEventListener('click', click, true); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', exit); },
  };
}
