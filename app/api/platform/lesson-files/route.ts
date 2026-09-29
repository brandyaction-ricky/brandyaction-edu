import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';
import { answerFileSpec, matchesAnswerFile } from '@/lib/lesson-files';
const bucket = 'lesson-answer-files';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function id(value: unknown) { if (!uuid(value)) fail('학습과 파일 정보를 확인해 주세요.'); return value as string; }
function failure(error: unknown) {
  const e = error as { message?: string; status?: number };
  if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
  const known: Record<string, [string, number]> = {
    BLOCK_FORBIDDEN: ['첨부파일을 이용할 권한이 없습니다.', 403], BLOCK_NOT_FOUND: ['첨부파일을 찾지 못했습니다.', 404],
    BLOCK_CONTENT_CHANGED: ['수업이 바뀌었습니다. 작성한 답변을 보관하고 수업을 다시 열어 주세요.', 409],
    BLOCK_ALREADY_SUBMITTED: ['제출한 답변입니다. 답변 수정하기를 누른 뒤 첨부해 주세요.', 409],
    BLOCK_LESSON_LOCKED: ['아직 열리지 않은 학습입니다.', 403], BLOCK_REQUEST_REUSED: ['다른 파일에 사용한 요청입니다. 파일을 다시 선택해 주세요.', 409],
    BLOCK_UPLOAD_LIMIT: ['첨부 횟수가 많습니다. 잠시 후 다시 시도해 주세요.', 429], BLOCK_INVALID: ['첨부할 질문과 파일 형식을 확인해 주세요.', 400],
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
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
    const actor = await getAuthenticatedUser(); if (!actor) fail('로그인이 필요합니다.', 401);
    const body = await readBody(request), db = createAdminClient();
    if (body.action === 'prepare') {
      let spec; try { spec = answerFileSpec(body.name, body.size, body.kind); } catch (e) { fail((e as Error).message); }
      if (typeof body.blockId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(body.blockId)) fail('질문을 확인해 주세요.');
      const { data: file, error } = await db.rpc('edu_prepare_answer_file', { p_actor: actor.id, p_lesson: id(body.lessonId), p_enrollment: id(body.enrollmentId), p_revision: id(body.revision), p_block: body.blockId, p_request: id(body.requestId), p_spec: spec });
      if (error) throw error;
      if (file.ready_at) return reply({ id: file.id, name: file.name, kind: file.kind, size: file.size, ready: true });
      const upload = await db.storage.from(bucket).createSignedUploadUrl(file.path, { upsert: false });
      if (upload.error) throw upload.error;
      return reply({ id: file.id, signedUrl: upload.data.signedUrl, contentType: file.content_type, ready: false });
    }
    if (body.action !== 'complete') fail('파일 요청을 확인해 주세요.');
    const { data: file, error } = await db.rpc('edu_owned_answer_file', { p_actor: actor.id, p_file: id(body.fileId) });
    if (error) throw error;
    if (file.ready_at) return reply({ id: file.id, name: file.name, kind: file.kind, size: file.size });
    const storage = db.storage.from(bucket), info = await storage.info(file.path);
    if (info.error) throw info.error;
    if (info.data.size !== file.size || info.data.contentType !== file.content_type) fail('올린 파일의 형식이나 용량이 다릅니다. 파일을 다시 선택해 주세요.');
    const download = await storage.download(file.path); if (download.error) throw download.error;
    if (download.data.size !== file.size) fail('파일 업로드가 끝나지 않았습니다. 다시 시도해 주세요.');
    const bytes = new Uint8Array(await download.data.arrayBuffer()), spec = answerFileSpec(file.name, file.size, file.kind);
    if (!matchesAnswerFile(bytes, spec)) fail('파일 내용과 확장자가 맞지 않습니다. 원본 파일을 확인해 주세요.');
    const { data, error: completedError } = await db.rpc('edu_complete_answer_file', { p_actor: actor.id, p_file: file.id, p_sha256: createHash('sha256').update(bytes).digest('hex') });
    if (completedError) throw completedError;
    return reply(data);
  } catch (error) { return failure(error); }
}
export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedUser(); if (!actor) fail('로그인이 필요합니다.', 401);
    const params = new URL(request.url).searchParams, db = createAdminClient();
    const { data: file, error } = await db.rpc('edu_read_answer_file', { p_actor: actor.id, p_file: id(params.get('file')), p_submission: params.has('submission') ? id(params.get('submission')) : null });
    if (error) throw error;
    if (params.get('metadata') === '1') return reply({ id: file.id, name: file.name, kind: file.kind, size: file.size });
    const signed = await db.storage.from(bucket).createSignedUrl(file.path, 60, { download: file.kind === 'file' || params.get('download') === '1' ? file.name : false });
    if (signed.error) throw signed.error;
    return new Response(null, { status: 303, headers: { ...headers, Location: signed.data.signedUrl } });
  } catch (error) { return failure(error); }
}
