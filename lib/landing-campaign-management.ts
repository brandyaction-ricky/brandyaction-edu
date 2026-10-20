import { validId } from './landing';
import { validDay, type PerformanceCourse } from './landing-performance';
import { parseMetaCampaignIds } from './meta-campaign-settings';

export type CampaignCohort = { id: string; title: string; cohort_code: string };
export function preferredCampaign(courses: PerformanceCourse[], today: string) {
  const candidates = courses.filter(course => course.status === 'published' && course.tracking === 'active').flatMap(course => course.campaigns);
  const ordered = [...(candidates.length ? candidates : courses.flatMap(course => course.campaigns))].sort((a, b) => b.start_day.localeCompare(a.start_day));
  return ordered.find(item => item.start_day <= today && item.end_day >= today)
    || ordered.filter(item => item.start_day > today).sort((a, b) => a.start_day.localeCompare(b.start_day))[0]
    || ordered.sort((a, b) => b.end_day.localeCompare(a.end_day))[0];
}

export function campaignInput(input: unknown) {
  const v = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const name = String(v.name || '').trim(), utm = String(v.utm_campaign || '').trim();
  if (!name || name.length > 200 || !utm || utm.length > 250) throw Error('캠페인명과 UTM 캠페인 값을 확인해 주세요.');
  if (!validDay(v.start_day) || !validDay(v.end_day) || v.end_day < v.start_day || Date.parse(v.end_day) - Date.parse(v.start_day) > 3660 * 86400000) throw Error('캠페인 기간을 확인해 주세요.');
  const price = (key: string) => { const n = Number(v[key]); if (v[key] === '' || v[key] == null || !Number.isSafeInteger(n) || n < 0 || n > 2147483647) throw Error('가격을 확인해 주세요.'); return n; };
  const peak = v.live_peak == null || v.live_peak === '' ? null : Number(v.live_peak);
  if (peak != null && (!Number.isSafeInteger(peak) || peak < 0 || peak > 2147483647)) throw Error('최대 동시시청 값을 확인해 주세요.');
  if ('paid_cohort_id' in v && v.paid_cohort_id !== null && v.paid_cohort_id !== '' && !validId(v.paid_cohort_id)) throw Error('연결할 유료 기수를 확인해 주세요.');
  return { name, utm_campaign: utm, start_day: v.start_day, end_day: v.end_day, new_customer_price: price('new_customer_price'), existing_customer_price: price('existing_customer_price'), live_peak: peak,
    uses_ads: v.uses_ads === true, meta_campaign_ids: parseMetaCampaignIds(v.meta_campaign_ids), ...('paid_cohort_id' in v ? { paid_cohort_id: v.paid_cohort_id || null } : {}) };
}

// Small indexed windows keep a long CSV export from becoming one expensive query.
export function exportWindows(start: string, end: string, days = 2) {
  if (!validDay(start) || !validDay(end) || start > end || !Number.isInteger(days) || days < 1) throw Error('내보낼 기간을 확인해 주세요.');
  const windows: { startDay: string; endDay: string }[] = [];
  for (let cursor = Date.parse(start + 'T00:00:00Z'), last = Date.parse(end + 'T00:00:00Z'); cursor <= last; cursor += days * 86400000) {
    windows.push({ startDay: new Date(cursor).toISOString().slice(0, 10), endDay: new Date(Math.min(last, cursor + (days - 1) * 86400000)).toISOString().slice(0, 10) });
  }
  return windows;
}

export function registrationCost(row: { spend: number; registrations: number; registration_available?: boolean | null; registration_cost: number | null }) {
  if (row.registration_available !== true || row.registrations <= 0) return null;
  return row.registration_cost ?? row.spend / row.registrations;
}
