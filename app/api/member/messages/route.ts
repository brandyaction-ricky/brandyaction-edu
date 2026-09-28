import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const errors: Record<string, [string, number]> = {
  MESSAGE_FORBIDDEN: ['이 메시지 작업을 할 권한이 없습니다.', 403],
  MESSAGE_NOT_FOUND: ['메시지를 찾지 못했습니다.', 404],
  MESSAGE_INVALID: ['메시지와 받는 사람을 확인해 주세요.', 400],
  MESSAGE_REQUEST_REUSED: ['다른 내용으로 사용된 전송 요청입니다. 보낸 메시지를 확인해 주세요.', 409],
  MESSAGE_RECIPIENT_UNAVAILABLE: ['지금 메시지를 받을 수 없는 회원이 있습니다. 받는 사람을 다시 확인해 주세요.', 409],
  MESSAGE_RECIPIENT_CHANGED: ['선택한 챌린지의 완료 참여자가 아닙니다. 받는 사람을 다시 확인해 주세요.', 409],
  MESSAGE_RATE_LIMIT: ['잠시 후 다시 보내 주세요.', 429],
};
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function requiredId(value: unknown) { if (!uuid(value)) fail('요청 정보를 확인해 주세요.'); return value as string; }
function optionalId(value: unknown) { return value == null || value === '' ? null : requiredId(value); }
function failure(error: unknown) {
  const e = error as { message?: string; status?: number }, known = errors[e.message || ''];
  return known ? reply({ error: known[0], code: e.message }, known[1]) : e.status && e.status < 500 ? reply({ error: e.message }, e.status) : reply({ error: '결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.' }, 503);
}
async function actor() {
  if (process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED !== 'true') fail('메시지 기능을 준비 중입니다.', 404);
  const user = await getAuthenticatedUser(); if (!user) fail('로그인이 필요합니다.', 401); return user;
}
async function bodyOf(request: Request) {
  const reader = request.body?.getReader(); if (!reader) fail('입력 형식을 확인해 주세요.');
  let size = 0; const chunks: string[] = [], decoder = new TextDecoder();
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 40000) { await reader.cancel(); fail('메시지가 너무 깁니다.', 413); } chunks.push(decoder.decode(value, { stream: true })); } chunks.push(decoder.decode()); }
  finally { reader.releaseLock(); }
  try { const body = JSON.parse(chunks.join('')); if (!body || typeof body !== 'object' || Array.isArray(body)) fail('입력 형식을 확인해 주세요.'); return body; } catch { fail('입력 형식을 확인해 주세요.'); }
}
export async function GET(request: Request) {
  try {
    const user = await actor(), q = new URL(request.url).searchParams, db = createAdminClient();
    if (q.get('action') === 'unread') {
      const r = await db.rpc('edu_unread_member_messages', { p_actor: user.id }); if (r.error) throw r.error; return reply(r.data);
    }
    if (q.get('action') === 'recipients') {
      const search = q.get('search') || ''; if (search.length > 100) fail('검색어가 너무 깁니다.');
      const r = await db.rpc('edu_message_recipients', { p_actor: user.id, p_search: search, p_after: optionalId(q.get('after')), p_ongoing: optionalId(q.get('ongoing')) });
      if (r.error) throw r.error; return reply(r.data);
    }
    if (q.get('action') && q.get('action') !== 'list') fail('조회 요청을 확인해 주세요.');
    const box = q.get('box') || 'inbox', before = q.get('before');
    if (!['inbox', 'sent'].includes(box) || (before !== null && (!/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > BigInt('9223372036854775807')))) fail('목록 조건을 확인해 주세요.');
    const r = await db.rpc('edu_list_member_messages', { p_actor: user.id, p_box: box, p_before: before }); if (r.error) throw r.error; return reply(r.data);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('허용되지 않은 요청입니다.', 403);
    const user = await actor(), body = await bodyOf(request), db = createAdminClient();
    if (body.action === 'read') {
      const r = await db.rpc('edu_mark_member_message_read', { p_actor: user.id, p_message: requiredId(body.messageId) }); if (r.error) throw r.error; return reply(r.data);
    }
    if (body.action !== 'send' || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 5000 || !Array.isArray(body.recipients) || body.recipients.length > 100) fail('메시지와 받는 사람을 확인해 주세요.');
    const recipients = [...new Set(body.recipients.map(requiredId))].sort(), replyTo = optionalId(body.replyTo);
    if (replyTo && recipients.length) fail('답장할 메시지를 확인해 주세요.');
    const r = await db.rpc('edu_send_member_message', { p_actor: user.id, p_request: requiredId(body.requestId), p_content: body.content, p_recipients: recipients, p_reply: replyTo, p_ongoing: optionalId(body.ongoingLesson) });
    if (r.error) throw r.error; return reply(r.data);
  } catch (error) { return failure(error); }
}
