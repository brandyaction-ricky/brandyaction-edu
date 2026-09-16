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
    payments,
  };
}
export function funnelRate(next: number | null | undefined, previous: number | null | undefined) {
  return next == null || previous == null || previous <= 0 ? null : next / previous * 100;
}
export type SortKey = 'adset' | 'creative' | 'sessions' | 'visitors' | 'cta_click_sessions' | 'conversion' | 'avg_scroll_depth' | 'avg_dwell_ms' | 'spend' | 'ctr' | 'registrations' | 'registration_cost';
export function sortPerformance(rows: PerformanceRow[], key: SortKey, direction: 'asc' | 'desc', sampleMin = DEFAULT_SAMPLE_MIN) {
  const value = (row: PerformanceRow) => key === 'conversion' ? row.sessions > 0 ? rate(row.cta_click_sessions, row.sessions) : null : key === 'ctr' ? row.impressions > 0 ? rate(row.link_clicks, row.impressions) : null : row[key];
  return [...rows].sort((left, right) => {
    if (key === 'conversion' && (left.sessions < sampleMin) !== (right.sessions < sampleMin)) return left.sessions < sampleMin ? 1 : -1;
    const a = value(left), b = value(right);
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    return (typeof a === 'string' && typeof b === 'string' ? displayDimension(a).localeCompare(displayDimension(b), 'ko') : Number(a) - Number(b)) * (direction === 'asc' ? 1 : -1);
  });
}
