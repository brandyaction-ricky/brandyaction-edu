import { createHash } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { uuid } from '@/lib/edu-workflows';
import { APP_BRANDING_KEY, APP_BRANDING_TAG, APP_ICON_MAX_BYTES, iconPath, publicAppBranding, validateIconFile } from '@/lib/app-branding';
import { readStoredAppBranding } from '@/lib/app-branding-server';
import { renderAppIcons } from '@/lib/app-icon-image';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
const conflict = () => reply({ error: '다른 화면에서 아이콘을 변경했습니다. 최신 설정을 다시 불러와 주세요.' }, 409);
function fail(message: string, status = 400): never { throw Object.assign(Error(message), { status }); }
async function actor() {
  if (process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED !== 'true') fail('아직 사용할 수 없습니다.', 404);
  const user = await getAuthenticatedUser();
  if (!user) fail('로그인이 필요합니다.', 401);
  if (user.role !== 'admin') fail('앱 아이콘은 관리자만 변경할 수 있습니다.', 403);
  return user;
}
function problem(error: unknown) {
  const e = error as { status?: number; message?: string };
  return reply({ error: e.status ? e.message : '아이콘 설정을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, e.status || 503);
}
export async function GET() {
  try { await actor(); return reply(publicAppBranding(await readStoredAppBranding(createAdminClient()), process.env.NEXT_PUBLIC_SUPABASE_URL)); }
  catch (e) { return problem(e); }
}
async function form(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) fail('이미지를 다시 선택해 주세요.');
  const reader = request.body?.getReader(); if (!reader) fail('이미지를 다시 선택해 주세요.');
  let length = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength;
    if (length > APP_ICON_MAX_BYTES + 16384) { await reader.cancel(); fail('2MB 이하의 이미지를 선택해 주세요.', 413); } chunks.push(part.value);
  } } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData(); }
  catch { return fail('이미지를 다시 선택해 주세요.'); }
}
export async function POST(request: Request) {
  let cleanup: (() => Promise<unknown>) | null = null, writeStarted = false;
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('요청 출처를 확인해 주세요.', 403);
    const user = await actor(), body = await form(request);
    const action = body.get('action'), expected = body.get('expectedRevision') || null, requestId = body.get('requestId');
    if (!['replace', 'reset'].includes(String(action)) || !uuid(requestId) || !(expected === null || uuid(expected)) || [...body.keys()].some(k => !['action', 'expectedRevision', 'requestId', 'file'].includes(k)) || [...new Set(body.keys())].some(k => body.getAll(k).length !== 1)) fail('저장 요청을 확인해 주세요.');
    const file = body.get('file'); let bytes: Buffer | null = null;
    if (action === 'replace') {
      if (!(file instanceof File)) fail('이미지를 선택해 주세요.');
      try { validateIconFile(file); } catch (e) { fail((e as Error).message); }
      bytes = Buffer.from(await file.arrayBuffer());
    } else if (file) fail('기본 아이콘 복원 요청을 확인해 주세요.');
    const sourceHash = bytes ? createHash('sha256').update(bytes).digest('hex') : null;
    const db = createAdminClient(), current = await readStoredAppBranding(db);
    const success = (value: typeof current) => { revalidateTag(APP_BRANDING_TAG, { expire: 0 }); return reply(publicAppBranding(value, process.env.NEXT_PUBLIC_SUPABASE_URL)); };
    if (current.revision === requestId) return current.sourceHash === sourceHash ? success(current) : conflict();
    if (current.revision !== expected) return conflict();
    const iconId = bytes ? crypto.randomUUID() : null;
    if (bytes && iconId) {
      let images; try { images = await renderAppIcons(bytes); } catch (e) { fail((e as Error).message); }
      const bucket = db.storage.from('course-assets'), paths = images.map(image => iconPath(iconId, image.size));
      cleanup = () => bucket.remove(paths);
      for (const image of images) {
        const result = await bucket.upload(iconPath(iconId, image.size), image.bytes, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
        if (result.error) throw result.error;
      }
    }
    const value = { revision: String(requestId), iconId, sourceHash };
    const row = { value, is_public: false, updated_by: user.id, updated_at: new Date().toISOString() };
    writeStarted = true;
    const result = expected === null
      ? await db.from('site_settings').insert({ key: APP_BRANDING_KEY, ...row }).select('key').abortSignal(AbortSignal.timeout(10_000)).maybeSingle()
      : await db.from('site_settings').update(row).eq('key', APP_BRANDING_KEY).eq('is_public', false).eq('value->>revision', expected).select('key').abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
    if (result.error && result.error.code !== '23505') throw result.error;
    if (result.error || !result.data) {
      // An explicit conflict cannot refer to this request's fresh asset ID.
      await cleanup?.(); cleanup = null;
      const latest = await readStoredAppBranding(db);
      return latest.revision === requestId && latest.sourceHash === sourceHash ? success(latest) : conflict();
    }
    return success(value);
  } catch (e) {
    // A timed-out DB write may have committed: never delete a possibly live icon.
    if (!writeStarted) try { await cleanup?.(); } catch { /* Orphaned immutable files can be cleaned separately. */ }
    return problem(e);
  }
}
