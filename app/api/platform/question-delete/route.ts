import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';
import { questionDeletionReady } from '@/lib/question-deletion-server';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function id(value: unknown) { if (!uuid(value)) fail('질문 정보를 확인해 주세요.'); return value as string; }
async function actor() {
  if (process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED !== 'true') fail('사용할 수 없는 기능입니다.', 404);
  const user = await getAuthenticatedUser(); if (!user) fail('로그인이 필요합니다.', 401); return user;
}
function failure(error: unknown) {
  const e = error as { message?: string; status?: number };
  if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
  if (e.message === 'QUESTION_NOT_FOUND') return reply({ error: '질문을 찾을 수 없거나 삭제 권한이 없습니다.' }, 404);
  if (e.message === 'MESSAGE_FORBIDDEN') return reply({ error: '질문을 삭제할 권한이 없습니다.' }, 403);
  if (e.message === 'QUESTION_CHANGED') return reply({ error: '새 답변이 등록됐습니다. 최신 답변을 확인한 뒤 다시 삭제해 주세요.' }, 409);
  return reply({ error: '삭제 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.' }, 503);
}
export async function GET(request: Request) {
  try {
    const user = await actor(), question = id(new URL(request.url).searchParams.get('question')), db = createAdminClient();
    if (!await questionDeletionReady(db)) return reply({ canDelete: false, supported: false });
    const result = await db.rpc('edu_can_delete_own_question', { p_actor: user.id, p_question: question });
    if (result.error) throw result.error;
    return reply({ ...result.data, supported: true });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
    const user = await actor(), reader = request.body?.getReader(); if (!reader) fail('입력 내용을 확인해 주세요.');
    const decoder = new TextDecoder(); let text = '', size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2000) { await reader.cancel(); fail('입력 내용이 너무 큽니다.', 413); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
    let body; try { body = JSON.parse(text); } catch { fail('입력 형식을 확인해 주세요.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['questionId', 'expectedHeadId'].includes(key))) fail('요청을 확인해 주세요.');
    const question = id(body.questionId);
    if (body.expectedHeadId !== null && !uuid(body.expectedHeadId)) fail('최신 답변을 확인해 주세요.');
    const db = createAdminClient(); if (!await questionDeletionReady(db)) fail('질문 삭제 기능을 준비하고 있습니다.', 404);
    const result = await db.rpc('edu_delete_own_question', { p_actor: user.id, p_question: question, p_expected_head: body.expectedHeadId });
    if (result.error) throw result.error; return reply(result.data);
  } catch (error) { return failure(error); }
}
