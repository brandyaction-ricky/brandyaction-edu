import { kstDate, reportRange } from './landing';

export const PERFORMANCE_PERIODS = [7, 30, 90] as const;
export type PerformancePeriod = typeof PERFORMANCE_PERIODS[number];
export type PerformanceCourse = { id: string; title: string; slug: string; status: string; tracking: 'active' | 'paused' | 'not_configured' };
export type PerformanceDay = { day: string; visitors: number; clicks: number };
export type PerformanceReport = {
  summary: { visitors: number; clicks: number; converted_visitors: number; sessions: number; measured_sessions: number; avg_dwell_ms: number | null; avg_scroll_depth: number | null };
  daily: PerformanceDay[];
  sources: { source: string; visitors: number; clicks: number }[];
  last_event_at: string | null;
  range: { startDay: string; endDay: string };
};

export function performanceRange(value: string | null, now = new Date()) {
  if (value !== null && !['7', '30', '90'].includes(value)) throw Error('조회 기간은 7일·30일·90일 중 선택해 주세요.');
  const days = Number(value || '7') as PerformancePeriod;
  const endDay = kstDate(now);
  const startDay = new Date(Date.parse(endDay + 'T00:00:00Z') - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { days, startDay, endDay, ...reportRange(startDay, endDay) };
}

export function conversionRate(summary: PerformanceReport['summary']) {
  return summary.visitors ? summary.converted_visitors / summary.visitors * 100 : 0;
}

// Do not infer page engagement from section sums or CTA-only scroll measurements.
export function engagementLabel(value: number | null, sessions: number, unit: 'time' | 'percent') {
  if (value === null) return sessions ? '미수집' : unit === 'time' ? '0s' : '0%';
  return unit === 'time' ? `${Math.round(value / 1000)}s` : `${Math.round(value)}%`;
}
