import {audiences, isAudience, isRevision, cleanAnswer, REVISION_LIMIT, type Audience, type Answers, type Revision} from './content';

export const ARRIVAL_STORAGE_KEY = 'moonshot:arrival:2026-12-07:v1';
export const ARRIVAL_VERSION = 1;
export type ArrivalStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ArrivalState = {
  version: 1;
  step: ArrivalStep;
  audience: Audience;
  answers: Record<Audience, Answers>;
  mode: 'personal' | 'example';
  experience: 'none' | 'self-reported' | 'example-viewed';
  handoff: 'ready' | 'copied';
  revision: Revision;
  extra: string;
};
export function initialArrivalState(): ArrivalState {
  return {version: 1, step: 0, audience: 'business', answers: {business: {a: '', b: ''}, preparing: {a: '', b: ''}, exploring: {a: '', b: ''}}, mode: 'personal', experience: 'none', handoff: 'ready', revision: 'short', extra: ''};
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function answer(value: unknown): string {
  return typeof value === 'string' ? cleanAnswer(value) : '';
}
/** Malformed, old or oversized browser data cannot manufacture completion or crash entry. */
export function parseArrivalState(raw: string | null | undefined): ArrivalState {
  const state = initialArrivalState();
  if (!raw || raw.length > 16_000) return state;
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== ARRIVAL_VERSION) return state;
    if (typeof value.step === 'number' && Number.isInteger(value.step) && value.step >= 0 && value.step <= 8) {
      // Existing drafts return to the merged handoff and outcome screens.
      state.step = value.step === 4 ? 3 : value.step === 6 ? 5 : value.step as ArrivalStep;
    }
    if (isAudience(value.audience)) state.audience = value.audience;
    if (object(value.answers)) {
      for (const audience of audiences) {
        const entry = value.answers[audience];
        if (object(entry)) state.answers[audience] = {a: answer(entry.a), b: answer(entry.b)};
      }
    }
    state.mode = value.mode === 'example' ? 'example' : 'personal';
    state.experience = state.mode === 'example'
      ? value.experience === 'example-viewed' ? 'example-viewed' : 'none'
      : value.experience === 'self-reported' ? 'self-reported' : 'none';
    // Copying a request never means the external AI has received it or replied.
    state.handoff = value.handoff === 'copied' ? 'copied' : 'ready';
    if (isRevision(value.revision)) state.revision = value.revision;
    state.extra = answer(value.extra).slice(0, REVISION_LIMIT);
    return state;
  } catch {
    return state;
  }
}
export function serializeArrivalState(state: ArrivalState): string {
  return JSON.stringify(parseArrivalState(JSON.stringify(state)));
}

/** Back follows the visitor's chosen path, including the optional example route. */
export function arrivalBackStep(state: ArrivalState): ArrivalStep {
  switch (state.step) {
    case 8: return 0;
    case 1: return 8;
    case 2: return 1;
    case 3:
    case 4: return 2;
    case 5:
    case 6: return state.mode === 'example' ? 1 : 3;
    case 7: return state.experience === 'none' ? 0 : 5;
    default: return 0;
  }
}

export type LiveEvent = {
  id: string;
  date: string;
  title: string;
  description: string;
  timeZone: 'Asia/Seoul';
  startsAt: string | null;
  endsAt: string | null;
  infoUrl: string | null;
};
/** Start confirmed by the owner: Dec 7, 21:00 KST. End and YouTube URL remain pending. */
export const liveEvent: LiveEvent = {
  id: 'moonshot-live-20261207', date: '2026-12-07', title: '문샷 챌린지 · AI 직원 라이브 시작',
  description: '12월 7일 오후 9시(한국시간)에 시작합니다. 내가 하는 일과 원하는 결과를 알려주고 반복해서 업무를 맡길 AI 직원을 만드는 방법을 배웁니다. 종료 시간은 추후 안내합니다. YouTube 참여 링크는 카톡방에서 추가 안내할 예정입니다. 이 일정은 시작 시각을 기억하기 위한 알림입니다.',
  timeZone: 'Asia/Seoul', startsAt: '2026-12-07T21:00:00+09:00', endsAt: null, infoUrl: null,
};
function validCalendarEvent(event: LiveEvent): {start: Date; end: Date | null; url: URL | null} | null {
  if (!event.startsAt || !event.title.trim() || !/^[a-zA-Z0-9_-]{1,100}$/.test(event.id)) return null;
  // A timezone-free time would move with each visitor's device timezone.
  const offsetDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!offsetDate.test(event.startsAt) || (event.endsAt !== null && !offsetDate.test(event.endsAt))) return null;
  const start = new Date(event.startsAt), end = event.endsAt ? new Date(event.endsAt) : null;
  if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end <= start))) return null;
  try {
    const koreanDate = new Intl.DateTimeFormat('sv-SE', {timeZone: event.timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(start);
    if (koreanDate !== event.date) return null;
    const url = event.infoUrl ? new URL(event.infoUrl) : null;
    if (url && (url.protocol !== 'https:' || url.username || url.password)) return null;
    return {start, end, url};
  } catch { return null; }
}
function calendarTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
export function calendarReady(event: LiveEvent): boolean { return validCalendarEvent(event) !== null; }
/** Opens Google's own form. Opening this URL is not proof that the visitor saved it. */
export function googleCalendarUrl(event: LiveEvent): string | null {
  const checked = validCalendarEvent(event);
  if (!checked) return null;
  // Without an end, this is a start reminder rather than an invented event duration.
  const params = new URLSearchParams({action: 'TEMPLATE', text: event.title, dates: `${calendarTime(checked.start)}/${calendarTime(checked.end ?? checked.start)}`, stz: event.timeZone, etz: event.timeZone, details: event.description + (checked.url ? `\n\n라이브 안내: ${checked.url.href}` : '')});
  if (checked.url) params.set('location', checked.url.href);
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}
function escapeIcs(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
/** RFC 5545 folds by UTF-8 octets, without cutting a Korean character in half. */
function foldIcs(line: string): string {
  const encoder = new TextEncoder();
  let folded = '', bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) { folded += '\r\n '; bytes = 1; }
    folded += character; bytes += length;
  }
  return folded;
}
/** A single event import. It does not subscribe, invite anyone, or confirm that saving succeeded. */
export function calendarIcs(event: LiveEvent, generatedAt = new Date()): string | null {
  const checked = validCalendarEvent(event);
  if (!checked || !Number.isFinite(generatedAt.getTime())) return null;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BRANDYACTION//Moonshot Campus//KO', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${event.id}@brandyaction-edu.com`, `DTSTAMP:${calendarTime(generatedAt)}`,
    `DTSTART:${calendarTime(checked.start)}`, ...(checked.end ? [`DTEND:${calendarTime(checked.end)}`] : []),
    `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(event.description + (checked.url ? `\n\n라이브 안내: ${checked.url.href}` : ''))}`,
    ...(checked.url ? [`URL:${checked.url.href}`] : []), 'END:VEVENT', 'END:VCALENDAR',
  ].map(foldIcs).join('\r\n') + '\r\n';
}
