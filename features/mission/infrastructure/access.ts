import type { createAdminClient } from '@/lib/supabase/admin';
import { hasLearningAccess } from '@/lib/platform-rules';

export type MissionDatabase = ReturnType<typeof createAdminClient>;

// Only verified server identities and IDs cross the Learning/Mission boundary.
export async function requireMissionAccess(db: MissionDatabase, userId: string, enrollmentId: string, missionId: string) {
  const enrollmentResult = await db.from('enrollments').select('*').eq('id', enrollmentId).eq('user_id', userId).maybeSingle();
  if (enrollmentResult.error) throw enrollmentResult.error;
  const enrollment = enrollmentResult.data;
  if (!enrollment || !hasLearningAccess(enrollment)) throw Object.assign(new Error('수강 권한이 필요합니다.'), { status: 403 });
  const missionResult = await db.from('curriculum_missions')
    .select('id,is_published,archived_at,curriculum_lessons!inner(id,is_published,curriculum_weeks!inner(course_id,is_published,courses!inner(archived_at)))')
    .eq('id', missionId).maybeSingle();
  if (missionResult.error) throw missionResult.error;
  const mission = missionResult.data;
  const lesson = mission?.curriculum_lessons as unknown as { id: string; is_published: boolean; curriculum_weeks: { course_id: string; is_published: boolean; courses: { archived_at: unknown } } } | undefined;
  if (!mission?.is_published || mission.archived_at || !lesson?.is_published || !lesson.curriculum_weeks.is_published || lesson.curriculum_weeks.course_id !== enrollment.course_id || lesson.curriculum_weeks.courses.archived_at) {
    throw Object.assign(new Error('공개된 미션을 확인해 주세요.'), { status: 403 });
  }
  return { courseId: String(enrollment.course_id), lessonId: lesson.id };
}
