import { metaCampaignIds } from './meta-campaign-settings';
import { kstDate } from './landing';
import { campaignRange, filterValues, PERFORMANCE_PRESETS, presetRange, previousRange, validDay, validateDashboardRange, type ActualRow, type PerformanceCampaign } from './landing-performance';

export const TRACKING_TABS = { dashboard: '성과 대시보드', actuals: '실측 데이터', settings: '캠페인 설정' } as const;
export type TrackingTab = keyof typeof TRACKING_TABS;
export const FILTER_LABELS = { utm_campaign: '캠페인', ad_type: '광고 유형', adset: '광고세트', creative: '소재', device: '기기', layout: '레이아웃 버전' } as const;
export type FilterKey = keyof typeof FILTER_LABELS;
export type TrackingFilters = Record<FilterKey, string[]>;
export const emptyFilters = (): TrackingFilters => ({ utm_campaign: [], ad_type: [], adset: [], creative: [], device: [], layout: [] });
export const parseTab = (value: string | null): TrackingTab => value && Object.hasOwn(TRACKING_TABS, value) ? value as TrackingTab : 'dashboard';
export function readFilters(params: URLSearchParams): TrackingFilters {
  return Object.fromEntries(Object.keys(FILTER_LABELS).map(key => [key, [...new Set(filterValues(params, key))]])) as TrackingFilters;
}
export function appendFilters(params: URLSearchParams, filters: TrackingFilters) {
  for (const [key, values] of Object.entries(filters)) values.forEach(value => params.append(key, value));
}
export function readPeriod(params: URLSearchParams, campaign: PerformanceCampaign) {
  const requested = params.get('preset');
  const preset = requested === 'custom' || PERFORMANCE_PRESETS.includes(requested as typeof PERFORMANCE_PRESETS[number]) ? requested as typeof PERFORMANCE_PRESETS[number] | 'custom' : '7d';
  // Explicit URL dates are validated, never silently replaced by another range.
  const range = params.has('start') || params.has('end')
    ? { startDay: params.get('start') || '', endDay: params.get('end') || '' }
    : campaignRange(presetRange(preset, campaign), campaign);
  const compare = params.get('compare') === '1' || params.has('compare_start');
  let previous = { startDay: '', endDay: '' };
  try { if (validDay(range.startDay) && validDay(range.endDay) && range.startDay <= range.endDay) previous = previousRange(range.startDay, range.endDay); } catch { /* Invalid URL dates remain visible for correction. */ }
  return { preset, start: range.startDay, end: range.endDay, compare, compareStart: params.get('compare_start') ?? previous.startDay, compareEnd: params.get('compare_end') ?? previous.endDay };
}
export type TrackingPeriod = ReturnType<typeof readPeriod>;
export function periodError(period: TrackingPeriod, campaign: PerformanceCampaign) {
  try {
    validateDashboardRange(period.start, period.end, campaign);
    if (period.compare && (!validDay(period.compareStart) || !validDay(period.compareEnd) || period.compareStart > period.compareEnd || Date.parse(period.compareEnd) - Date.parse(period.compareStart) !== Date.parse(period.end) - Date.parse(period.start))) return '비교 기간은 조회 기간과 같은 길이로 선택해 주세요.';
    if (period.compare && period.compareEnd >= period.start) return 'A 기간은 B 기간보다 이전으로 선택해 주세요.';
    return '';
  } catch (error) { return (error as Error).message; }
}
export function metricsRedirect(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  query.set('tab', 'actuals');
  return '/admin/landing?' + query.toString();
}
export function campaignStatus(campaign?: Pick<PerformanceCampaign, 'start_day' | 'end_day'>, now = new Date()) {
  if (!campaign?.start_day || !campaign.end_day) return '설정 필요';
  const today = kstDate(now);
  return today < campaign.start_day ? '시작 전' : today > campaign.end_day ? '종료' : '운영 중';
}
export function metaStatus(campaign: PerformanceCampaign, syncing = false) {
  if (!campaign.meta_ad_account_id || !metaCampaignIds(campaign).length) return '연동 전';
  if (syncing || campaign.meta_sync_status === 'syncing') return '동기화 중';
  return ({ not_configured: '연동 전', idle: '동기화 대기', success: '동기화 성공', failed: '동기화 오류' } as Record<string, string>)[campaign.meta_sync_status] || '설정 필요';
}
export const count = (value: number | null | undefined) => value == null ? '—' : Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
export const money = (value: number | null | undefined) => value == null ? '—' : count(value) + '원';
export const signed = (value: number | null | undefined) => value == null ? '—' : `${value >= 0 ? '+' : ''}${count(value)}`;
export const kstTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' KST' : '—';
export const actualRevenue = (row: ActualRow) => row.new_payments == null && row.existing_payments == null ? null : row.revenue;
export function actualPayload(form: FormData, clears: string[]) {
  const values: Record<string, unknown> = { day: form.get('day'), clear: clears };
  for (const key of ['kakao_members', 'new_payments', 'existing_payments', 'memo']) {
    const value = form.get(key);
    if (value !== null && value !== '' && !clears.includes(key)) values[key] = value;
  }
  return values;
}
