import type { Row } from './platform';

export function hasLearningAccess(enrollment: Row, now = Date.now()) {
  return enrollment.status === 'active' && !enrollment.revoked_at
    && (!enrollment.access_starts_at || Date.parse(String(enrollment.access_starts_at)) <= now)
    && (!enrollment.access_ends_at || Date.parse(String(enrollment.access_ends_at)) > now);
}

export function isRecruiting(cohort: Row, now = Date.now()) {
  return (cohort.status === 'recruiting' || (cohort.status === 'upcoming' && Boolean(cohort.recruitment_end_at)))
    && (!cohort.recruitment_start_at || Date.parse(String(cohort.recruitment_start_at)) <= now)
    && (!cohort.recruitment_end_at || Date.parse(String(cohort.recruitment_end_at)) > now)
    && (!cohort.operation_end_at || Date.parse(String(cohort.operation_end_at)) > now);
}

export function isPurchasableOffer(course: Row, cohort: Row, now = Date.now()) {
  if (course.status !== 'published' || course.category === 'free') return false;
  if (isRecruiting(cohort, now)) return true;
  if (cohort.status !== 'upcoming') return false;
  return Boolean(cohort.recruitment_end_at)
    && Date.parse(String(cohort.recruitment_end_at)) > now
    && (!cohort.operation_end_at || Date.parse(String(cohort.operation_end_at)) > now);
}

export function containsFreeClassCampaign(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const signals = [/무료\s*(?:라이브\s*)?강의/i, /무료강의\s*(?:대기방|참여|입장)/i, /open\.kakao\.com/i];
  return signals.filter((signal) => signal.test(value)).length >= 2;
}

export function paidCourseReadinessIssues(course: Row, cohorts: Row[], weeks: Row[], lessons: Row[]) {
  if (course.category !== 'paid_class') return [];
  const ownCohorts = cohorts.filter((item) => item.course_id === course.id && !item.archived_at);
  const ownWeeks = weeks.filter((item) => item.course_id === course.id && item.is_published === true);
  const ownWeekIds = new Set(ownWeeks.map((item) => String(item.id)));
  const ownLessons = lessons.filter((item) => ownWeekIds.has(String(item.week_id)) && item.is_published === true);
  const issues: string[] = [];
  const metadata = course.metadata && typeof course.metadata === 'object' ? course.metadata as Record<string, unknown> : {};
  const hasDetail = Boolean(String(course.description || '').trim() || String(metadata.detail_html || '').trim() || String(metadata.detail_html_document || '').trim() || (Array.isArray(metadata.detail_images) && metadata.detail_images.length));
  if (!ownCohorts.some((item) => Number(item.price) > 0 && item.recruitment_end_at)) issues.push('판매 기수·모집 기간');
  if (!course.duration_label && !ownCohorts.some((item) => item.operation_start_at && item.operation_end_at)) issues.push('학습 기간');
  if (!course.schedule_label && !ownCohorts.some((item) => item.operation_start_at)) issues.push('일정 안내');
  if (!ownWeeks.length || !ownLessons.length) issues.push('공개 커리큘럼');
  if (!hasDetail) issues.push('상세 콘텐츠');
  return issues;
}

export function homepageCourses(courses: Row[], cohorts: Row[], now = Date.now()) {
  const recruitingIds = new Set(
    cohorts.filter(cohort => isRecruiting(cohort, now)).map(cohort => cohort.course_id),
  );

  return [
    ...courses.filter(course => recruitingIds.has(course.id)),
    ...courses.filter(course => !recruitingIds.has(course.id)),
  ];
}

export function recordId(row: Row) {
  return row.id || String(row.key || row.lesson_id || '');
}

export function localDateTime(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function matchingOrder(orders: Row[], id: string | null) {
  return id ? orders.find(order => order.id === id || order.order_number === id) : undefined;
}
