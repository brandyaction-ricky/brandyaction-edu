import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function requiredId(value: unknown): string { if (!uuid(value)) fail('기수와 요청 번호를 확인해 주세요.'); return value as string; }
function failure(error: unknown) {
  const e = error as { message?: string; status?: number };
  if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
  const errors: Record<string, [string, number]> = {
    BLOCK_FORBIDDEN: ['기수 설정을 변경할 권한이 없습니다.', 403],
    BLOCK_NOT_FOUND: ['기수를 찾지 못했습니다.', 404],
    BLOCK_REQUEST_REUSED: ['이미 사용한 요청 번호입니다. 결과를 다시 확인해 주세요.', 409],
    BLOCK_INVALID: ['자동승인 주차를 확인해 주세요.', 400],
    BLOCK_DRAFT_CHANGED: ['다른 화면에서 설정을 바꿨습니다. 저장된 설정을 다시 확인해 주세요.', 409],
  };
  const known = errors[e.message || ''];
  return known ? reply({ error: known[0] }, known[1]) : reply({ error: '학습 개방 설정을 처리하지 못했습니다. 다시 확인해 주세요.' }, 503);
}
async function authorize() {
  const user = await getAuthenticatedUser();
  if (!user) fail('로그인이 필요합니다.', 401);
  if (!await getOperatorUser('products', user)) fail('기수 설정 권한이 없습니다.', 403);
  return user;
}
export async function GET(request: Request) {
  try {
    const user = await authorize(), params = new URL(request.url).searchParams;
    const { data, error } = await createAdminClient().rpc('edu_progression_settings', { p_actor: user.id, p_cohort: requiredId(params.get('cohort')) });
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
        length += value.byteLength; if (length > 4000) { await reader.cancel(); fail('입력 내용이 너무 큽니다.', 413); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    let body; try { body = JSON.parse(text); } catch { fail('입력 형식을 확인해 주세요.'); }
    if (!body || (body.autoApproveThroughWeek !== null && (!Number.isInteger(body.autoApproveThroughWeek) || body.autoApproveThroughWeek < 1 || body.autoApproveThroughWeek > 6))) fail('자동승인 주차를 확인해 주세요.');
    const { data, error } = await createAdminClient().rpc('edu_progression_settings', {
      p_actor: user.id, p_cohort: requiredId(body.cohortId), p_write: requiredId(body.requestId),
      p_expected: body.expectedWriteId == null ? null : requiredId(body.expectedWriteId), p_week: body.autoApproveThroughWeek,
    });
    if (error) throw error;
    return reply(data);
  } catch (error) { return failure(error); }
}
