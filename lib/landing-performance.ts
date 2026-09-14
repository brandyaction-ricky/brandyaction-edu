import { kstDate } from './landing';

export const PERFORMANCE_PRESETS = ['today', 'yesterday', '7d', '14d', 'campaign'] as const;
export type PerformancePreset = typeof PERFORMANCE_PRESETS[number] | 'custom';
export type PerformanceCourse = {
  id: string; title: string; slug: string; status: string;
  tracking: 'active' | 'paused' | 'not_configured'; campaigns: PerformanceCampaign[];
};
export type PerformanceCampaign = {
  id: string; landing_id: string; name: string; utm_campaign: string; start_day: string; end_day: string;
  new_customer_price: number; existing_customer_price: number; live_peak: number | null;
  meta_ad_account_id: string | null; meta_campaign_id: string | null;
  meta_sync_status: 'not_configured' | 'idle' | 'syncing' | 'success' | 'failed';
  meta_last_synced_at: string | null; meta_sync_error: string | null;
};
export type MetricSummary = {
  has_data: boolean; sessions: number; visitors: number; cta_click_sessions: number; cta_clicks: number;
  converted_visitors: number; avg_dwell_ms: number | null; avg_scroll_depth: number | null;
  meta_impressions: number; meta_link_clicks: number; spend: number;
};
export type PerformanceRow = {
  campaign: string; adset: string; creative: string; ad_type: 'cold' | 'retarget' | 'unclassified';
  sessions: number; visitors: number; cta_click_sessions: number; cta_clicks: number;
  avg_scroll_depth: number | null; avg_dwell_ms: number | null;
  impressions: number; link_clicks: number; spend: number;
};
export type ActualRow = {
  campaign_id: string; day: string; kakao_members: number | null; new_payments: number | null;
  existing_payments: number | null; new_price_snapshot: number; existing_price_snapshot: number;
  memo: string | null; revenue: number; updated_at: string;
};
export type DashboardReport = {
  campaign: PerformanceCampaign; summary_b: MetricSummary; summary_a: MetricSummary | null;
  performance: PerformanceRow[];
  daily: { day: string; sessions: number; visitors: number; cta_click_sessions: number; cta_clicks: number }[];
  actuals: ActualRow[];
  campaign_summary: { live_peak: number | null; kakao_members: number | null; kakao_delta: number | null; new_payments: number; existing_payments: number; revenue: number; spend: number; roas: number | null };
  options: { campaigns: string[]; ad_types: string[]; adsets: string[]; creatives: string[]; devices: string[]; layouts: number[] };
  data_state: { sessions_exist: boolean; filtered_sessions_exist: boolean; meta_exists: boolean };
  range: { startDay: string; endDay: string; compareStartDay: string | null; compareEndDay: string | null };
};

const DAY = 86400000;
const dateValue = (value: string) => Date.parse(value + 'T00:00:00Z');
const shift = (value: string, days: number) => new Date(dateValue(value) + days * DAY).toISOString().slice(0, 10);
export function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
export function presetRange(preset: PerformancePreset, campaign: Pick<PerformanceCampaign,'start_day'|'end_day'>, now = new Date()) {
  const today = kstDate(now);
  if (preset === 'today') return { startDay: today, endDay: today };
  if (preset === 'yesterday') return { startDay: shift(today, -1), endDay: shift(today, -1) };
  if (preset === '7d' || preset === '14d') return { startDay: shift(today, -(Number(preset.slice(0,-1)) - 1)), endDay: today };
  if (preset === 'campaign') return { startDay: campaign.start_day, endDay: campaign.end_day };
  return { startDay: today, endDay: today };
}
export function campaignRange(range: {startDay:string;endDay:string}, campaign: Pick<PerformanceCampaign,'start_day'|'end_day'>) {
  const clamp = (day: string) => day < campaign.start_day ? campaign.start_day : day > campaign.end_day ? campaign.end_day : day;
  const endDay = clamp(range.endDay), startDay = clamp(range.startDay);
  return { startDay: startDay > endDay ? endDay : startDay, endDay };
}
export function validateDashboardRange(startDay: unknown, endDay: unknown, campaign: Pick<PerformanceCampaign,'start_day'|'end_day'>) {
  if (!validDay(startDay) || !validDay(endDay)) throw Error('조회 날짜를 확인해 주세요.');
  const length = (dateValue(endDay) - dateValue(startDay)) / DAY + 1;
  if (length < 1 || length > 3661) throw Error('조회 기간은 캠페인 범위 안에서 선택해 주세요.');
  if (startDay < campaign.start_day || endDay > campaign.end_day) throw Error('캠페인 시작일과 종료일 안에서 조회해 주세요.');
  return { startDay, endDay, length };
}
export function previousRange(startDay: string, endDay: string) {
  const length = (dateValue(endDay) - dateValue(startDay)) / DAY + 1;
  return { startDay: shift(startDay, -length), endDay: shift(startDay, -1) };
}
export function rate(numerator: number, denominator: number) { return denominator > 0 ? numerator / denominator * 100 : 0; }
export function delta(current: number, previous: number, previousHasData: boolean) {
  if (!previousHasData) return null;
  return { amount: current - previous, rate: previous === 0 ? null : (current - previous) / previous * 100 };
}
export function displayDimension(value: string) {
  if (!value) return '미분류';
  try { return decodeURIComponent(value.replace(/\+/g, ' ')); } catch { return value; }
}
export function filterValues(params: URLSearchParams, key: string, max = 50) {
  return params.getAll(key).map(value => value.slice(0, 250)).filter(Boolean).slice(0, max);
}
export function parsePartialActual(input: unknown) {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (!validDay(body.day)) throw Error('KST 기준 날짜를 확인해 주세요.');
  const values: Record<string, number | string> = {};
  for (const key of ['kakao_members','new_payments','existing_payments'] as const) {
    if (!(key in body) || body[key] === '' || body[key] === null) continue;
    const number = Number(body[key]);
    if (!Number.isInteger(number) || number < 0 || number > 100000000) throw Error('실측값은 0 이상의 정수로 입력해 주세요.');
    values[key] = number;
  }
  if ('memo' in body && body.memo !== '' && body.memo !== null) values.memo = String(body.memo).trim().slice(0, 1000);
  const clear = Array.isArray(body.clear) ? body.clear.filter(value => ['kakao_members','new_payments','existing_payments','memo'].includes(String(value))).map(String) : [];
  return { day: body.day, values, clear };
}

// Kept for legacy imports while the admin page moves to campaign reporting.
export const PERFORMANCE_PERIODS = [7, 30, 90] as const;
export type PerformancePeriod = typeof PERFORMANCE_PERIODS[number];
export type PerformanceReport = DashboardReport;
export function conversionRate(summary: Pick<MetricSummary,'visitors'|'converted_visitors'>) { return rate(summary.converted_visitors, summary.visitors); }
export function engagementLabel(value: number | null, sessions: number, unit: 'time' | 'percent') {
  if (value === null) return sessions ? '미수집' : unit === 'time' ? '0s' : '0%';
  return unit === 'time' ? `${Math.round(value / 1000)}s` : `${Math.round(value)}%`;
}
