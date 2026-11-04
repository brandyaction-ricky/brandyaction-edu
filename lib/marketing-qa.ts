import type { FunnelCourse, FunnelCohort } from './recruitment-funnel';

// Display filter only. This name hint never determines financial eligibility.
export const testCatalogName = (name: string) => /(?:\bQA\b|\bDEV\b|테스트|시험용|운영 QA)/i.test(name);
export const webinarFreeCourse = (course: FunnelCourse) => course.category === 'free' && Number(course.list_price) === 0 && course.status === 'published' && !course.archived_at;
export const webinarPaidCohort = (cohort: FunnelCohort, courses: FunnelCourse[]) => courses.some(course => course.id === cohort.course_id && course.category === 'paid_class' && !course.archived_at) && Number(cohort.price) > 0 && cohort.status !== 'cancelled';

export function kstInput(value: unknown) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? new Date(time + 9 * 3600000).toISOString().slice(0, 16) : '';
}
export function kstToIso(value: unknown) {
  const input = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw Error('한국시간 예약 시각을 확인해 주세요.');
  const time = Date.parse(input + ':00+09:00');
  if (!Number.isFinite(time) || kstInput(new Date(time).toISOString()) !== input) throw Error('한국시간 예약 시각을 확인해 주세요.');
  return new Date(time).toISOString();
}
export function kstLabel(value: unknown) {
  const input = kstInput(value);
  return input ? input.replace('T', ' ') + ' KST' : '기록 없음';
}

type Automation = { id?: unknown; is_active?: unknown; trigger_type?: unknown; trigger_tag_id?: unknown; trigger_course_id?: unknown };
export function overlappingAutomations(candidate: Automation, items: Automation[]) {
  if (!candidate.is_active) return [];
  return items.filter(item => {
    if (!item.is_active || (candidate.id && item.id === candidate.id) || item.trigger_type !== candidate.trigger_type) return false;
    const key = candidate.trigger_type === 'purchase_completed' ? 'trigger_course_id' : candidate.trigger_type === 'tag_assigned' ? 'trigger_tag_id' : null;
    return !key || !candidate[key] || !item[key] || item[key] === candidate[key];
  });
}
