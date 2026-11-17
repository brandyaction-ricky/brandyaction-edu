export type AdDay = {
  day: string; spend: number; impressions: number; link_clicks: number;
  registrations: number | null; registration_state: 'ready' | 'missing' | 'unknown';
};
export type AdTrend = {
  state: 'ready' | 'unlinked' | 'filtered' | 'error';
  current: AdDay[]; previous: AdDay[];
};
export type StoredAdDay = {
  day: string; spend: number; impressions: number; link_clicks: number;
  registrations: number; registration_available: boolean | null;
};
export const AD_METRICS = [
  { key: 'spend', label: '광고비', unit: '원' },
  { key: 'registrations', label: '등록완료', unit: '건' },
  { key: 'cpa', label: '등록당 비용', unit: '원' },
  { key: 'ctr', label: 'CTR', unit: '%' },
  { key: 'cpm', label: 'CPM', unit: '원' },
] as const;
export type AdMetric = typeof AD_METRICS[number]['key'];
export function adMetric(row: AdDay, metric: AdMetric): number | null {
  if (metric === 'cpa') return row.registrations != null && row.registrations > 0 ? row.spend / row.registrations : null;
  if (metric === 'ctr') return row.impressions > 0 ? row.link_clicks / row.impressions * 100 : null;
  if (metric === 'cpm') return row.impressions > 0 ? row.spend / row.impressions * 1000 : null;
  return row[metric];
}
export function aggregateAdDays(rows: StoredAdDay[]): AdDay[] {
  const days = new Map<string, AdDay>();
  for (const row of rows) {
    // Invalid provider values fail the region instead of manufacturing a zero.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day) || [row.spend, row.impressions, row.link_clicks, row.registrations].some(value => value == null || !Number.isFinite(Number(value)) || Number(value) < 0)) throw Error('광고 수치 확인 필요');
    const value = days.get(row.day) ?? { day: row.day, spend: 0, impressions: 0, link_clicks: 0, registrations: 0, registration_state: 'ready' };
    value.spend += Number(row.spend); value.impressions += Number(row.impressions); value.link_clicks += Number(row.link_clicks);
    if (row.registration_available === false) value.registration_state = 'missing';
    else if (row.registration_available !== true && value.registration_state !== 'missing') value.registration_state = 'unknown';
    value.registrations = value.registration_state === 'ready' ? (value.registrations ?? 0) + Number(row.registrations) : null;
    days.set(row.day, value);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}
export function summarizeAdDays(rows: AdDay[]): AdDay | null {
  if (!rows.length) return null;
  const state = rows.some(row => row.registration_state === 'missing') ? 'missing' : rows.some(row => row.registration_state === 'unknown') ? 'unknown' : 'ready';
  return { day: '', spend: rows.reduce((sum, row) => sum + row.spend, 0), impressions: rows.reduce((sum, row) => sum + row.impressions, 0), link_clicks: rows.reduce((sum, row) => sum + row.link_clicks, 0), registrations: state === 'ready' ? rows.reduce((sum, row) => sum + (row.registrations ?? 0), 0) : null, registration_state: state };
}
