import { createAdminClient } from '@/lib/supabase/admin';

export async function isLessonVisibleToCohort(cohortId: string, lessonId: string): Promise<boolean> {
  const result = await createAdminClient().rpc('edu_cohort_lesson_visible', {
    p_cohort: cohortId, p_lesson: lessonId,
  });
  if (result.error) throw new Error('기수별 학습 공개 상태를 확인하지 못했습니다.');
  return result.data === true;
}
