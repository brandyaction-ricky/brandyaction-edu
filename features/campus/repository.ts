import type { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/platform';
import { hasLearningAccess } from '@/lib/platform-rules';
import { campusError, campusScopes, campusSnapshot } from './snapshot';

type Database = Awaited<ReturnType<typeof createClient>>;
type ReadResult = { data: unknown; error: unknown; count: number | null };
// Fail visibly on truncation instead of showing a partial mission map as complete.
async function rows(query: PromiseLike<ReadResult>): Promise<Row[]> {
  const result = await query;
  if (result.error) campusError(503, '학습 정보를 불러오지 못했습니다. 다시 시도해 주세요.');
  if (!Array.isArray(result.data) || result.count !== result.data.length) campusError(503, '학습 목록 전체를 확인하지 못했습니다. 내 클래스에서 확인해 주세요.');
  return result.data as Row[];
}
const ids = (values: unknown[]) => [...new Set(values.map(String))];

export async function loadCampusSnapshot(db: Database, viewer: { id: string; full_name?: string | null }, enrollmentId: string | null, now = Date.now()) {
  const enrollments = (await rows(db.from('enrollments')
    .select('id,user_id,course_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at', { count: 'exact' })
    .eq('user_id', viewer.id).eq('status', 'active').limit(200))).filter(e => hasLearningAccess(e, now));
  if (enrollmentId && !enrollments.some(e => e.id === enrollmentId)) campusError(403, '현재 이용 가능한 수강권을 선택해 주세요.');
  const [courses, cohorts] = enrollments.length ? await Promise.all([
    rows(db.from('courses').select('id,title,status,archived_at', { count: 'exact' }).in('id', ids(enrollments.map(e => e.course_id))).eq('status', 'published').is('archived_at', null).limit(200)),
    rows(db.from('cohorts').select('id,course_id,name', { count: 'exact' }).in('id', ids(enrollments.map(e => e.cohort_id))).limit(200)),
  ]) : [[], []];
  const scopes = campusScopes(viewer.id, enrollments, courses, cohorts, now);
  const scope = scopes.find(s => s.enrollmentId === enrollmentId);
  if (enrollmentId && !scope) campusError(403, '현재 이용 가능한 수강권을 선택해 주세요.');
  if (!scope) return campusSnapshot({ viewer, scopes, enrollmentId: null, now });
  const weeks = await rows(db.from('curriculum_weeks').select('id,course_id,is_published', { count: 'exact' })
    .eq('course_id', scope.courseId).eq('is_published', true).limit(500));
  const lessons = weeks.length ? await rows(db.from('curriculum_lessons')
    .select('id,week_id,title,day_number,updated_at,is_published', { count: 'exact' })
    .in('week_id', weeks.map(w => w.id)).eq('is_published', true).order('day_number').limit(500)) : [];
  const [missions, progress] = lessons.length ? await Promise.all([
    rows(db.from('curriculum_missions').select('id,lesson_id,title,updated_at,is_required,is_published,archived_at', { count: 'exact' })
      .in('lesson_id', lessons.map(l => l.id)).eq('is_published', true).is('archived_at', null).limit(500)),
    rows(db.from('lesson_progress').select('id,enrollment_id,lesson_id,completed_at', { count: 'exact' })
      .eq('enrollment_id', scope.enrollmentId).in('lesson_id', lessons.map(l => l.id)).limit(500)),
  ]) : [[], []];
  const submissions = missions.length ? await rows(db.from('mission_submissions')
    .select('id,enrollment_id,mission_id,attempt_number,status', { count: 'exact' })
    .eq('enrollment_id', scope.enrollmentId).in('mission_id', missions.map(m => m.id)).limit(1000)) : [];
  return campusSnapshot({ viewer, scopes, enrollmentId, weeks, lessons, missions, submissions, progress, now });
}
