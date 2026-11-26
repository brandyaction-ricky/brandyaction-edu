import { createAdminClient } from '@/lib/supabase/admin';
import { canReviewCurriculum, type CurriculumReview, type ReviewContent } from './staff-curriculum-review';
import { cohortLessonVisible } from './cohort-curriculum-visibility';
import { curriculumDayNumbers } from './curriculum-days';
import { hasLearningAccess } from './platform-rules';
import { legacyLessonUnlocked } from './lesson-completion';
import { isGraduate } from './alumni-access';
import { publicLessonBlocks, validateLessonBlocks } from './lesson-blocks';
import type { Row } from './platform';
import { externalPartnerScopes, type ExternalPartnerScope } from './external-partner-access';

type Actor = { id: string; role: string; status: string };
type DB = ReturnType<typeof createAdminClient>;
export function reviewFailure(message: string, status = 403): never { throw Object.assign(new Error(message), { status }); }
export function reviewId(value: string | null) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) reviewFailure('검수할 과정이나 수업을 확인해 주세요.', 400);
  return value;
}
function allow(actor: Actor) { if (!canReviewCurriculum(actor)) reviewFailure('관리자·직원만 커리큘럼을 검수할 수 있습니다.'); }
async function rows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const result = await query;
  if (result.error) throw new Error('커리큘럼 조회에 실패했습니다.');
  return (result.data || []) as Row[];
}
// Explicit columns and pagination: no answers, contacts, orders, or draft documents.
async function all(db: DB, table: string, columns: string, scope?: [string, string]) {
  const result: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from(table).select(columns).order(columns.startsWith('id:') ? columns.split(',')[0].slice(3) : 'id').range(offset, offset + 499);
    if (scope) query = query.eq(...scope);
    const page = await rows(query); result.push(...page);
    if (page.length < 500) return result;
  }
}
export async function readCurriculumReview(actor: Actor, options: { cohort?: string; enrollment?: string } = {}, db = createAdminClient()): Promise<CurriculumReview> {
  allow(actor);
  let selected = options.cohort || '';
  if (options.enrollment) {
    const owned = await rows(db.from('enrollments').select('id,cohort_id').eq('id', options.enrollment).eq('user_id', actor.id));
    if (!owned[0]) reviewFailure('본인 수강권으로 검수 화면을 열어 주세요.');
    selected = String(owned[0].cohort_id);
  }
  const [courses, cohorts] = await Promise.all([
    all(db, 'courses', 'id,title,category,archived_at'), all(db, 'cohorts', 'id,course_id,name,status,archived_at,operation_end_at,alumni_access_on_enroll'),
  ]);
  const activeCourses = courses.filter(c => !c.archived_at);
  const choices = cohorts.filter(c => !c.archived_at && activeCourses.some(course => course.id === c.course_id)).map(c => ({ id: c.id, courseId: String(c.course_id), title: `${activeCourses.find(course => course.id === c.course_id)?.title} · ${c.name}` }));
  const cohortId = selected || choices[0]?.id || '';
  const choice = choices.find(c => c.id === cohortId);
  if (!choice) { if (selected) reviewFailure('검수할 기수를 찾지 못했습니다.', 404); return { cohorts: choices, cohortId: '', enrollmentId: null, lessons: [], studentStateError: false }; }
  const weeks = await all(db, 'curriculum_weeks', 'id,course_id,week_number,title,is_published,archived_at', ['course_id', choice.courseId]);
  const lessons: Row[] = [];
  for (const week of weeks.filter(w => !w.archived_at)) lessons.push(...await all(db, 'curriculum_lessons', 'id,week_id,day_number,title,description,is_published,archived_at', ['week_id', week.id]));
  const [weekVisibility, lessonVisibility] = await Promise.all([
    all(db, 'edu_cohort_week_visibility', 'id:week_id,week_id,cohort_id,is_published', ['cohort_id', cohortId]),
    all(db, 'edu_cohort_lesson_visibility', 'id:lesson_id,lesson_id,cohort_id,is_published', ['cohort_id', cohortId]),
  ]);
  const data = { curriculum_weeks: weeks, curriculum_lessons: lessons, edu_cohort_week_visibility: weekVisibility, edu_cohort_lesson_visibility: lessonVisibility };
  const days = curriculumDayNumbers(data);
  const visible = lessons.filter(l => cohortLessonVisible(data, cohortId, l)).sort((a, b) => Number(weeks.find(w => w.id === a.week_id)?.week_number) - Number(weeks.find(w => w.id === b.week_id)?.week_number) || Number(a.day_number) - Number(b.day_number) || a.id.localeCompare(b.id));
  const owned = await rows(db.from('enrollments').select('id,course_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at,created_at').eq('user_id', actor.id).eq('cohort_id', cohortId).order('created_at', { ascending: false }));
  const enrollment = owned.find(e => hasLearningAccess(e));
  let studentStateError = false;
  const completed = new Set<string>(), unlocked = new Set<string>();
  if (enrollment) {
    try {
      const progress = await all(db, 'lesson_progress', 'id,lesson_id,completed_at', ['enrollment_id', enrollment.id]);
      progress.filter(p => p.completed_at).forEach(p => completed.add(String(p.lesson_id)));
      if (process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true') {
        const gates = await db.rpc('edu_read_lesson_progression', { p_actor: actor.id, p_enrollment: enrollment.id });
        if (gates.error || !Array.isArray(gates.data)) throw new Error('gate read failed');
        gates.data.forEach((gate: { lessonId: string; isUnlocked: boolean }) => { if (gate.isUnlocked === true) unlocked.add(gate.lessonId); });
      } else {
        const preserved = await rows(db.from('edu_preserved_lesson_access').select('lesson_id').eq('enrollment_id', enrollment.id).eq('cohort_id', cohortId).eq('legacy', true));
        const saved = new Set(preserved.map(p => String(p.lesson_id)));
        const graduate = isGraduate(enrollment, activeCourses.find(c => c.id === choice.courseId), cohorts.find(c => c.id === cohortId));
        visible.forEach(l => { if (graduate || legacyLessonUnlocked(visible, completed, l.id, saved)) unlocked.add(l.id); });
      }
    } catch { studentStateError = true; unlocked.clear(); }
  }
  return { cohorts: choices, cohortId, enrollmentId: enrollment?.id || null, studentStateError, lessons: visible.map(l => {
    const week = weeks.find(w => w.id === l.week_id)!;
    return { id: l.id, title: String(l.title || ''), description: String(l.description || ''), week: Number(week.week_number), weekTitle: String(week.title), day: days.get(l.id) || Number(l.day_number), completed: completed.has(l.id), studentUnlocked: unlocked.has(l.id) };
  }) };
}
export async function readReviewContent(actor: Actor, cohortId: string, lessonId: string, student = false, db = createAdminClient()): Promise<ReviewContent> {
  allow(actor);
  const cohorts = await rows(db.from('cohorts').select('course_id,archived_at').eq('id', cohortId));
  if (!cohorts[0] || cohorts[0].archived_at) reviewFailure('검수할 기수를 찾지 못했습니다.', 404);
  const courses = await rows(db.from('courses').select('id,archived_at').eq('id', cohorts[0].course_id));
  if (!courses[0] || courses[0].archived_at) reviewFailure('검수할 과정을 찾지 못했습니다.', 404);
  const visible = await db.rpc('edu_cohort_lesson_visible', { p_cohort: cohortId, p_lesson: lessonId });
  if (visible.error) throw new Error('공개 상태를 확인하지 못했습니다.');
  if (visible.data !== true) reviewFailure('공개된 수업만 검수할 수 있습니다.', 404);
  if (student) {
    const snapshot = await readCurriculumReview(actor, { cohort: cohortId }, db);
    if (snapshot.studentStateError) reviewFailure('학생 기준 잠금 상태를 확인하지 못했습니다.', 503);
    if (!snapshot.lessons.some(l => l.id === lessonId && l.studentUnlocked)) reviewFailure('학생 기준으로 아직 열리지 않은 수업입니다.');
  }
  return publishedReviewContent(db, lessonId);
}

async function publishedReviewContent(db: DB, lessonId: string): Promise<ReviewContent> {
  const heads = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true'
    ? await rows(db.from('edu_lesson_block_heads').select('revision').eq('lesson_id', lessonId)) : [];
  const revision = heads[0]?.revision ? String(heads[0].revision) : null;
  const [versions, contents] = await Promise.all([
    revision ? rows(db.from('edu_lesson_block_versions').select('document').eq('lesson_id', lessonId).eq('id', revision)) : Promise.resolve([]),
    rows(db.from('lesson_contents').select('body_text,vod_url,external_url,resource_name,resource_storage_path').eq('lesson_id', lessonId)),
  ]);
  const content = contents[0];
  if (revision && !versions[0]) throw new Error('게시된 수업 내용을 확인하지 못했습니다.');
  return { document: versions[0] ? publicLessonBlocks(validateLessonBlocks(versions[0].document)) : null, revision, body: String(content?.body_text || ''), video: String(content?.vod_url || ''), external: String(content?.external_url || ''), resourceName: content?.resource_storage_path ? String(content.resource_name || '학습 자료') : null };
}
export async function readReviewAsset(actor: Actor, cohort: string, lesson: string, asset: string | null, student = false, db = createAdminClient()) {
  const content = await readReviewContent(actor, cohort, lesson, student, db);
  const cohortRow = await rows(db.from('cohorts').select('course_id').eq('id', cohort));
  return publishedReviewAsset(db, content, String(cohortRow[0]?.course_id || ''), lesson, asset);
}

async function publishedReviewAsset(db: DB, content: ReviewContent, course: string, lesson: string, asset: string | null) {
  if (!asset) {
    const files = await rows(db.from('lesson_contents').select('resource_storage_path,resource_name').eq('lesson_id', lesson));
    if (!files[0]?.resource_storage_path) reviewFailure('학습 자료가 없습니다.', 404);
    return { bucket: 'course-resources', path: String(files[0].resource_storage_path), name: String(files[0].resource_name || '학습 자료'), kind: 'file', size: null };
  }
  const block = content.document?.blocks.find(b => b.assetId === asset && ['image', 'audio', 'video', 'file'].includes(b.type));
  if (!block) reviewFailure('이 수업에 게시된 자료만 열 수 있습니다.', 404);
  const files = await rows(db.from('edu_lesson_media').select('path,name,kind,size').eq('id', asset).eq('course_id', course).eq('kind', block.type).not('ready_at', 'is', null));
  if (!files[0]) reviewFailure('게시된 자료를 찾지 못했습니다.', 404);
  return { bucket: 'lesson-content-media', path: String(files[0].path), name: String(files[0].name), kind: String(files[0].kind), size: Number(files[0].size) };
}

function partnerChoice(scope: ExternalPartnerScope) {
  return { id: scope.id, courseId: scope.course_id, title: `${scope.course_title} · ${scope.cohort_name}` };
}

async function partnerScope(actor: Actor, access?: string, db = createAdminClient()) {
  const scopes = actor.status === 'active' && actor.role === 'student' ? await externalPartnerScopes(actor.id, db) : [];
  const scope = access ? scopes.find(row => row.id === access) : scopes[0];
  if (!scope) reviewFailure('이용할 수 있는 협력자 권한을 확인해 주세요.');
  return { scope, scopes };
}

export async function readPartnerCurriculum(actor: Actor, access?: string, db = createAdminClient()): Promise<CurriculumReview> {
  const { scope, scopes } = await partnerScope(actor, access, db);
  const weeks = await all(db, 'curriculum_weeks', 'id,course_id,week_number,title,is_published,archived_at', ['course_id', scope.course_id]);
  const liveWeeks = weeks.filter(w => !w.archived_at && w.is_published === true);
  const lessons = (await Promise.all(liveWeeks.map(w => all(db, 'curriculum_lessons', 'id,week_id,day_number,title,description,is_published,archived_at,updated_at', ['week_id', w.id])))).flat();
  const visible = lessons.filter(l => !l.archived_at && l.is_published === true);
  const days = curriculumDayNumbers({ curriculum_weeks: liveWeeks, curriculum_lessons: visible });
  const weekById = new Map(liveWeeks.map(w => [w.id, w]));
  visible.sort((a, b) => Number(weekById.get(String(a.week_id))?.week_number) - Number(weekById.get(String(b.week_id))?.week_number)
    || Number(a.day_number) - Number(b.day_number) || a.id.localeCompare(b.id));
  return { cohorts: scopes.map(partnerChoice), cohortId: scope.id, enrollmentId: null, studentStateError: false,
    lessons: visible.map(l => {
      const week = weekById.get(String(l.week_id))!;
      return { id: l.id, title: String(l.title), description: String(l.description || ''), week: Number(week.week_number),
        weekTitle: String(week.title), day: days.get(l.id) ?? Number(l.day_number), completed: false, studentUnlocked: true, updatedAt: String(l.updated_at || '') };
    }),
  };
}

async function partnerPublishedContent(actor: Actor, access: string, lesson: string, db: DB) {
  const { scope } = await partnerScope(actor, access, db);
  const visible = await rows(db.from('curriculum_lessons')
    .select('id,curriculum_weeks!inner(course_id)')
    .eq('id', lesson).eq('is_published', true).is('archived_at', null)
    .eq('curriculum_weeks.course_id', scope.course_id).eq('curriculum_weeks.is_published', true)
    .is('curriculum_weeks.archived_at', null));
  if (!visible.length) reviewFailure('지정한 과정의 공개 수업만 열 수 있습니다.', 404);
  return { scope, content: await publishedReviewContent(db, lesson) };
}

export async function readPartnerContent(actor: Actor, access: string, lesson: string, db = createAdminClient()) {
  const { content } = await partnerPublishedContent(actor, access, lesson, db);
  return content;
}

export async function readPartnerAsset(actor: Actor, access: string, lesson: string, asset: string | null, db = createAdminClient()) {
  const { scope, content } = await partnerPublishedContent(actor, access, lesson, db);
  return publishedReviewAsset(db, content, scope.course_id, lesson, asset);
}
