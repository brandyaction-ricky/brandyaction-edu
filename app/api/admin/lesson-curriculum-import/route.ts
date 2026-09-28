import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { lessonImportLimit, validateLessonImportBatch } from '@/lib/lesson-curriculum-import';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
const errors: Record<string, [string, number]> = {
  BLOCK_FORBIDDEN: ['상품 관리 권한이 필요합니다.', 403], BLOCK_NOT_FOUND: ['대상 상품을 찾지 못했습니다.', 404],
  IMPORT_INVALID: ['가져올 파일의 형식과 배치를 확인해 주세요.', 400],
  IMPORT_TARGET_CHANGED: ['이미 등록된 수업이 있거나 주차·학습 순서가 겹칩니다. 배치를 다시 확인해 주세요. 기존 수업은 바꾸지 않았습니다.', 409],
  IMPORT_REQUEST_REUSED: ['다른 내용에 사용한 가져오기 요청입니다. 파일을 다시 확인해 주세요.', 409],
  IMPORT_MEDIA_CHANGED: ['연결할 파일이 없거나 원본과 다릅니다. 같은 상품에 올린 파일인지 다시 확인해 주세요.', 409],
  BLOCK_MEDIA_INVALID: ['학습에 연결한 파일을 확인해 주세요.', 409],
  BLOCK_PROGRESSION_DUPLICATE: ['이 상품에 같은 학습 종류·일차가 있습니다. 기존 수업과의 연결을 먼저 확인해 주세요.', 409],
};
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
    const actor = await getOperatorUser('products');
    if (!actor) fail('상품 관리 권한이 필요합니다.', 403);
    const reader = request.body?.getReader(); if (!reader) fail('파일을 선택해 주세요.');
    const decoder = new TextDecoder(), parts: string[] = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > lessonImportLimit + 1000) { await reader.cancel(); fail('파일은 4MB까지 지원합니다.', 413); } parts.push(decoder.decode(value, { stream: true })); } parts.push(decoder.decode()); }
    finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(parts.join('')); } catch { fail('JSON 파일 형식을 확인해 주세요.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !['preview', 'apply'].includes(body.action) || typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.requestId)) fail('가져오기 요청을 확인해 주세요.');
    if (body.action === 'apply' && body.acknowledgeSource !== true) fail('원본 날짜와 가져올 목록을 확인해 주세요.');
    let batch;
    try { batch = validateLessonImportBatch(body.batch); } catch { fail('가져올 커리큘럼 파일의 형식과 배치를 확인해 주세요.'); }
    const { data, error } = await createAdminClient().rpc('edu_import_lesson_batch', { p_actor: actor.id, p_request: body.requestId, p_batch: batch, p_apply: body.action === 'apply' });
    if (error) throw error;
    return reply(data);
  } catch (error) {
    const e = error as { message?: string; status?: number; code?: string }, known = errors[e.message || ''];
    if (known) return reply({ error: known[0] }, known[1]);
    if (e.status && e.status < 500) return reply({ error: e.message }, e.status);
    if (e.code === '23505') return reply({ error: '등록 순서가 다른 작업과 겹쳤습니다. 배치를 다시 확인해 주세요.' }, 409);
    return reply({ error: '가져오기 결과를 확인하지 못했습니다. 같은 파일로 다시 확인해 주세요.' }, 503);
  }
}
