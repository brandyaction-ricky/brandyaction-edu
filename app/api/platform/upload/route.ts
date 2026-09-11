import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/server-auth';

export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  if (!await getAdminUser()) return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    const image = form.get('kind') === 'image';
    if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) return Response.json({ error: '4MB 이하의 파일을 선택해 주세요.' }, { status: 400 });
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const allowed: Record<string, string> = image ? { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } : { pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    if (!allowed[extension]) return Response.json({ error: image ? 'PNG, JPG, WEBP 이미지를 선택해 주세요.' : 'PDF, ZIP, TXT, DOCX, XLSX 파일을 선택해 주세요.' }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    if (image) {
      const valid = extension === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : extension === 'webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!valid) return Response.json({ error: '이미지 파일 형식을 확인해 주세요.' }, { status: 400 });
    }
    const db = createAdminClient();
    const bucket = image ? 'course-assets' : 'course-resources';
    const path = `edu/${crypto.randomUUID()}.${extension}`;
    const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType: allowed[extension], upsert: false });
    if (error) { console.error('platform upload', error.message); return Response.json({ error: '파일을 올리지 못했습니다. 파일 형식과 용량을 확인해 주세요.' }, { status: 409 }); }
    return Response.json({ value: image ? db.storage.from(bucket).getPublicUrl(path).data.publicUrl : path, name: file.name });
  } catch {
    return Response.json({ error: '파일을 올리지 못했습니다. 다시 시도해 주세요.' }, { status: 500 });
  }
}
