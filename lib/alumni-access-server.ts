import 'server-only';
import { isGraduate } from './alumni-access';
import { hasLearningAccess } from './platform-rules';
import { createAdminClient } from './supabase/admin';

/** Server-side guard for learner writes; invalid enrollments retain their existing error path. */
export async function isGraduateEnrollment(userId: string, enrollmentId: string) {
  const db = createAdminClient();
  const enrollmentResult = await db.from('enrollments')
    .select('id,course_id,cohort_id,status,access_starts_at,access_ends_at,revoked_at')
    .eq('id', enrollmentId).eq('user_id', userId).maybeSingle();
  if (enrollmentResult.error) throw new Error('졸업 상태를 확인하지 못했습니다.');
  const enrollment = enrollmentResult.data;
  if (!enrollment || !hasLearningAccess(enrollment)) return false;
  const [courseResult, cohortResult] = await Promise.all([
    db.from('courses').select('id,category').eq('id', enrollment.course_id).maybeSingle(),
    db.from('cohorts').select('id,status,operation_end_at').eq('id', enrollment.cohort_id).maybeSingle(),
  ]);
  if (courseResult.error || cohortResult.error) throw new Error('졸업 상태를 확인하지 못했습니다.');
  return isGraduate(enrollment, courseResult.data || undefined, cohortResult.data || undefined);
}

export async function assertParticipationOpen(userId: string, enrollmentId: string) {
  if (await isGraduateEnrollment(userId, enrollmentId)) {
    throw Object.assign(new Error('졸업 후 공식 미션 제출과 멘토 검수는 종료됩니다. 개인 실습과 질문은 계속 이용할 수 있습니다.'), { status: 403 });
  }
}
