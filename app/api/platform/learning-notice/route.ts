import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';
import { LEARNING_NOTICE_KEY, noticeMessage, readLearningNotice } from '@/lib/learning-notice';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
const unavailable = () => reply({ error: '공지를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
const conflict = () => reply({ error: '다른 화면에서 공지를 변경했습니다. 입력한 문구를 보관하고 최신 공지를 다시 불러와 주세요.' }, 409);
const enabled = () => process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true';
async function read(db: ReturnType<typeof createAdminClient>) {
  const result = await db.from('site_settings').select('value').eq('key', LEARNING_NOTICE_KEY).eq('is_public', false).abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
  if (result.error) throw result.error;
  return readLearningNotice(result.data?.value);
}
export async function GET(request: Request) {
  if (!enabled()) return reply({ error: '아직 사용할 수 없습니다.' }, 404);
  try {
    const manage = new URL(request.url).searchParams.get('manage') === 'true';
    if (manage) {
      const user = await getAuthenticatedUser();
      if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
      if (user.role !== 'admin') return reply({ error: '전체 공지는 관리자만 변경할 수 있습니다.' }, 403);
    }
    const notice = await read(createAdminClient());
    return reply(manage ? notice : { message: notice.message });
  } catch { return unavailable(); }
}
export async function PUT(request: Request) {
  if (!enabled()) return reply({ error: '아직 사용할 수 없습니다.' }, 404);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (user.role !== 'admin') return reply({ error: '전체 공지는 관리자만 변경할 수 있습니다.' }, 403);
    // Bounded streaming read; a forged Content-Length cannot bypass the limit.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: '입력 내용을 확인해 주세요.' }, 400);
    let raw = '', size = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 2048) { await reader.cancel(); return reply({ error: '입력 내용이 너무 큽니다.' }, 413); }
        raw += decoder.decode(part.value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    let message: string, expected: string | null, requestId: string;
    try {
      const body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['message', 'expectedRevision', 'requestId'].includes(key)) || !uuid(body.requestId) || !(body.expectedRevision === null || uuid(body.expectedRevision))) throw Error();
      message = noticeMessage(body.message); expected = body.expectedRevision; requestId = body.requestId;
    } catch { return reply({ error: '공지 문구(최대 200자)와 저장 요청을 확인해 주세요.' }, 400); }
    const db = createAdminClient(), current = await read(db);
    if (current.revision === requestId) return current.message === message ? reply(current) : conflict();
    if (current.revision !== expected) return conflict();
    const value = { message, revision: requestId };
    const row = { value, is_public: false, updated_by: user.id, updated_at: new Date().toISOString() };
    const result = expected === null
      ? await db.from('site_settings').insert({ key: LEARNING_NOTICE_KEY, ...row }).select('key').abortSignal(AbortSignal.timeout(10_000)).maybeSingle()
      : await db.from('site_settings').update(row).eq('key', LEARNING_NOTICE_KEY).eq('is_public', false).eq('value->>revision', expected).select('key').abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
    if (result.error && result.error.code !== '23505') throw result.error;
    if (result.error || !result.data) {
      const latest = await read(db);
      return latest.revision === requestId && latest.message === message ? reply(latest) : conflict();
    }
    return reply(value);
  } catch { return unavailable(); }
}
