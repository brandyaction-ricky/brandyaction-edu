import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { readProductReviewContext, readPublishedProductReviews } from '@/lib/product-reviews-server';

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const course = params.get('course') || '';
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(course)) return reply({ error: '클래스를 확인해 주세요.' }, 400);
    const page = Number(params.get('page') || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return reply({ error: '후기 페이지를 확인해 주세요.' }, 400);
    if (params.get('context') === '1') {
      const user = await getAuthenticatedUser();
      if (!user) return reply({ error: '로그인 후 후기를 작성해 주세요.' }, 401);
      return reply(await readProductReviewContext(await createClient(), user.id, course));
    }
    return reply(await readPublishedProductReviews(await createClient(), course, page));
  } catch (error) {
    const status = (error as { status?: number }).status;
    return reply({ error: status === 404 ? '클래스를 찾을 수 없습니다.' : '후기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, status === 404 ? 404 : 503);
  }
}
