import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { DEFAULT_MVP_COLOR, mvpColor, mvpSelection, type MemberMvp, type MvpSettings } from '@/lib/member-mvp';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const enabled = () => process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true';
const unavailable = () => reply({ error: '우수 수강생 설정을 처리하지 못했습니다. 다시 시도해 주세요.' }, 503);
const conflict = () => reply({ error: '다른 관리자가 먼저 변경했습니다. 입력 내용을 보관하고 저장된 설정을 다시 불러와 주세요.' }, 409);
type DB = ReturnType<typeof createAdminClient>;
async function defaults(db: DB): Promise<MvpSettings> {
  const result = await db.from('edu_mvp_settings').select('color,revision').eq('id', true).abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return { color: DEFAULT_MVP_COLOR, revision: null };
  if (!uuid(result.data.revision)) throw Error();
  return { color: mvpColor(result.data.color), revision: result.data.revision };
}
async function members(db: DB, ids: string[]): Promise<MemberMvp[]> {
  const profiles = await db.from('profiles').select('id').in('id', ids).neq('status', 'withdrawn').abortSignal(AbortSignal.timeout(10_000));
  if (profiles.error) throw profiles.error;
  const result = await db.from('edu_member_mvp').select('user_id,is_mvp,border_color,revision').in('user_id', ids).abortSignal(AbortSignal.timeout(10_000));
  if (result.error) throw result.error;
  return (profiles.data ?? []).map(profile => {
    const row = (result.data ?? []).find(item => item.user_id === profile.id);
    if (!row) return { member: profile.id, isMvp: false, color: null, revision: null };
    if (!uuid(row.revision)) throw Error();
    return { member: profile.id, ...mvpSelection(row.is_mvp, row.border_color), revision: row.revision };
  });
}
export async function GET(request: Request) {
  if (!enabled()) return reply({ error: '아직 사용할 수 없습니다.' }, 404);
  try {
    const user = await getAuthenticatedUser(); if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const params = new URL(request.url).searchParams, settings = params.get('settings') === 'true';
    if (settings ? user.role !== 'admin' : !await getOperatorUser('members', user)) return reply({ error: '이 설정을 확인할 권한이 없습니다.' }, 403);
    const ids = [...new Set((params.get('members') || '').split(','))];
    if (!settings && (!ids.length || ids.length > 100 || !ids.every(uuid))) return reply({ error: '회원을 최대 100명까지 선택해 주세요.' }, 400);
    const db = createAdminClient(), style = await defaults(db);
    if (settings) return reply({ settings: style, canManage: true });
    return reply({ members: await members(db, ids), defaultColor: style.color, canManage: user.role === 'admin' });
  } catch { return unavailable(); }
}
export async function PUT(request: Request) {
  if (!enabled()) return reply({ error: '아직 사용할 수 없습니다.' }, 404);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
  try {
    const user = await getAuthenticatedUser(); if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (user.role !== 'admin') return reply({ error: '우수 수강생 선정과 색상 변경은 관리자만 할 수 있습니다.' }, 403);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: '입력 내용을 확인해 주세요.' }, 400);
    let raw = '', size = 0; const decoder = new TextDecoder();
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 2048) { await reader.cancel(); return reply({ error: '입력 내용이 너무 큽니다.' }, 413); } raw += decoder.decode(part.value, { stream: true }); } raw += decoder.decode(); } finally { reader.releaseLock(); }
    let body: Record<string, unknown>, selection: ReturnType<typeof mvpSelection> | null = null, color: string | null = null;
    try {
      body = JSON.parse(raw);
      if (!body || Array.isArray(body) || !['member', 'settings'].includes(String(body.kind)) || !uuid(body.requestId) || !(body.expectedRevision === null || uuid(body.expectedRevision))) throw Error();
      const allowed = body.kind === 'member' ? ['kind', 'member', 'isMvp', 'color', 'expectedRevision', 'requestId'] : ['kind', 'color', 'expectedRevision', 'requestId'];
      if (Object.keys(body).some(key => !allowed.includes(key))) throw Error();
      if (body.kind === 'member') { if (!uuid(body.member)) throw Error(); selection = mvpSelection(body.isMvp, body.color); } else color = mvpColor(body.color);
    } catch { return reply({ error: '회원·선정 여부와 색상(#FFD700 형식)을 확인해 주세요.' }, 400); }
    const db = createAdminClient(), isSettings = body.kind === 'settings';
    const current = isSettings ? await defaults(db) : (await members(db, [String(body.member)]))[0];
    if (!current) return reply({ error: '회원을 찾을 수 없거나 탈퇴한 회원입니다.' }, 404);
    const matches = (value: typeof current) => value.revision === body.requestId && (isSettings ? value.color === color : 'isMvp' in value && value.isMvp === selection!.isMvp && value.color === selection!.color);
    if (current.revision === body.requestId) return matches(current) ? reply({ value: current }) : conflict();
    if (current.revision !== body.expectedRevision) return conflict();
    const table = isSettings ? 'edu_mvp_settings' : 'edu_member_mvp', key = isSettings ? 'id' : 'user_id', keyValue = isSettings ? true : String(body.member);
    const row = { ...(isSettings ? { color } : { is_mvp: selection!.isMvp, border_color: selection!.color }), revision: body.requestId, updated_by: user.id, updated_at: new Date().toISOString() };
    const result = body.expectedRevision === null
      ? await db.from(table).insert({ [key]: keyValue, ...row }).select('revision').abortSignal(AbortSignal.timeout(10_000)).maybeSingle()
      : await db.from(table).update(row).eq(key, keyValue).eq('revision', body.expectedRevision).select('revision').abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
    if (result.error && result.error.code !== '23505') throw result.error;
    if (result.error || !result.data) {
      const latest = isSettings ? await defaults(db) : (await members(db, [String(body.member)]))[0];
      return latest && matches(latest) ? reply({ value: latest }) : conflict();
    }
    return reply({ value: { ...(isSettings ? { color } : { member: body.member, ...selection }), revision: body.requestId } });
  } catch { return unavailable(); }
}
