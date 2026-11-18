import { registrationCost } from './landing-campaign-management';
import { adMetric, type AdDay } from './landing-ad-trends';
import { displayDimension, rate, type ActualRow, type PerformanceRow } from './landing-performance';

export const DEFAULT_SAMPLE_MIN = 30;
export function parseSampleMin(value: string | null): number | null {
  if (value === null) return DEFAULT_SAMPLE_MIN;
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10000 ? number : null;
}

type ActualInput = Pick<ActualRow, 'day' | 'kakao_members' | 'new_payments' | 'existing_payments'>;
// Snapshot at B's end date, including the latest known value before B starts.
// Payments are a flow: only explicit values inside B are summed. Unknown stays null.
export function periodActuals(rows: ActualInput[], start: string, end: string) {
  const baselineDay = new Date(Date.parse(start + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const kakao = rows.find(row => row.day === end && row.kakao_members !== null);
  const baseline = rows.find(row => row.day === baselineDay && row.kakao_members !== null);
  let payments: number | null = null;
  for (const row of rows) {
    if (row.day < start || row.day > end) continue;
    if (row.new_payments !== null || row.existing_payments !== null) payments = (payments ?? 0) + (row.new_payments ?? 0) + (row.existing_payments ?? 0);
  }
  return {
    kakao_members: kakao?.kakao_members ?? null,
    kakao_delta: kakao && baseline ? kakao.kakao_members! - baseline.kakao_members! : null,
    kakao_day: kakao?.day ?? null,
    baseline_day: baselineDay,
    baseline_members: baseline?.kakao_members ?? null,
    payments,
  };
}
export function funnelRate(next: number | null | undefined, previous: number | null | undefined) {
  return next == null || previous == null || previous <= 0 ? null : next / previous * 100;
}
export type SortKey = 'adset' | 'creative' | 'sessions' | 'visitors' | 'cta_click_sessions' | 'conversion' | 'avg_scroll_depth' | 'avg_dwell_ms' | 'spend' | 'ctr' | 'landing_page_views' | 'registrations' | 'registration_cost' | 'cpm';
export function sortPerformance(rows: PerformanceRow[], key: SortKey, direction: 'asc' | 'desc', sampleMin = DEFAULT_SAMPLE_MIN) {
  const value = (row: PerformanceRow) => {
    if (key === 'registration_cost') return registrationCost(row);
    if (key === 'landing_page_views') return row.landing_page_view_available === true ? row.landing_page_views : null;
    if (key === 'registrations') return row.registration_available === true ? row.registrations : null;
    if (key === 'conversion') return row.sessions > 0 ? rate(row.cta_click_sessions, row.sessions) : null;
    if (key === 'ctr' || key === 'cpm') return adMetric(row, key);
    return row[key];
  };
  return [...rows].sort((left, right) => {
    if (key === 'conversion' && (left.sessions < sampleMin) !== (right.sessions < sampleMin)) return left.sessions < sampleMin ? 1 : -1;
    const a = value(left), b = value(right);
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    return (typeof a === 'string' && typeof b === 'string' ? displayDimension(a).localeCompare(displayDimension(b), 'ko') : Number(a) - Number(b)) * (direction === 'asc' ? 1 : -1);
  });
}

export function hasUnresolvedAdParameter(value: string) {
  return /\{\{[^{}]+\}\}/.test(value);
}

export function suggestAdType(row: Pick<PerformanceRow, 'ad_type' | 'campaign' | 'adset' | 'creative'>) {
  if (row.ad_type !== 'unclassified') return null;
  const prefixes = new Set(
    [row.campaign, row.adset, row.creative]
      .map(value => /^\s*(COLD|RT)_/i.exec(value)?.[1]?.toUpperCase())
      .filter(Boolean),
  );
  if (prefixes.size !== 1) return null;
  return prefixes.has('COLD') ? '콜드' : '리타겟';
}

type AdSetPerformance = Omit<AdDay, 'day'> & Pick<PerformanceRow, 'campaign' | 'adset'>;

export function summarizeAdSets(rows: PerformanceRow[]): AdSetPerformance[] {
  const groups = new Map<string, AdSetPerformance>();
  for (const row of rows) {
    const { campaign, adset } = row;
    if (!campaign || !adset || hasUnresolvedAdParameter(campaign) || hasUnresolvedAdParameter(adset)) continue;
    // An EDU-only row has no Meta availability flags or delivered activity.
    const hasMeta = row.registration_available != null || row.landing_page_view_available != null ||
      row.impressions > 0 || row.link_clicks > 0 || row.spend > 0;
    if (!hasMeta) continue;

    const key = JSON.stringify([campaign, adset]);
    const group = groups.get(key) ?? {
      campaign, adset, spend: 0, impressions: 0, link_clicks: 0, registrations: 0, registration_state: 'ready',
    };
    group.spend += row.spend;
    group.impressions += row.impressions;
    group.link_clicks += row.link_clicks;
    if (row.registration_available === false) group.registration_state = 'missing';
    else if (row.registration_available !== true && group.registration_state !== 'missing') group.registration_state = 'unknown';
    group.registrations = group.registration_state === 'ready' ? (group.registrations ?? 0) + row.registrations : null;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.spend - a.spend || a.adset.localeCompare(b.adset, 'ko') || a.campaign.localeCompare(b.campaign, 'ko'));
}
