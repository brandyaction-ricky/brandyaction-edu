import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { canReviewCurriculum } from '@/lib/staff-curriculum-review';
import { readCurriculumReview, readReviewContent, readReviewAsset, reviewId } from '@/lib/staff-curriculum-review-server';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedUser();
    if (!actor) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers });
    if (!canReviewCurriculum(actor)) return Response.json({ error: '관리자·직원만 검수할 수 있습니다.' }, { status: 403, headers });
    const p = new URL(request.url).searchParams;
    const cohort = p.has('cohort') ? reviewId(p.get('cohort')) : undefined;
    const enrollment = p.has('enrollment') ? reviewId(p.get('enrollment')) : undefined;
    const lesson = p.has('lesson') ? reviewId(p.get('lesson')) : undefined;
    if (lesson && cohort) {
      const student = p.get('student') === '1';
      if (p.has('asset') || p.get('resource') === '1') {
        const file = await readReviewAsset(actor, cohort, lesson, p.has('asset') ? reviewId(p.get('asset')) : null, student);
        if (p.get('metadata') === '1') return Response.json({ name: file.name, kind: file.kind, size: file.size }, { headers });
        const signed = await createAdminClient().storage.from(file.bucket).createSignedUrl(file.path, 60, { download: file.kind === 'file' || p.get('download') === '1' ? file.name : false });
        if (signed.error) throw signed.error;
        return new Response(null, { status: 303, headers: { ...headers, Location: signed.data.signedUrl } });
      }
      return Response.json(await readReviewContent(actor, cohort, lesson, student), { headers });
    }
    if (lesson || p.has('asset') || p.has('resource')) return Response.json({ error: '검수할 기수와 수업을 선택해 주세요.' }, { status: 400, headers });
    return Response.json(await readCurriculumReview(actor, { cohort, enrollment }), { headers });
  } catch (error) {
    const status = (error as { status?: number }).status || 503;
    return Response.json({ error: status < 500 ? (error as Error).message : '검수 화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status, headers });
  }
}
