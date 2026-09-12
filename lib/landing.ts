export const TEST_COOKIE = 'edu_landing_test';
export const CTA_IDS = ['hero_cta', 'sticky_cta', 'final_cta'] as const;
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
export type LandingSection = { id: string; title: string; body: string; image: string };
export type Thresholds = { min_sessions: number; min_clicks: number; cta_rate_min: number | null; meta_ctr_min: number; alive_seconds: number; gap_percent: number };
export type LandingConfig = {
  id: string; enabled: boolean; kakao_url: string; pixel_enabled: boolean; pixel_id: string;
  cta_label: string; campaign_start: string; campaign_end: string; sections: LandingSection[];
  custom_sections: boolean; thresholds: Thresholds; layout_ver: number; revision: number;
};
export const DEFAULT_THRESHOLDS: Thresholds = { min_sessions: 300, min_clicks: 30, cta_rate_min: null, meta_ctr_min: 3, alive_seconds: 5, gap_percent: 30 };
export function defaultConfig(id: string): LandingConfig {
  return { id, enabled: true, kakao_url: '', pixel_enabled: false, pixel_id: '', cta_label: '무료 라이브 참여하기', campaign_start: '2026-09-14', campaign_end: '2026-09-28', sections: [], custom_sections: false, thresholds: { ...DEFAULT_THRESHOLDS }, layout_ver: 0, revision: 0 };
}
export function decodeLabel(value: unknown): string {
  const raw = String(value || '');
  try { return decodeURIComponent(raw.replaceAll('+', ' ')); } catch { return raw; }
}
export function rawAttribution(search: string, referrer: string) {
  const fields: Record<string, string> = {};
  for (const part of search.replace(/^\?/, '').split('&')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at);
    if ((UTM_KEYS as readonly string[]).includes(key) && !(key in fields)) fields[key] = part.slice(at + 1).slice(0, 800);
  }
  try { fields.referrer = new URL(referrer).origin; } catch { fields.referrer = ''; }
  return fields;
}
export function isTestRequest(cookie: string | null) { return /(?:^|;\s*)edu_landing_test=1(?:;|$)/.test(cookie || ''); }
export function kakaoUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'open.kakao.com' && !u.username && !u.password && !u.port && /^\/o\/[a-zA-Z0-9]+\/?$/.test(u.pathname) ? u.href : ''; } catch { return ''; }
}
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export function kstDate(value: Date | string = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)); }
export function validDate(v: unknown): v is string { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().startsWith(v); }
export function reportRange(start: string, end: string) {
  if (!validDate(start) || !validDate(end) || end < start || Date.parse(end) - Date.parse(start) > 366 * 86400000) throw Error('조회 기간은 시작일부터 최대 1년까지 선택해 주세요.');
  return { start: new Date(start + 'T00:00:00+09:00').toISOString(), end: new Date(Date.parse(end + 'T00:00:00+09:00') + 86400000).toISOString() };
}
const str = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const finite = (v: unknown, min: number, max: number, integer = false) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) throw Error('숫자 입력 범위를 확인해 주세요.');
  return v;
};
export function validateConfig(input: unknown): LandingConfig {
  const v = input as LandingConfig;
  if (!v || !validId(v.id)) throw Error('무료클래스를 선택해 주세요.');
  const url = kakaoUrl(v.kakao_url);
  if (v.kakao_url && !url) throw Error('https://open.kakao.com/o/... 형식의 오픈채팅 주소를 입력해 주세요.');
  const pixel = str(v.pixel_id, 32);
  if (pixel && !/^\d{5,30}$/.test(pixel)) throw Error('Pixel ID는 숫자로 입력해 주세요.');
  if (v.pixel_enabled && !pixel) throw Error('Pixel ID를 입력한 뒤 활성화해 주세요.');
  reportRange(v.campaign_start, v.campaign_end);
  if (!Array.isArray(v.sections) || v.sections.length > 60) throw Error('섹션은 최대 60개까지 등록할 수 있습니다.');
  const sections = v.sections.map(s => {
    if (!s || !/^[a-zA-Z0-9_-]{1,60}$/.test(s.id) || ['hero', 'final', 'detail', 'materials'].includes(s.id)) throw Error('섹션 ID는 영문·숫자·밑줄·하이픈으로 입력해 주세요. hero/final/detail/materials는 기본 섹션입니다.');
    const image = str(s.image, 2048);
    if (image && !/^(https:\/\/|\/(?!\/))[^\\\s]+$/.test(image)) throw Error('이미지는 파일로 업로드한 https 주소를 사용해 주세요.');
    return { id: s.id, title: str(s.title, 160), body: str(s.body, 20000), image };
  });
  if (new Set(sections.map(s => s.id)).size !== sections.length) throw Error('섹션 ID는 중복될 수 없습니다.');
  if (v.custom_sections && !sections.length) throw Error('사용할 섹션을 추가해 주세요.');
  const t = v.thresholds;
  if (!t) throw Error('판정 기준을 확인해 주세요.');
  const cta_label = str(v.cta_label, 100);
  if (!cta_label) throw Error('CTA 문구를 입력해 주세요.');
  return { id: v.id, enabled: v.enabled === true, kakao_url: url, pixel_enabled: v.pixel_enabled === true, pixel_id: pixel, cta_label, campaign_start: v.campaign_start, campaign_end: v.campaign_end, custom_sections: v.custom_sections === true, sections, layout_ver: 0, revision: finite(v.revision, 0, 2147483646, true), thresholds: { min_sessions: finite(t.min_sessions, 1, 1000000, true), min_clicks: finite(t.min_clicks, 1, 1000000, true), cta_rate_min: t.cta_rate_min === null ? null : finite(t.cta_rate_min, 0, 100), meta_ctr_min: finite(t.meta_ctr_min, 0, 100), alive_seconds: finite(t.alive_seconds, 1, 60), gap_percent: finite(t.gap_percent, 0, 100) } };
}
export function sectionOrder(c: Pick<LandingConfig, 'custom_sections' | 'sections'>) { return ['hero', ...(c.custom_sections ? c.sections.map(s => s.id) : ['detail', 'materials']), 'final']; }
export type LandingEvent = { id: string; event_type: 'view_page' | 'view_section' | 'click_cta' | 'post_click_alive'; payload: Record<string, unknown> };
export function validatePacket(input: unknown) {
  const b = input as Record<string, unknown>;
  if (!b || !validId(b.landing_id) || !validId(b.session_id) || !validId(b.visitor_id) || !Number.isInteger(b.layout_ver) || Number(b.layout_ver) < 1 || !Array.isArray(b.events) || b.events.length < 1 || b.events.length > 30) throw Error('Invalid packet');
  const raw = (b.attribution || {}) as Record<string, unknown>, attribution: Record<string, unknown> = {};
  for (const key of UTM_KEYS) attribution[key] = str(raw[key], 800);
  try { attribution.referrer = new URL(String(raw.referrer || '')).origin; } catch { attribution.referrer = ''; }
  attribution.device = ['mobile','tablet','desktop'].includes(String(raw.device)) ? raw.device : 'desktop';
  attribution.browser = ['Instagram','Facebook','Kakao','Safari','Chrome','Firefox','Edge','Other'].includes(String(raw.browser)) ? raw.browser : 'Other';
  attribution.isInApp = raw.isInApp === true;
  attribution.returning = raw.returning === true;
  const events: LandingEvent[] = b.events.map((value: unknown) => {
    const e = value as LandingEvent;
    if (!e || !validId(e.id)) throw Error('Invalid event');
    const p = e.payload || {}, payload: Record<string, unknown> = {};
    const section = str(p.section, 60);
    if (section && !/^[a-zA-Z0-9_-]+$/.test(section)) throw Error('Invalid section');
    if (e.event_type === 'view_section') {
      if (!section) throw Error('Missing section');
      payload.section = section; payload.dwellMs = finite(p.dwellMs, 0, 86400000, true);
    } else if (e.event_type === 'click_cta') {
      if (!(CTA_IDS as readonly unknown[]).includes(p.to)) throw Error('Invalid CTA');
      payload.to = p.to; payload.section = section; payload.scrollPct = finite(p.scrollPct, 0, 100);
    } else if (e.event_type === 'post_click_alive') {
      if (!(CTA_IDS as readonly unknown[]).includes(p.to) || !validId(p.clickId)) throw Error('Invalid CTA reference');
      payload.to = p.to; payload.clickId = p.clickId; payload.elapsedMs = finite(p.elapsedMs, 1000, 3600000, true);
    } else if (e.event_type !== 'view_page') throw Error('Invalid event type');
    return { id: e.id, event_type: e.event_type, payload };
  });
  return { landing_id: b.landing_id, session_id: b.session_id, visitor_id: b.visitor_id, layout_ver: Number(b.layout_ver), attribution, events };
}
export function validateActuals(input: unknown) {
  const v = input as Record<string, unknown>;
  if (!v || !validDate(v.day)) throw Error('KST 기준 날짜를 확인해 주세요.');
  const out: Record<string, unknown> = { day: v.day };
  for (const key of ['joins','exits','live_peak','payments']) out[key] = v[key] === null || v[key] === '' ? null : finite(v[key], 0, 100000000, true);
  return out;
}
export function validateMeta(input: unknown) {
  const v = input as Record<string, unknown>;
  if (!v || !validDate(v.day)) throw Error('KST 기준 날짜를 확인해 주세요.');
  const campaign = str(v.campaign, 250), adset = str(v.adset, 250), creative = str(v.creative, 250);
  if (!campaign || !adset || !creative) throw Error('캠페인·광고세트·소재명을 모두 입력해 주세요.');
  return { day: v.day, campaign: encodeURIComponent(campaign), adset: encodeURIComponent(adset), creative: encodeURIComponent(creative), impressions: finite(v.impressions, 0, 1e10, true), link_clicks: finite(v.link_clicks, 0, 1e10, true), spend: finite(v.spend, 0, 1e12) };
}
