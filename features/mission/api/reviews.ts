import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { reviewQuery } from './review-query';

const reply = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export async function readMissionReviews(request: Request) {
  try {
    const operator = await getOperatorUser('members');
    if (!operator) return reply({ error: '제출물을 조회할 운영 권한이 필요합니다.' }, 403);
    let query;
    try { query = reviewQuery(new URL(request.url).searchParams); }
    catch { return reply({ error: '조회 조건을 확인해 주세요.' }, 400); }
    const result = await createAdminClient().rpc('mission_review_queue', {
      p_actor: operator.id, p_status: query.status, p_query: query.query,
      p_sort: query.sort, p_page: query.page, p_submission: query.submission,
    });
    if (result.error) throw result.error;
    return reply(result.data);
  } catch {
    return reply({ error: '제출물을 불러오지 못했습니다. 다시 시도해 주세요.' }, 503);
  }
}
