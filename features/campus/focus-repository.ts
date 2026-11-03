import type { createClient } from '@/lib/supabase/server';
import type { Row } from '@/lib/platform';
import { hasLearningAccess } from '@/lib/platform-rules';
import { campusError, isCampusId } from './snapshot';
import { createFocusSession, transitionFocusSession, validateFocusSession, type FocusCommand, type FocusSession } from './focus-domain';

type Database = Awaited<ReturnType<typeof createClient>>;
type Result = { data: unknown; error: unknown };
export type FocusRequest = { kind: 'start'; requestId: string; enrollmentId: string; lessonId: string; lessonVersion: string; actionText: string }
  | (FocusCommand & { sessionId: string });
export type FocusState = { session: FocusSession | null; serverNow: string; currentLessonVersion: string | null };
const columns = 'id,user_id,enrollment_id,lesson_id,lesson_version,action_text,result_note,next_step,status,elapsed_seconds,running_since,revision,created_at,updated_at';
const unavailable = () => campusError(503, '실행 기록을 확인하지 못했습니다. 다시 시도해 주세요.');
async function one(query: PromiseLike<Result>): Promise<Row | null> {
  const result = await query;
  if (result.error) unavailable();
  if (result.data === null) return null;
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) unavailable();
  return result.data as Row;
}
function session(row: Row | null): FocusSession | null {
  if (!row) return null;
  try { return validateFocusSession(row); } catch { return unavailable(); }
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !isCampusId(value)) campusError(400, '실행할 수업을 확인해 주세요.');
}
async function scope(db: Database, userId: string, enrollmentId: string, now: number) {
  id(enrollmentId);
  const enrollment = await one(db.from('enrollments').select('id,user_id,course_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at')
    .eq('id', enrollmentId).eq('user_id', userId).maybeSingle());
  if (!enrollment || !hasLearningAccess(enrollment, now)) campusError(403, '현재 이용 가능한 수강권을 선택해 주세요.');
  const [course, cohort] = await Promise.all([
    one(db.from('courses').select('id').eq('id', enrollment.course_id).eq('status', 'published').is('archived_at', null).maybeSingle()),
    one(db.from('cohorts').select('id').eq('id', enrollment.cohort_id).eq('course_id', enrollment.course_id).is('archived_at', null).maybeSingle()),
  ]);
  if (!course || !cohort) campusError(403, '현재 이용 가능한 수강권을 선택해 주세요.');
  return enrollment;
}
// Never fetch lesson titles/bodies here: hidden lesson notes can still be finished.
async function lessonVersion(db: Database, enrollment: Row, lessonId: string): Promise<string | null> {
  const lesson = await one(db.from('curriculum_lessons').select('id,week_id,updated_at')
    .eq('id', lessonId).eq('is_published', true).maybeSingle());
  if (!lesson) return null;
  const week = await one(db.from('curriculum_weeks').select('id').eq('id', lesson.week_id)
    .eq('course_id', enrollment.course_id).eq('is_published', true).maybeSingle());
  return week && typeof lesson.updated_at === 'string' && lesson.updated_at ? lesson.updated_at : null;
}
async function state(db: Database, enrollment: Row, value: FocusSession | null, now: number): Promise<FocusState> {
  return { session: value, serverNow: new Date(now).toISOString(), currentLessonVersion: value ? await lessonVersion(db, enrollment, value.lesson_id) : null };
}
export async function loadCampusFocus(db: Database, userId: string, enrollmentId: string, now = Date.now()): Promise<FocusState> {
  const enrollment = await scope(db, userId, enrollmentId, now);
  const value = session(await one(db.from('edu_campus_focus_sessions').select(columns).eq('user_id', userId)
    .eq('enrollment_id', enrollmentId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()));
  return state(db, enrollment, value, now);
}
function sameStart(existing: FocusSession, proposed: FocusSession) {
  if (existing.user_id !== proposed.user_id || existing.enrollment_id !== proposed.enrollment_id || existing.lesson_id !== proposed.lesson_id
    || existing.lesson_version !== proposed.lesson_version || existing.action_text !== proposed.action_text) campusError(409, '이미 사용한 실행 요청입니다. 최신 기록을 확인해 주세요.');
}
export async function saveCampusFocus(db: Database, userId: string, command: FocusRequest, now = Date.now()): Promise<FocusState> {
  if (!command || typeof command !== 'object') campusError(400, '실행 요청을 확인해 주세요.');
  if (command.kind === 'start') {
    const proposed = createFocusSession({ id: command.requestId, user_id: userId, enrollment_id: command.enrollmentId,
      lesson_id: command.lessonId, lesson_version: command.lessonVersion, action_text: command.actionText }, now);
    const enrollment = await scope(db, userId, proposed.enrollment_id, now);
    const findRetry = async () => session(await one(db.from('edu_campus_focus_sessions').select(columns).eq('id', proposed.id).eq('user_id', userId).maybeSingle()));
    const existing = await findRetry();
    if (existing) { sameStart(existing, proposed); return state(db, enrollment, existing, now); }
    const version = await lessonVersion(db, enrollment, proposed.lesson_id);
    if (!version) campusError(403, '현재 공개된 수업을 선택해 주세요.');
    if (version !== proposed.lesson_version) campusError(409, '수업이 변경되었습니다. 최신 수업을 확인한 뒤 시작해 주세요.');
    const result = await db.from('edu_campus_focus_sessions').insert(proposed).select(columns).maybeSingle();
    if (result.error) {
      if (result.error.code === '42501') {
        // Publication/version may change after the preflight; RLS checks again atomically.
        const latestVersion = await lessonVersion(db, enrollment, proposed.lesson_id);
        if (latestVersion && latestVersion !== proposed.lesson_version) campusError(409, '수업이 변경되었습니다. 최신 수업을 확인해 주세요.');
        campusError(403, '현재 이용 가능한 수강권과 수업을 선택해 주세요.');
      }
      if (result.error.code !== '23505') unavailable();
      const retry = await findRetry();
      if (retry) { sameStart(retry, proposed); return state(db, enrollment, retry, now); }
      campusError(409, '진행 중인 실행이 있습니다. 기록을 다시 열어 이어가거나 마무리해 주세요.');
    }
    const saved = session(result.data as Row | null);
    if (!saved) unavailable();
    return state(db, enrollment, saved, now);
  }
  id(command.sessionId);
  const current = session(await one(db.from('edu_campus_focus_sessions').select(columns).eq('id', command.sessionId).eq('user_id', userId).maybeSingle()));
  if (!current) campusError(404, '실행 기록을 찾을 수 없습니다.');
  const enrollment = await scope(db, userId, current.enrollment_id, now);
  const next = transitionFocusSession(current, command, now);
  const updated = await one(db.from('edu_campus_focus_sessions').update({ result_note: next.result_note, next_step: next.next_step,
    status: next.status, elapsed_seconds: next.elapsed_seconds, running_since: next.running_since, revision: next.revision, updated_at: next.updated_at })
    .eq('id', current.id).eq('user_id', userId).eq('revision', command.expectedRevision).select(columns).maybeSingle());
  if (!updated) campusError(409, '다른 화면에서 기록이 바뀌었습니다. 최신 기록을 다시 확인해 주세요.');
  return state(db, enrollment, session(updated), now);
}
