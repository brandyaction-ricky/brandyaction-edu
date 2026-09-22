import type { MissionDatabase } from '../infrastructure/access';
import { hasLearningAccess } from '@/lib/platform-rules';
import { uuid } from '@/lib/edu-workflows';
import { publicQuiz, validateQuiz, type QuizDefinition } from '../domain/quiz';
const reply = (value: unknown) => Response.json(value, { headers: { 'Cache-Control': 'private, no-store' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export async function readMissionQuiz(db: MissionDatabase, user: {
    id: string;
    role?: string;
}, params: URLSearchParams) {
    const missionId = params.get('mission');
    if (!uuid(missionId))
        fail('미션을 확인해 주세요.');
    const { data: mission } = await db.from('curriculum_missions').select('*,curriculum_lessons!inner(is_published,curriculum_weeks!inner(is_published,course_id))').eq('id', missionId).single();
    if (!mission)
        fail('미션을 찾을 수 없습니다.', 404);
    if (user.role !== 'admin') {
        const lesson = mission.curriculum_lessons;
        const { data: enrollment } = await db.from('enrollments').select('*').eq('id', params.get('enrollment')).eq('user_id', user.id).eq('course_id', lesson.curriculum_weeks.course_id).maybeSingle();
        if (!enrollment || !hasLearningAccess(enrollment) || !mission.is_published || !lesson.is_published || !lesson.curriculum_weeks.is_published)
            fail('수강 권한이 필요합니다.', 403);
    }
    const { data: row, error } = await db.from('mission_quizzes').select('*').eq('mission_id', missionId).maybeSingle();
    if (error)
        throw error;
    const quiz = row
        ? ({
            questions: row.questions,
            passPercent: row.pass_percent,
        } as QuizDefinition)
        : null;
    return reply({
        quiz: quiz ? (user.role === 'admin' ? { ...quiz, revision: row!.revision } : publicQuiz(quiz, row!.revision)) : null,
    });
}
export async function saveMissionQuiz(db: MissionDatabase, userId: string, body: Record<string, unknown>) {
    if (!uuid(body.missionId) || (body.revision && !uuid(body.revision)))
        fail('미션을 확인해 주세요.');
    if (body.quiz !== null) {
        const error = validateQuiz(body.quiz);
        if (error)
            fail(error);
    }
    return db.rpc('edu_save_quiz', { p_actor: userId, p_mission: body.missionId, p_revision: body.revision || null, p_quiz: body.quiz });
}
