import type { MissionDatabase } from '../infrastructure/access';
import { validateMissionForm } from '../domain/form';
import { uuid as uid } from '@/lib/edu-workflows';
import { databaseMessage } from '@/lib/qa-rules';
const reply = (data: unknown) => Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export async function saveMissionDefinition(db: MissionDatabase, userId: string, body: Record<string, unknown>, values: Record<string, unknown>, input: Record<string, unknown>) {
    const user = { id: userId };
    if (!body.id && !uid(body.requestId))
        fail('새 등록 요청을 다시 열고 저장해 주세요.');
    if (!('form_schema' in input))
        fail('미션 편집 화면을 다시 열고 저장해 주세요.', 409);
    try {
        values.form_schema = validateMissionForm(input.form_schema);
    }
    catch (error) {
        fail((error as Error).message);
    }
    if (String(values.title || '').trim().length < 1 || String(values.title).length > 200 || String(values.instructions || '').length > 20000)
        fail('미션 제목과 안내 길이를 확인해 주세요.');
    values.title = String(values.title).trim();
    if (!uid(values.lesson_id))
        fail('연결할 학습을 선택해 주세요.');
    if (body.id && (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))))
        fail('미션을 다시 열고 저장해 주세요.', 409);
    if (typeof values.is_required !== 'boolean' || typeof values.is_published !== 'boolean')
        fail('미션 공개·필수 여부를 확인해 주세요.');
    if (values.submission_type === 'quiz' && (values.form_schema as {
        questions: unknown[];
    }).questions.length)
        fail('퀴즈형 미션은 학습 콘텐츠에서 퀴즈 문항을 구성해 주세요.');
    if (values.submission_type === 'quiz' && values.is_published) {
        const { data: quiz } = await db
            .from('mission_quizzes')
            .select('mission_id')
            .eq('mission_id', body.id || '')
            .maybeSingle();
        if (!quiz)
            fail('미션을 비공개로 저장한 뒤 퀴즈 문항을 등록해 주세요.');
    }
    const result = await db.rpc('save_mission_definition', {
        p_actor: user.id, p_id: body.id || null, p_request: body.requestId || null,
        p_expected: body.id ? body.expectedUpdatedAt : null, p_values: values,
    });
    if (result.error)
        fail(result.error.code === 'P0001' ? result.error.message : databaseMessage(result.error.code), 409);
    return reply({ ok: true, row: result.data });
}
