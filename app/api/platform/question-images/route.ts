import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';
import { answerFileSpec, matchesAnswerFile } from '@/lib/lesson-files';
const bucket = 'question-images';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function id(value: unknown) { if (!uuid(value)) fail('학습과 파일 정보를 확인해 주세요.'); return value as string; }
function failure(error: unknown) {
  const e = error as { message?: string; status?: number };
  if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
  const known: Record<string, [string, number]> = {
    BLOCK_FORBIDDEN: ['답변에 사진을 첨부할 권한이 없습니다.', 403], MESSAGE_FORBIDDEN: ['이미지를 이용할 권한이 없습니다.', 403], QUESTION_FORBIDDEN: ['첨부파일을 이용할 권한이 없습니다.', 403], QUESTION_NOT_FOUND: ['첨부파일을 찾지 못했습니다.', 404],
    QUESTION_REQUEST_REUSED: ['다른 파일에 사용한 요청입니다. 파일을 다시 선택해 주세요.', 409],
    QUESTION_UPLOAD_LIMIT: ['오늘 이미지 첨부 횟수를 초과했습니다. 내일 다시 시도해 주세요.', 429], QUESTION_INVALID: ['첨부할 질문과 파일 형식을 확인해 주세요.', 400],
  };
  const result = known[e.message || ''];
  return result ? reply({ error: result[0] }, result[1]) : reply({ error: '파일을 처리하지 못했습니다. 다시 시도해 주세요.' }, 503);
}
async function readBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) fail('파일 정보를 확인해 주세요.');
  let size = 0, text = ''; const decoder = new TextDecoder();
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 5000) { await reader.cancel(); fail('파일 정보가 너무 큽니다.', 413); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); }
  finally { reader.releaseLock(); }
  let body; try { body = JSON.parse(text); } catch { fail('파일 정보를 확인해 주세요.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('파일 정보를 확인해 주세요.');
  return body;
}
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED !== 'true') return reply({ error: '사용할 수 없는 기능입니다.' }, 404);
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
    const actor = await getAuthenticatedUser(); if (!actor) fail('로그인이 필요합니다.', 401);
    const body = await readBody(request), db = createAdminClient();
    if (body.purpose !== undefined && body.purpose !== 'answer') fail('파일 요청을 확인해 주세요.');
    const answer = body.purpose === 'answer';
    if (body.action === 'prepare') {
      let spec; try { spec = answerFileSpec(body.name, body.size, 'image'); } catch (e) { fail((e as Error).message); }
      const { data: file, error } = await db.rpc(answer ? 'edu_prepare_answer_image' : 'edu_prepare_question_image', answer ? { p_actor: actor.id, p_question: id(body.questionId), p_request: id(body.requestId), p_spec: spec } : { p_actor: actor.id, p_lesson: body.lessonId === null && body.enrollmentId === null && process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === 'true' ? null : id(body.lessonId), p_enrollment: body.lessonId === null && body.enrollmentId === null && process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === 'true' ? null : id(body.enrollmentId), p_request: id(body.requestId), p_spec: spec });
      if (error) throw error;
      if (file.ready_at) return reply({ id: file.id, name: file.name, size: file.size, ready: true });
      const upload = await db.storage.from(bucket).createSignedUploadUrl(file.path, { upsert: false });
      if (upload.error) throw upload.error;
      return reply({ id: file.id, signedUrl: upload.data.signedUrl, contentType: file.content_type, ready: false });
    }
    if (body.action !== 'complete') fail('파일 요청을 확인해 주세요.');
    const { data: file, error } = await db.rpc(answer ? 'edu_owned_answer_image' : 'edu_owned_question_image', { p_actor: actor.id, p_image: id(body.fileId) });
    if (error) throw error;
    if (file.ready_at) return reply({ id: file.id, name: file.name, size: file.size });
    const storage = db.storage.from(bucket), info = await storage.info(file.path);
    if (info.error) throw info.error;
    if (info.data.size !== file.size || info.data.contentType !== file.content_type) fail('올린 파일의 형식이나 용량이 다릅니다. 파일을 다시 선택해 주세요.');
    const download = await storage.download(file.path); if (download.error) throw download.error;
    if (download.data.size !== file.size) fail('파일 업로드가 끝나지 않았습니다. 다시 시도해 주세요.');
    const bytes = new Uint8Array(await download.data.arrayBuffer()), spec = answerFileSpec(file.name, file.size, 'image');
    if (!matchesAnswerFile(bytes, spec)) fail('파일 내용과 확장자가 맞지 않습니다. 원본 파일을 확인해 주세요.');
    const { data, error: completedError } = await db.rpc(answer ? 'edu_complete_answer_image' : 'edu_complete_question_image', { p_actor: actor.id, p_image: file.id, p_sha256: createHash('sha256').update(bytes).digest('hex') });
    if (completedError) throw completedError;
    return reply(data);
  } catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED !== 'true') return reply({ error: '사용할 수 없는 기능입니다.' }, 404);
  try {
    const actor = await getAuthenticatedUser(); if (!actor) fail('로그인이 필요합니다.', 401);
    const params = new URL(request.url).searchParams, db = createAdminClient();
    const { data: file, error } = await db.rpc(params.has('answer') ? 'edu_read_answer_image' : 'edu_read_question_image', { p_actor: actor.id, p_question: id(params.get('question')), ...(params.has('answer') ? { p_answer: id(params.get('answer')) } : {}) });
    if (error) throw error;
    if (params.get('metadata') === '1') return reply({ id: file.id, name: file.name, size: file.size });
    const download = await db.storage.from(bucket).download(file.path);
    if (download.error) throw download.error;
    if (download.data.size !== file.size || file.size > 10485760) fail('이미지를 확인하지 못했습니다.', 503);
    return new Response(await download.data.arrayBuffer(), { headers: { ...headers, 'Content-Type': file.content_type,
      'Content-Disposition': (params.get('download') === '1' ? 'attachment' : 'inline') + "; filename*=UTF-8''" + encodeURIComponent(file.name),
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  } catch (error) { return failure(error); }
}
