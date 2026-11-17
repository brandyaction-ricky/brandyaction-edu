import type { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/platform';
import { hasLearningAccess } from '@/lib/platform-rules';
import { campusError } from './snapshot';
import { campusAdminMetrics } from './admin-metrics';

type Database = ReturnType<typeof createAdminClient>;
type ReadResult = { data: unknown; error: unknown; count: number | null };
async function rows(query: PromiseLike<ReadResult>): Promise<Row[]> {
  const result = await query;
  if (result.error || !Array.isArray(result.data) || result.count !== result.data.length)
    campusError(503, '운영 집계 전체를 확인하지 못했습니다. 다시 시도해 주세요.');
  return result.data as Row[];
}
const ids = (values: unknown[]) => [...new Set(values.map(String))];

async function submissionRows(db: Database, enrollmentIds: string[], missionIds: string[]): Promise<Row[]> {
  const collected: Row[] = [];
  let total: number | null = null;
  for (let start = 0; start < 20000; start += 1000) {
    const result = await db.from('mission_submissions')
      .select('id,enrollment_id,mission_id,attempt_number,status,submitted_at', { count: 'exact' })
      .in('enrollment_id', enrollmentIds).in('mission_id', missionIds).order('id').range(start, start + 999);
    if (result.error || !Array.isArray(result.data) || result.count === null || result.count > 20000
      || (total !== null && total !== result.count)) campusError(503, '제출 기록 전체를 확인하지 못했습니다. 다시 시도해 주세요.');
    total = result.count;
    if (result.data.length !== Math.min(1000, total - start)) campusError(503, '제출 기록 전체를 확인하지 못했습니다. 다시 시도해 주세요.');
    collected.push(...result.data as Row[]);
    if (collected.length === total) {
      if (new Set(collected.map(s => s.id)).size !== total) campusError(503, '제출 기록이 변경되었습니다. 다시 조회해 주세요.');
      return collected;
    }
  }
  campusError(503, '제출 기록이 조회 한도를 넘었습니다.');
}

export type CampusAdminOptions = { schemaVersion: 1; cohorts: { id: string; name: string; courseTitle: string }[] };
/** Minimal selector, available only after members permission has been verified. */
export async function loadCampusAdminOptions(db: Database): Promise<CampusAdminOptions> {
  const courses = await rows(db.from('courses').select('id,title', { count: 'exact' })
    .eq('status', 'published').is('archived_at', null).limit(500));
  const cohorts = courses.length ? await rows(db.from('cohorts').select('id,course_id,name', { count: 'exact' })
    .in('course_id', courses.map(c => c.id)).order('created_at', { ascending: false }).limit(1000)) : [];
  return { schemaVersion: 1, cohorts: cohorts.map(c => ({ id: c.id, name: String(c.name || ''),
    courseTitle: String(courses.find(course => course.id === c.course_id)?.title || '') })) };
}

/** Caller must authorize members permission BEFORE constructing the privileged client. */
export async function loadCampusAdminSnapshot(db: Database, cohortId: string, now = Date.now()) {
  const cohort = (await rows(db.from('cohorts').select('id,course_id,name', { count: 'exact' }).eq('id', cohortId).limit(1)))[0];
  if (!cohort) campusError(404, '기수를 찾을 수 없습니다.');
  const course = (await rows(db.from('courses').select('id,title,status,archived_at', { count: 'exact' })
    .eq('id', cohort.course_id).eq('status', 'published').is('archived_at', null).limit(1)))[0];
  if (!course) campusError(404, '공개된 과정을 찾을 수 없습니다.');
  const [enrollments, weeks] = await Promise.all([
    rows(db.from('enrollments').select('id,user_id,course_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at', { count: 'exact' })
      .eq('cohort_id', cohort.id).eq('course_id', course.id).eq('status', 'active').limit(1000)),
    rows(db.from('curriculum_weeks').select('id,course_id,is_published', { count: 'exact' })
      .eq('course_id', course.id).eq('is_published', true).limit(500)),
  ]);
  const active = enrollments.filter(e => hasLearningAccess(e, now));
  const [profiles, lessons] = await Promise.all([
    active.length ? rows(db.from('profiles').select('id,full_name,status', { count: 'exact' })
      .in('id', ids(active.map(e => e.user_id))).eq('status', 'active').limit(1000)) : [],
    weeks.length ? rows(db.from('curriculum_lessons').select('id,week_id,title,day_number,is_published', { count: 'exact' })
      .in('week_id', weeks.map(w => w.id)).eq('is_published', true).limit(500)) : [],
  ]);
  const allowed = active.filter(e => profiles.some(p => p.id === e.user_id));
  const missions = lessons.length ? await rows(db.from('curriculum_missions').select('id,lesson_id,title,is_required,is_published,archived_at', { count: 'exact' })
    .in('lesson_id', lessons.map(l => l.id)).eq('is_required', true).eq('is_published', true).is('archived_at', null).limit(500)) : [];
  const submissions = allowed.length && missions.length ? await submissionRows(db, allowed.map(e => e.id), missions.map(m => m.id)) : [];
  return campusAdminMetrics({ cohort, course, enrollments: allowed, profiles, weeks, lessons, missions, submissions, now });
}
