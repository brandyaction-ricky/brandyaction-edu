import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { publicLessonBlocks, validateLessonBlocks } from '@/lib/lesson-blocks';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function requiredId(value: unknown): string { if (!uuid(value)) fail('제출 정보와 요청 번호를 확인해 주세요.'); return value as string; }
function failure(error: unknown) {
  const e = error as { message?: string; status?: number };
  if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
  const errors: Record<string, [string, number]> = {
    BLOCK_FORBIDDEN: ['제출물을 검토할 권한 또는 유효한 수강권이 없습니다.', 403],
    BLOCK_NOT_FOUND: ['제출물을 찾지 못했습니다.', 404],
    BLOCK_REVIEW_CHANGED: ['검토 상태가 바뀌었습니다. 최신 제출물을 다시 확인해 주세요.', 409],
    BLOCK_REQUEST_REUSED: ['이미 사용한 요청 번호입니다. 결과를 다시 확인해 주세요.', 409],
    BLOCK_INVALID: ['검토 결과와 수정할 내용을 확인해 주세요.', 400],
  };
  const known = errors[e.message || ''];
  return known ? reply({ error: known[0] }, known[1]) : reply({ error: '검토 결과를 처리하지 못했습니다. 다시 확인해 주세요.' }, 503);
}
async function authorize() {
  const user = await getAuthenticatedUser();
  if (!user) fail('로그인이 필요합니다.', 401);
  if (!await getOperatorUser('members', user)) fail('제출물 검토 권한이 없습니다.', 403);
  return user;
}
export async function GET(request: Request) {
  try {
    const user = await authorize(), params = new URL(request.url).searchParams, db = createAdminClient();
    if (params.has('submission')) {
      const { data, error } = await db.rpc('edu_read_block_submission', { p_actor: user.id, p_submission: requiredId(params.get('submission')), p_enrollment: null });
      if (error) throw error;
      return reply({ ...data, document: publicLessonBlocks(validateLessonBlocks(data.document)) });
    }
    const page = Number(params.get('page') || 1), state = params.get('state') ?? 'submitted';
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !['', 'submitted', 'approved', 'changes_requested', 'reopened'].includes(state)) fail('목록 조건을 확인해 주세요.');
    const { data, error } = await db.rpc('edu_list_block_submissions', { p_actor: user.id, p_state: state, p_page: page });
    if (error) throw error;
    return reply(data);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
    const user = await authorize();
    // Bound actual streamed bytes, not only the optional Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) fail('입력 형식을 확인해 주세요.');
    let length = 0, text = ''; const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.byteLength; if (length > 12000) { await reader.cancel(); fail('입력 내용이 너무 큽니다.', 413); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    let body; try { body = JSON.parse(text); } catch { fail('입력 형식을 확인해 주세요.'); }
    if (!body || !['approved', 'changes_requested', 'feedback'].includes(body.decision) || typeof body.feedback !== 'string' || body.feedback.length > 2000 || (body.decision !== 'approved' && !body.feedback.trim())) fail('피드백 또는 수정할 내용을 적어 주세요.');
    const feedbackOnly = body.decision === 'feedback';
    if (feedbackOnly && body.expectedFeedbackId !== null && !uuid(body.expectedFeedbackId)) fail('현재 피드백을 다시 확인해 주세요.');
    const { data, error } = await createAdminClient().rpc(feedbackOnly ? 'edu_save_block_feedback' : 'edu_decide_lesson_blocks', {
      p_actor: user.id, p_submission: requiredId(body.submissionId), p_expected_state: requiredId(body.expectedStateId),
      p_request: requiredId(body.requestId), p_feedback: body.feedback,
      ...(feedbackOnly ? { p_expected_feedback: body.expectedFeedbackId } : { p_decision: body.decision }),
    });
    if (error) throw error;
    return reply(data);
  } catch (error) { return failure(error); }
}
