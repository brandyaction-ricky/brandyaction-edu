import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';
import { requireMissionAccess } from '../infrastructure/access';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const handleError = (cause: unknown) => {
  const error = cause as Error & { status?: number };
  return reply({ error: error.status ? error.message : '미션 질문을 처리하지 못했습니다. 다시 시도해 주세요.' }, error.status || 503);
};

export async function readMissionQuestions(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const params = new URL(request.url).searchParams;
    const enrollment = params.get('enrollment'), mission = params.get('mission');
    const page = Number(params.get('page') || 1);
    if (!uuid(enrollment) || !uuid(mission) || !Number.isInteger(page) || page < 1 || page > 100000) fail('질문 조회 정보를 확인해 주세요.');
    const db = createAdminClient();
    await requireMissionAccess(db, user.id, enrollment!, mission!);
    const result = await db.from('edu_questions').select('id,title,content,answer,status,created_at', { count: 'exact' })
      .eq('user_id', user.id).eq('mission_id', mission).eq('enrollment_id', enrollment).eq('is_archived', false)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 20, page * 20 - 1);
    if (result.error) throw result.error;
    return reply({ rows: result.data || [], page, pageSize: 20, total: result.count || 0 });
  } catch (error) { return handleError(error); }
}

export async function createMissionQuestion(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    let body;
    try { body = await request.json(); } catch { fail('질문 입력을 확인해 주세요.'); }
    if (!body || typeof body !== 'object' || !uuid(body.enrollmentId) || !uuid(body.missionId) || !uuid(body.requestId)) fail('질문 입력 화면을 다시 열어 주세요.');
    if (typeof body.title !== 'string' || typeof body.content !== 'string' || !body.title.trim() || !body.content.trim() || body.title.trim().length > 200 || body.content.trim().length > 10000) fail('제목은 200자, 내용은 10,000자 이내로 입력해 주세요.');
    const db = createAdminClient();
    await requireMissionAccess(db, user.id, body.enrollmentId, body.missionId);
    const result = await db.rpc('create_mission_question', { p_actor: user.id, p_request: body.requestId, p_enrollment: body.enrollmentId, p_mission: body.missionId, p_title: body.title.trim(), p_content: body.content.trim() });
    if (result.error) {
      if (result.error.code === 'P0001') fail('수강 권한이나 질문 저장 상태가 변경되었습니다. 질문 목록을 다시 확인해 주세요.', 409);
      throw result.error;
    }
    return reply({ ok: true, id: result.data.id });
  } catch (error) { return handleError(error); }
}
