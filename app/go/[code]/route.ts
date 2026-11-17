import { createAdminClient } from '@/lib/supabase/admin';
import { recordBroadcastRequest } from '@/lib/broadcast-entry';
import { shortLinkKey, shortLinkTarget } from '@/lib/short-links';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ code: string }> };
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
// Fixed short link: only destinations stored by operators are followed (never one from the request).
async function handle(request: Request, context: Context) {
  const key = shortLinkKey((await context.params).code);
  let target: string | null = null;
  if (key) {
    try {
      // Same filter as broadcast links: HEAD, link previews, prefetch and internal test visits are not counted.
      const { data, error } = await createAdminClient().rpc('edu_short_link_hit', { p_key: key, p_record: recordBroadcastRequest(request) });
      if (error) throw error;
      target = data == null ? null : shortLinkTarget(data);
      if (data != null && !target) throw new Error('Invalid destination');
    } catch {
      return new Response(request.method === 'HEAD' ? null : '링크를 잠시 열 수 없어요. 조금 뒤 다시 눌러 주세요.',
        { status: 503, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  }
  // Unknown or switched-off links go to the home page, so old content never dead-ends.
  return new Response(null, { status: 302, headers: { ...headers, Location: target || new URL('/', request.url).href } });
}
export const GET = handle;
export const HEAD = handle;
