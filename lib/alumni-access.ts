import type { Row } from './platform';
import { hasLearningAccess } from './platform-rules';

/** Graduation changes participation, never the underlying lifetime entitlement. */
export function isGraduate(enrollment: Row | undefined, course: Row | undefined, cohort: Row | undefined, now = Date.now()) {
  if (!enrollment || !course || !cohort || !hasLearningAccess(enrollment, now)) return false;
  if (course.category !== 'paid_class' || cohort.status === 'cancelled') return false;
  if (cohort.status === 'completed') return true;
  const end = cohort.operation_end_at ? Date.parse(String(cohort.operation_end_at)) : NaN;
  return Number.isFinite(end) && end <= now;
}
