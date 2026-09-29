import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';
import { encouragementInput, readEncouragement } from '@/lib/member-encouragement';

const table = 'edu_member_encouragements';
const enabled = () => process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
const unavailable = () => reply({ error: '응원 메시지를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
const conflict = () => reply({ error: '다른 화면에서 메시지를 변경했습니다. 작성한 내용을 보관하고 저장된 메시지를 다시 불러와 주세요.' }, 409);
async function readOwn(db: ReturnType<typeof createAdminClient>, userId: string) {
  const result = await db.from(table).select('public_name,message,revision').eq('user_id', userId).abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
  if (result.error) throw result.error;
  return readEncouragement(result.data ? { publicName: result.data.public_name, message: result.data.message, revision: result.data.revision } : null);
}
export async function GET(request: Request) {
  if (!enabled()) return reply({ error: '아직 사용할 수 없습니다.' }, 404);
  const params = new URL(request.url).searchParams;
  try {
    if (params.get('mine') === 'true') {
      const user = await getAuthenticatedUser();
      if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
      return reply(await readOwn(createAdminClient(), user.id));
    }
    const cursor = params.get('cursor');
    if (cursor && !uuid(cursor)) return reply({ error: '조회 위치를 확인해 주세요.' }, 400);
    let query = createAdminClient().from(table).select('id,public_name,message,profiles!inner(status)').eq('profiles.status', 'active').neq('message', '').order('id', { ascending: true }).limit(51);
    if (cursor) query = query.gt('id', cursor);
    const result = await query.abortSignal(AbortSignal.timeout(10_000));
    if (result.error) throw result.error;
    const rows = (result.data ?? []).slice(0, 50).map(row => ({ id: row.id, ...encouragementInput(row.public_name, row.message) }));
    return reply({ rows, nextCursor: (result.data?.length ?? 0) > 50 ? rows[rows.length - 1].id : null });
  } catch { return unavailable(); }
}
export async function PUT(request: Request) {
  if (!enabled()) return reply({ error: '아직 사용할 수 없습니다.' }, 404);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
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
    let content: ReturnType<typeof encouragementInput>, expected: string | null, requestId: string;
    try {
      const body = JSON.parse(raw);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['publicName', 'message', 'expectedRevision', 'requestId'].includes(key)) || !uuid(body.requestId) || !(body.expectedRevision === null || uuid(body.expectedRevision))) throw Error();
      content = encouragementInput(body.publicName, body.message); expected = body.expectedRevision; requestId = body.requestId;
    } catch { return reply({ error: '공개 별명(최대 40자), 응원 메시지(최대 80자)와 저장 요청을 확인해 주세요.' }, 400); }
    const db = createAdminClient(), current = await readOwn(db, user.id);
    const matches = (row: typeof current) => row.revision === requestId && row.publicName === content.publicName && row.message === content.message;
    if (current.revision === requestId) return matches(current) ? reply(current) : conflict();
    if (current.revision !== expected) return conflict();
    const row = { public_name: content.publicName, message: content.message, revision: requestId, updated_at: new Date().toISOString() };
    const result = expected === null
      ? await db.from(table).insert({ user_id: user.id, ...row }).select('revision').abortSignal(AbortSignal.timeout(10_000)).maybeSingle()
      : await db.from(table).update(row).eq('user_id', user.id).eq('revision', expected).select('revision').abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
    if (result.error && result.error.code !== '23505') throw result.error;
    if (result.error || !result.data) {
      const latest = await readOwn(db, user.id);
      return matches(latest) ? reply(latest) : conflict();
    }
    return reply({ ...content, revision: requestId });
  } catch { return unavailable(); }
}
