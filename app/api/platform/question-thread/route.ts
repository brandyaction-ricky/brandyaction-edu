import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function id(value: unknown) { if (!uuid(value)) fail('질문 정보를 확인해 주세요.'); return value as string; }
async function actor() {
 if (process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED !== 'true') fail('준비 중인 기능입니다.', 404);
 const user = await getAuthenticatedUser(); if (!user) fail('로그인이 필요합니다.', 401); return user;
}
function failure(error: unknown) {
 const e = error as { status?: number; message?: string };
 if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
 const errors: Record<string, [string, number]> = {
  QUESTION_NOT_FOUND: ['질문을 찾을 수 없거나 열람 권한이 없습니다.', 404],
  QUESTION_CHANGED: ['다른 답변이 등록됐습니다. 최신 답변을 확인한 뒤 다시 등록해 주세요.', 409],
  QUESTION_REQUEST_REUSED: ['등록 요청이 바뀌었습니다. 최신 답변을 확인해 주세요.', 409],
  QUESTION_INVALID: ['답변 내용을 확인해 주세요.', 400],
  BLOCK_FORBIDDEN: ['질문에 답변할 권한이 없습니다.', 403], MESSAGE_FORBIDDEN: ['질문을 볼 권한이 없습니다.', 403],
 };
 const known = errors[e.message || '']; return reply({ error: known?.[0] || '요청 결과를 확인하지 못했습니다. 다시 확인해 주세요.' }, known?.[1] || 503);
}
export async function GET(request: Request) {
 try {
  const user = await actor(), q = new URL(request.url).searchParams, before = q.get('before');
  if (before !== null && (!/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > BigInt('9223372036854775807'))) fail('조회 위치를 확인해 주세요.');
  const r = await createAdminClient().rpc(process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED === 'true' ? 'edu_read_question_thread_with_images' : 'edu_read_question_thread', { p_actor: user.id, p_question: id(q.get('question')), p_before: before });
  if (r.error) throw r.error; return reply(r.data);
 } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
 try {
  if (request.headers.get('origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
  const user = await actor();
  const reader = request.body?.getReader(); if (!reader) fail('입력 내용을 확인해 주세요.');
  const decoder = new TextDecoder(); let text = '', size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 50000) { await reader.cancel(); fail('입력 내용이 너무 큽니다.', 413); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
  let body; try { body = JSON.parse(text); } catch { fail('입력 형식을 확인해 주세요.'); }
  if (!body || !['answer', 'resolve', 'followup', 'finish', 'delete'].includes(body.action)) fail('요청을 확인해 주세요.');
  if (body.action === 'finish' && process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED !== 'true') fail('준비 중인 기능입니다.', 404);
  if (!['followup', 'finish'].includes(body.action) && !await getOperatorUser('members', user)) fail('질문에 답변할 권한이 없습니다.', 403);
  const question = id(body.questionId); let r;
  const image = body.imageId == null ? null : id(body.imageId);
  if (image && (body.action !== 'answer' || process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED !== 'true')) fail('답변 사진 첨부를 사용할 수 없습니다.', 400);
  if (body.action === 'delete') {
   if (body.expectedHeadId !== null && !uuid(body.expectedHeadId)) fail('최신 답변을 확인해 주세요.');
   r = await createAdminClient().rpc('edu_delete_question_answer', { p_actor: user.id, p_question: question, p_answer: id(body.answerId), p_expected_head: body.expectedHeadId });
  }
  else if (body.action === 'finish') {
   if (body.expectedHeadId !== null && !uuid(body.expectedHeadId)) fail('최신 답변을 확인해 주세요.');
   r = await createAdminClient().rpc('edu_finish_own_question', { p_actor: user.id, p_question: question, p_expected_head: body.expectedHeadId });
  }
  else if (body.action === 'resolve') r = await createAdminClient().rpc('edu_resolve_question', { p_actor: user.id, p_question: question });
  else {
   if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > 10000 || (body.expectedHeadId !== null && !uuid(body.expectedHeadId))) fail('답변 내용과 최신 답변을 확인해 주세요.');
   if (body.assistJobId !== undefined) {
    if (body.action !== 'answer' || process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED !== 'true') fail('초안 연결을 확인해 주세요.');
    id(body.assistJobId);
   }
   if (image) r = await createAdminClient().rpc('edu_add_question_answer_with_image', { p_actor: user.id, p_question: question, p_expected_head: body.expectedHeadId, p_request: id(body.requestId), p_content: body.content, p_image: image, p_assist_job: body.assistJobId || null });
   else if (body.assistJobId !== undefined) {
    r = await createAdminClient().rpc('edu_answer_from_assist', {p_actor:user.id,p_question:question,p_job:id(body.assistJobId),p_request:id(body.requestId),p_content:body.content});
   } else r = await createAdminClient().rpc(body.action === 'followup' ? 'edu_add_question_followup' : 'edu_add_question_answer', { p_actor: user.id, p_question: question, p_expected_head: body.expectedHeadId, p_request: id(body.requestId), p_content: body.content });
  }
  if (r.error) throw r.error; return reply(r.data);
 } catch (e) { return failure(e); }
}
