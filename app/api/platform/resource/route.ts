import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
export async function GET(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user)
        return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const lesson = new URL(request.url).searchParams.get('lesson');
    if (!lesson || !/^[0-9a-f-]{36}$/i.test(lesson))
        return Response.json({ error: '자료를 선택해 주세요.' }, { status: 400 });
    const db = await createClient();
    const { data: published } = await db.from('curriculum_lessons').select('id,curriculum_weeks!inner(is_published)').eq('id', lesson).eq('is_published', true).eq('curriculum_weeks.is_published', true).single();
    if (!published) return Response.json({ error: '공개된 자료가 아닙니다.' }, { status: 403 });
    const { data: content } = await db.from('lesson_contents').select('resource_storage_path,resource_name').eq('lesson_id', lesson).single();
    if (!content?.resource_storage_path)
        return Response.json({ error: '자료를 이용할 권한이 없습니다.' }, { status: 403 });
    const { data, error } = await createAdminClient().storage.from('course-resources').createSignedUrl(content.resource_storage_path, 60, { download: content.resource_name || true });
    if (error || !data)
        return Response.json({ error: '자료를 다운로드하지 못했습니다.' }, { status: 503 });
    return Response.redirect(data.signedUrl, 303);
}
