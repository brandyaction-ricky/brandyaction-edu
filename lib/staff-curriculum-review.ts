import type { PublicBlockDocument } from './lesson-blocks';
export function canReviewCurriculum(actor: { role?: string; status?: string } | null | undefined) {
  return actor?.status === 'active' && (actor.role === 'admin' || actor.role === 'staff');
}
export type ReviewLesson = { id: string; title: string; description: string; week: number; weekTitle: string; day: number; completed: boolean; studentUnlocked: boolean; updatedAt?: string };
export type CurriculumReview = {
  cohorts: { id: string; title: string; courseId: string }[];
  cohortId: string; enrollmentId: string | null; lessons: ReviewLesson[];
  studentStateError: boolean;
};
export type ReviewContent = { document: PublicBlockDocument | null; revision: string | null; body: string; video: string; external: string; resourceName: string | null };
export function reviewUrl(cohort: string, lesson: string, student = false, partner = false) {
  return '/api/platform/curriculum-review?' + new URLSearchParams({ ...(partner ? { partner: '1', access: cohort } : { cohort }), lesson, ...(student && !partner ? { student: '1' } : {}) });
}
