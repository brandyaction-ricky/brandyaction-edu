import { createClient } from '@/lib/supabase/server';
import { listedProducts } from '@/lib/product-visibility';
import type { Row } from '@/lib/platform';

export const dynamic = 'force-dynamic';
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export async function GET(request: Request) {
  const paths = new Set<string>();
  // Preview and DEV must not advertise any test content to crawlers.
  if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
    const db = await createClient();
    paths.add('/'); paths.add('/classes'); paths.add('/articles'); paths.add('/stories');
    for (const table of ['courses', 'articles']) {
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db.from(table)
          .select(table === 'courses' ? 'id,slug,metadata' : 'id,slug')
          .eq('status', 'published').is('archived_at', null)
          .order('id').range(offset, offset + 499);
        if (error) return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
        const rows = (data || []) as unknown as Row[];
        for (const row of table === 'courses' ? listedProducts(rows) : rows) {
          if (typeof row.slug === 'string' && /^[a-z0-9-]+$/.test(row.slug)) paths.add(`/${table === 'courses' ? 'classes' : 'articles'}/${row.slug}`);
        }
        if (rows.length < 500) break;
      }
    }
  }
  const origin = new URL(request.url).origin;
  const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    + [...paths].map(path => `<url><loc>${escapeXml(origin + path)}</loc></url>`).join('') + '</urlset>';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
}
