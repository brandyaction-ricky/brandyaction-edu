import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { hasLearningAccess } from '@/lib/platform-rules';
import { productResources } from '@/lib/product-metadata';
export async function GET(request: Request) {
    const user = await getAuthenticatedUser();
    const params = new URL(request.url).searchParams;
    const resource = params.get('resource');
    const course = params.get('course');
    if (resource || course) {
        if (!resource || !course || !/^[0-9a-f-]{36}$/i.test(resource) || !/^[0-9a-f-]{36}$/i.test(course)) return Response.json({ error: '자료를 선택해 주세요.' }, { status: 400 });
        const admin = createAdminClient();
        const { data: product } = await admin.from('courses').select('id,status,metadata').eq('id', course).eq('status', 'published').single();
        const item = product ? productResources((product.metadata || {}) as Record<string, unknown>).find(entry => entry.id === resource) : undefined;
        if (!item?.path) return Response.json({ error: '공개된 자료가 아닙니다.' }, { status: 404 });
        if (item.scope !== 'public') {
            if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
            if (item.scope === 'enrolled' || item.scope === 'purchaser') {
                const enrollmentResult = await admin.from('enrollments').select('id,status,revoked_at,access_starts_at,access_ends_at,order_item_id').eq('user_id', user.id).eq('course_id', course).eq('status', 'active').limit(20);
                const enrollment = (enrollmentResult.data || []).find(entry => hasLearningAccess(entry));
                if (!enrollment) return Response.json({ error: '자료를 이용할 수강 권한이 없습니다.' }, { status: 403 });
                if (item.scope === 'purchaser') {
                    if (!enrollment.order_item_id) return Response.json({ error: '구매자 전용 자료입니다.' }, { status: 403 });
                    const { data: orderItem } = await admin.from('order_items').select('unit_price').eq('id', enrollment.order_item_id).gt('unit_price', 0).maybeSingle();
                    if (!orderItem) return Response.json({ error: '구매자 전용 자료입니다.' }, { status: 403 });
                }
            }
        }
        const { data, error } = await admin.storage.from('course-resources').createSignedUrl(item.path, 60, { download: item.name });
        if (error || !data) return Response.json({ error: '자료를 다운로드하지 못했습니다.' }, { status: 503 });
        return Response.redirect(data.signedUrl, 303);
    }
    if (!user) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const lesson = params.get('lesson');
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
