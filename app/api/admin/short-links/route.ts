import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { ShortLinkError, shortLinkCreateInput, shortLinkPatchInput, toShortLink } from '@/lib/short-links';
import { createShortLink, listShortLinks, readShortLinkBody, updateShortLink } from '@/lib/short-links-server';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

async function handle(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    if (request.method !== 'GET' && request.headers.get('origin') !== origin) throw new ShortLinkError('요청 출처를 확인해 주세요.', 403);
    const actor = await getOperatorUser('marketing');
    if (!actor) throw new ShortLinkError('마케팅 권한이 필요합니다.', 403);
    const db = createAdminClient();
    if (request.method === 'GET') return reply({ items: (await listShortLinks(db)).map(row => toShortLink(row, origin)) });
    const body = await readShortLinkBody(request);
    if (request.method === 'POST') return reply({ item: toShortLink((await createShortLink(db, shortLinkCreateInput(body), actor.id)).row, origin) }, 201);
    return reply({ item: toShortLink(await updateShortLink(db, shortLinkPatchInput(body), actor.id), origin) });
  } catch (e) {
    const status = e instanceof ShortLinkError ? e.status : 503;
    return reply({ error: status === 503 ? '고정 링크를 처리하지 못했어요. 잠시 뒤 다시 해 주세요.' : (e as Error).message }, status);
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
