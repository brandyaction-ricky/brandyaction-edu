import type { Row } from '@/lib/platform';
import { isGraduate } from '@/lib/alumni-access';
import { hasLearningAccess } from '@/lib/platform-rules';
import type { CampusScope, CampusSnapshot, CampusMission } from './contracts';

export const isCampusId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function campusError(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
const str = (value: unknown) => typeof value === 'string' ? value : '';

export function campusScopes(userId: string, enrollments: Row[], courses: Row[], cohorts: Row[], now: number): CampusScope[] {
  return enrollments.filter(e => e.user_id === userId && hasLearningAccess(e, now)).flatMap(e => {
    const course = courses.find(c => c.id === e.course_id && c.status === 'published' && !c.archived_at);
    const cohort = cohorts.find(c => c.id === e.cohort_id && c.course_id === e.course_id && !c.archived_at);
    if (!course || !cohort || ![e.id, course.id, cohort.id].every(isCampusId)) return [];
    return [{ ...(isGraduate(e, course, cohort, now) ? { graduate: true } : {}), enrollmentId: e.id, courseId: course.id, cohortId: cohort.id,
      courseTitle: str(course.title), cohortName: str(cohort.name) }];
  });
}

export function campusSnapshot(input: {
  viewer: { id: string; full_name?: string | null };
  scopes: CampusScope[];
  enrollmentId: string | null;
  weeks?: Row[]; lessons?: Row[]; missions?: Row[]; submissions?: Row[]; progress?: Row[];
  now: number;
}): CampusSnapshot {
  const { viewer, scopes, enrollmentId, now } = input;
  const scope = scopes.find(s => s.enrollmentId === enrollmentId);
  if (enrollmentId && !scope) campusError(403, '현재 이용 가능한 수강권을 선택해 주세요.');
  const weeks = new Set((input.weeks || []).filter(w => w.course_id === scope?.courseId && w.is_published === true).map(w => w.id));
  const lessons = scope ? (input.lessons || []).filter(l => weeks.has(str(l.week_id)) && l.is_published === true && isCampusId(l.id)) : [];
  return {
    schemaVersion: 1, fetchedAt: new Date(now).toISOString(),
    viewer: { id: viewer.id, displayName: viewer.full_name || '문샷 동료' }, scopes,
    selectedEnrollmentId: scope?.enrollmentId || null,
    lessons: lessons.sort((a, b) => Number(a.day_number) - Number(b.day_number) || a.id.localeCompare(b.id)).map(l => {
      const href = `/learn/${scope!.enrollmentId}/${l.id}`;
      return { id: l.id, title: str(l.title), day: Number(l.day_number) || 0, version: str(l.updated_at), href,
        completed: (input.progress || []).some(p => p.enrollment_id === scope!.enrollmentId && p.lesson_id === l.id && !!p.completed_at),
        missions: (input.missions || []).filter(m => m.lesson_id === l.id && m.is_published === true && !m.archived_at && isCampusId(m.id)).map(m => {
          const latest = (input.submissions || []).filter(s => s.enrollment_id === scope!.enrollmentId && s.mission_id === m.id)
            .sort((a, b) => Number(b.attempt_number) - Number(a.attempt_number))[0];
          const states = ['submitted', 'approved', 'changes_requested', 'rejected'];
          const status = !latest ? 'not_started' : states.includes(str(latest.status)) ? str(latest.status) : 'unknown';
          return { id: m.id, title: str(m.title), version: str(m.updated_at), required: m.is_required === true,
            status: status as CampusMission['status'], href: `${href}/mission?mission=${m.id}` };
        }),
      };
    }),
    links: { classes: '/my/classes', questions: '/my/questions' }, launchEligibility: null,
  };
}
