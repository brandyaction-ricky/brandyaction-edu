import { kstDate, reportRange } from './landing';

export const PERFORMANCE_PERIODS = [1, 7, 14] as const;
export type PerformancePeriod = typeof PERFORMANCE_PERIODS[number];
export type PerformanceCourse = { id: string; title: string; slug: string; status: string; tracking: 'active' | 'paused' | 'not_configured'; campaign_start?: string; campaign_end?: string };
export type PerformanceDay = { day: string; visitors: number; sessions: number; clicks: number; converted_sessions: number };
export type PerformanceSource = {
  day?: string; campaign: string; adset: string; creative: string; traffic: string; device: string;
  visitors: number; sessions: number; clicks: number; converted_sessions: number;
  avg_dwell_ms: number | null; avg_scroll_depth: number | null;
};
export type PerformanceReport = {
  summary: { visitors: number; clicks: number; converted_visitors: number; sessions: number; converted_sessions: number; measured_sessions: number; avg_dwell_ms: number | null; avg_scroll_depth: number | null };
  daily: PerformanceDay[];
  sources: PerformanceSource[];
  export_rows: PerformanceSource[];
  options: { campaigns: string[]; adsets: string[]; creatives: string[]; devices: string[] };
  last_event_at: string | null;
  range: { startDay: string; endDay: string };
};

export function performanceRange(value: string | null, now = new Date(), customStart?: string | null, customEnd?: string | null) {
  if (customStart || customEnd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart || '') || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd || '')) throw Error('조회 시작일과 종료일을 확인해 주세요.');
    const span = (Date.parse(customEnd + 'T00:00:00Z') - Date.parse(customStart + 'T00:00:00Z')) / 86400000 + 1;
    if (!Number.isInteger(span) || span < 1 || span > 90) throw Error('조회 기간은 1일 이상 90일 이하여야 합니다.');
    return { days: span, startDay: customStart!, endDay: customEnd!, ...reportRange(customStart!, customEnd!) };
  }
  if (value !== null && !['1', '7', '14', '30', '90'].includes(value)) throw Error('조회 기간은 오늘·7일·14일 또는 직접 선택해 주세요.');
  const days = Number(value || '7') as PerformancePeriod;
  const endDay = kstDate(now);
  const startDay = new Date(Date.parse(endDay + 'T00:00:00Z') - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { days, startDay, endDay, ...reportRange(startDay, endDay) };
}

export function conversionRate(summary: PerformanceReport['summary']) {
  return summary.visitors ? summary.converted_visitors / summary.visitors * 100 : 0;
}

export function sessionConversionRate(summary: PerformanceReport['summary']) {
  return summary.sessions ? Number(summary.converted_sessions || 0) / summary.sessions * 100 : 0;
}

// Do not infer page engagement from section sums or CTA-only scroll measurements.
export function engagementLabel(value: number | null, sessions: number, unit: 'time' | 'percent') {
  if (value === null) return sessions ? '미수집' : unit === 'time' ? '0s' : '0%';
  return unit === 'time' ? `${Math.round(value / 1000)}s` : `${Math.round(value)}%`;
}
