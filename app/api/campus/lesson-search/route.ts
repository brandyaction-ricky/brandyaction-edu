import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCampusId } from '@/features/campus/snapshot';
import { loadCampusSnapshot } from '@/features/campus/repository';
import { loadLessonTexts, searchLessons } from '@/features/campus/lesson-search';
export const dynamic = 'force-dynamic';
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function GET(request: Request) {
  if (process.env.EDU_CAMPUS_ENABLED !== 'true') return reply({ error: '준비 중인 기능입니다.' }, 404);
  const params = new URL(request.url).searchParams, enrollmentId = params.get('enrollmentId'), q = (params.get('q') || '').slice(0, 100);
  if (!enrollmentId || !isCampusId(enrollmentId)) return reply({ error: '수강권을 확인해 주세요.' }, 400);
  try {
    const viewer = await getAuthenticatedUser();
    if (!viewer) return reply({ error: '로그인이 필요합니다.' }, 401);
    // The snapshot decides which lessons this learner's cohort may see; only those are searched.
    const snapshot = await loadCampusSnapshot(await createClient(), viewer, enrollmentId);
    return reply({ hits: searchLessons(await loadLessonTexts(createAdminClient(), snapshot.lessons), q) });
  } catch (error) {
    const denied = error instanceof Error && 'status' in error && error.status === 403;
    return reply({ error: denied ? '현재 이용 가능한 수강권을 선택해 주세요.' : '수업을 찾지 못했습니다. 다시 시도해 주세요.' }, denied ? 403 : 503);
  }
}
