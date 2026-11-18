import type { PublicBlockDocument } from './lesson-blocks';
export function canReviewCurriculum(actor: { role?: string; status?: string } | null | undefined) {
  return actor?.status === 'active' && (actor.role === 'admin' || actor.role === 'staff');
}
export type ReviewLesson = { id: string; title: string; description: string; week: number; weekTitle: string; day: number; completed: boolean; studentUnlocked: boolean };
export type CurriculumReview = {
  cohorts: { id: string; title: string; courseId: string }[];
  cohortId: string; enrollmentId: string | null; lessons: ReviewLesson[];
  studentStateError: boolean;
};
export type ReviewContent = { document: PublicBlockDocument | null; revision: string | null; body: string; video: string; external: string; resourceName: string | null };
export function reviewUrl(cohort: string, lesson: string, student = false) {
  return '/api/platform/curriculum-review?' + new URLSearchParams({ cohort, lesson, ...(student ? { student: '1' } : {}) });
}
