import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { ShortLinkError, shortLinkCreateInput, shortLinkPatchInput, toShortLink } from '@/lib/short-links';
import { createShortLink, listShortLinks, readShortLinkBody, updateShortLink } from '@/lib/short-links-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Server-to-server only (BrandyAction OS). Same shape as MYIN /api/integrations/brandy-os/links: { data } or { message }.
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' } });
const digest = (value: string) => createHash('sha256').update(value).digest();

function check(request: Request) {
  const secret = process.env.EDU_OS_LINKS_SECRET?.trim();
  if (!secret || secret.length < 32) throw new ShortLinkError('에듀 연결 설정이 아직 없어요.', 503);
  if (request.headers.has('origin')) throw new ShortLinkError('서버끼리만 쓸 수 있어요.', 403);
  const token = /^Bearer (\S{1,512})$/.exec(request.headers.get('authorization') || '')?.[1];
  if (!token || !timingSafeEqual(digest(token), digest(secret))) throw new ShortLinkError('연결 키가 맞지 않아요.', 401);
}

async function handle(request: Request) {
  try {
    check(request);
    const db = createAdminClient(), origin = new URL(request.url).origin;
    if (request.method === 'GET') return reply({ data: { items: (await listShortLinks(db)).map(row => toShortLink(row, origin)) } });
    const body = await readShortLinkBody(request);
    const by = body && typeof body === 'object' && /^os:[A-Za-z0-9_-]{1,64}$/.test(String((body as { by?: unknown }).by)) ? String((body as { by: string }).by) : 'os';
    if (request.method === 'POST') {
      const { row, created } = await createShortLink(db, shortLinkCreateInput(body), by, true);
      return reply({ data: { ...toShortLink(row, origin), created } }, created ? 201 : 200);
    }
    return reply({ data: toShortLink(await updateShortLink(db, shortLinkPatchInput(body), by), origin) });
  } catch (e) {
    const status = e instanceof ShortLinkError ? e.status : 503;
    // Neither the key nor database errors enter responses.
    return reply({ message: status === 503 && !(e instanceof ShortLinkError) ? '단축 링크를 처리하지 못했어요. 잠시 뒤 다시 해 주세요.' : (e as Error).message }, status);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
