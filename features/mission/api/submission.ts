import type { MissionDatabase } from '../infrastructure/access';
import { hasLearningAccess } from '@/lib/platform-rules';
import { safeUrl } from '@/lib/platform';
import { gradeQuiz, type QuizDefinition } from '../domain/quiz';
import { readMissionForm } from '../domain/form';
import { missionFormResponse } from '../application/submission';
const uid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
// Called only after the shared HTTP adapter verifies origin and active profile.
export async function submitMission(db: MissionDatabase, userId: string, body: Record<string, unknown>) {
    const user = { id: userId };
    if (!uid(body.enrollmentId))
        fail('수강 정보를 확인해 주세요.');
    const { data: enrollment, error } = await db.from('enrollments').select('*').eq('id', body.enrollmentId).eq('user_id', user.id).eq('status', 'active').single();
    if (error || !enrollment || !hasLearningAccess(enrollment))
        fail('수강 권한이 필요합니다.', 403);
    const lessonId = String(body.lessonId || '');
    const { data: lesson } = await db.from('curriculum_lessons').select('*,curriculum_weeks!inner(course_id,is_published)').eq('id', lessonId).eq('is_published', true).single();
    if (!lesson || lesson.curriculum_weeks.course_id !== enrollment.course_id || !lesson.curriculum_weeks.is_published)
        fail('공개된 학습이 아닙니다.', 403);
    const { data: mission } = await db.from('curriculum_missions').select('*').eq('id', body.missionId).eq('lesson_id', lessonId).eq('is_published', true).single();
    if (!mission)
        fail('미션을 확인해 주세요.');
    if (body.draft !== undefined && typeof body.draft !== 'boolean')
        fail('임시저장 여부를 확인해 주세요.');
    let formResponse;
    const form = readMissionForm(mission.form_schema);
    if (Object.keys(mission.form_schema || {}).length && body.missionVersion !== mission.updated_at)
        fail('미션이 변경되었습니다. 작성 내용을 보관한 뒤 새로고침해 주세요.', 409);
    try {
        formResponse = missionFormResponse(form, body.formAnswers, body.checklist, body.draft === true);
    }
    catch (error) {
        fail((error as Error).message);
    }
    const content = String(body.content || '').trim();
    if (typeof body.url !== 'string' && body.url != null || String(body.url || '').length > 2000 || (!body.draft && body.url && !safeUrl(body.url)))
        fail('결과물 링크를 확인해 주세요.');
    if (content.length > 20000 || (!body.draft && !form.questions.length && ['text', 'mixed'].includes(mission.submission_type) && !content) || (!body.draft && ['link', 'mixed'].includes(mission.submission_type) && !body.url))
        fail('미션 답변을 입력해 주세요.');
    const { data: previous } = await db.from('mission_submissions').select('*').eq('enrollment_id', enrollment.id).eq('mission_id', mission.id).order('attempt_number', { ascending: false }).limit(1).maybeSingle();
    if (previous && ['approved', 'submitted'].includes(previous.status))
        fail('이미 제출한 미션입니다. 검토 결과를 확인해 주세요.', 409);
    if (body.draft) {
        if (!Object.hasOwn(body, 'draftRevision') || (body.draftRevision !== null && !uid(body.draftRevision)))
            fail('초안을 다시 열고 저장해 주세요.', 409);
        const r = await db.rpc('save_mission_draft', {
            p_user: user.id, p_enrollment: enrollment.id, p_mission: mission.id,
            p_expected: body.draftRevision, p_version: mission.updated_at,
            p_content: content, p_url: String(body.url || ''),
            p_response: { ...formResponse, quiz_answers: body.answers || {}, quiz_revision: uid(body.revision) ? body.revision : null, form_snapshot: mission.form_schema || {} },
        });
        if (r.error)
            fail(r.error.code === 'P0001' ? r.error.message : '임시저장 상태를 확인해 주세요.', 409);
        return reply({ ok: true, draftRevision: r.data.draftRevision });
    }
    const { data: quizRow, error: quizError } = await db.from('mission_quizzes').select('*').eq('mission_id', mission.id).maybeSingle();
    if (quizError)
        throw quizError;
    if (!quizRow && mission.submission_type === 'quiz')
        fail('퀴즈 문항이 준비되지 않았습니다.', 409);
    let grade = null;
    if (quizRow) {
        if (!uid(body.revision))
            fail('퀴즈를 다시 불러온 뒤 응시해 주세요.');
        try {
            grade = gradeQuiz({
                questions: quizRow.questions,
                passPercent: quizRow.pass_percent,
            } as QuizDefinition, body.answers);
        }
        catch (e) {
            fail((e as Error).message);
        }
    }
    const r = await db.rpc('submit_learning_mission', {
        p_user: user.id,
        p_enrollment: enrollment.id,
        p_mission: mission.id,
        p_response: {
            text: content,
            url: String(body.url || ''),
            ...formResponse,
            form_snapshot: mission.form_schema || {},
            mission_snapshot: { title: mission.title, instructions: mission.instructions, submission_type: mission.submission_type },
            ...(quizRow ? { answers: body.answers, score: grade!.score } : {}),
        },
        p_revision: quizRow ? String(body.revision || '') : null,
        p_result: grade,
    });
    if (r.error)
        fail(/[가-힣]/.test(r.error.message) ? r.error.message : '미션 제출 상태를 확인해 주세요.', 409);
    if (r.data.passed === false)
        return reply({
            ok: true,
            passed: false,
            score: grade!.score,
            message: `퀴즈 ${grade!.score}점입니다. 통과 기준 ${quizRow!.pass_percent}%를 확인하고 다시 응시해 주세요.`,
        });
    // The submission trigger clears the draft in the same transaction.
    return reply({ ok: true, passed: true });
}
