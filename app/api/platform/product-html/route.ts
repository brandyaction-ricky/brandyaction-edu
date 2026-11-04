import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { permissionsFor } from '@/lib/operator-permissions';
import { validProductDocumentPath } from '@/lib/product-html-document';
import { checkProductDocumentFile, PRODUCT_DOCUMENT_BUCKET } from '@/lib/product-html-storage';

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get('file');
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!validProductDocumentPath(path)) return Response.json({ error: '상세페이지 파일을 확인해 주세요.' }, { status: 400, headers });
  try {
    const db = createAdminClient();
    const course = await db.from('courses').select('id,status,archived_at').contains('metadata', { detail_html_file: path }).eq('status', 'published').is('archived_at', null).limit(1).maybeSingle();
    if (course.error) throw new Error('lookup');
    if (course.data?.status !== 'published') {
      const user = await getAuthenticatedUser();
      const permissions = user ? await permissionsFor(user) : null;
      if (!user || !permissions?.products) return Response.json({ error: '상세페이지를 볼 수 없습니다.' }, { status: 404, headers });
    }
    await checkProductDocumentFile(db, path);
    const signed = await db.storage.from(PRODUCT_DOCUMENT_BUCKET).createSignedUrl(path, 60, { download: 'detail.txt' });
    if (signed.error || !signed.data?.signedUrl) throw new Error('sign');
    return Response.json({ url: signed.data.signedUrl }, { headers });
  } catch {
    return Response.json({ error: '상세페이지를 불러오지 못했습니다. 다시 시도해 주세요.' }, { status: 409, headers });
  }
}
