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
