import { uuid } from './edu-workflows';
export const hubReply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export function hubFail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export function hubId(value: unknown, optional = false): string | null {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (!uuid(value)) hubFail('질문과 학습 정보를 확인해 주세요.');
  return value as string;
}
export function hubEnabled() { if (process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED !== 'true') hubFail('준비 중인 기능입니다.', 404); }
export async function hubBody(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) hubFail('허용되지 않은 요청입니다.', 403);
  const reader = request.body?.getReader(); if (!reader) hubFail('입력 내용을 확인해 주세요.');
  const decoder = new TextDecoder(); let text = '', size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 65000) { await reader.cancel(); hubFail('입력 내용이 너무 큽니다.', 413); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
  let body; try { body = JSON.parse(text); } catch { hubFail('입력 형식을 확인해 주세요.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) hubFail('입력 형식을 확인해 주세요.');
  return body;
}
export function hubError(error: unknown) {
  const e = error as { message?: string; status?: number };
  if (e.status && e.status < 500) return hubReply({ error: e.message }, e.status);
  const failures: Record<string, [string, number]> = {
    QUESTION_INVALID: ['입력 내용을 확인해 주세요.', 400], QUESTION_RATE_LIMIT: ['잠시 후 질문을 등록해 주세요.', 429],
    QUESTION_REQUEST_REUSED: ['등록 요청이 변경됐습니다. 화면을 다시 확인해 주세요.', 409],
    QUESTION_CHANGED: ['새 답변이 등록됐습니다. 최신 답변을 확인해 주세요.', 409],
    QUESTION_NOT_FOUND: ['질문을 찾을 수 없습니다.', 404],
    QUESTION_ASSIST_HUMAN: ['이 질문은 담당자가 직접 확인합니다.', 400],
    QUESTION_SHARE_FORBIDDEN: ['함께 보기로 요청한 학습 질문만 공유할 수 있습니다.', 403],
    QUESTION_IMAGE_USED: ['이미 등록한 이미지입니다. 새로 첨부해 주세요.', 409],
    QUESTION_IMAGE_INVALID: ['이미지를 다시 첨부해 주세요.', 400],
  };
  const known = failures[e.message || ''];
  if (known) return hubReply({ error: known[0] }, known[1]);
  if (/^(BLOCK_|MESSAGE_|QUESTION_FORBIDDEN)/.test(e.message || '')) return hubReply({ error: '현재 접근할 수 있는 본인 학습에서만 이용할 수 있습니다.' }, 403);
  return hubReply({ error: '연결을 확인하지 못했습니다. 작성한 내용은 유지됩니다. 다시 시도해 주세요.' }, 503);
}
