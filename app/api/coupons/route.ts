import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { couponError } from '@/lib/coupon-rules';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const params = new URL(request.url).searchParams;
    const db = createAdminClient();
    if (params.has('history')) {
      if (user.role !== 'admin') return reply({ error: '관리자 권한이 필요합니다.' }, 403);
      const id = params.get('history');
      if (!uuid(id)) return reply({ error: '쿠폰을 확인해 주세요.' }, 400);
      const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1));
      const result = await db.from('coupon_redemptions').select('id,order_id,status,original_amount,discount_amount,final_amount,used_at,cancelled_at,created_at,profiles(full_name),orders(order_number,status,total_amount,order_items(item_name,unit_price,quantity))', { count: 'exact' })
        .eq('coupon_id', id).order('created_at', { ascending: false }).order('id').range((page - 1) * 30, page * 30 - 1);
      if (result.error) throw result.error;
      return reply({ rows: result.data, count: result.count, page });
    }
    const cohort = params.get('cohort');
    if (!uuid(cohort)) return reply({ error: '신청할 기수를 확인해 주세요.' }, 400);
    const result = await db.rpc('edu_available_coupons', { p_user: user.id, p_cohort: cohort });
    if (result.error) throw result.error;
    return reply({ coupons: result.data });
  } catch { return reply({ error: '쿠폰 정보를 불러오지 못했습니다. 다시 시도해 주세요.' }, 503); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '허용되지 않은 요청입니다.' }, 403);
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    const body = await request.json();
    const db = createAdminClient();
    if (body.action === 'cancel-zero') {
      if (user.role !== 'admin') return reply({ error: '관리자 권한이 필요합니다.' }, 403);
      if (!uuid(body.orderId)) return reply({ error: '주문을 확인해 주세요.' }, 400);
      const result = await db.rpc('edu_cancel_zero_order', { p_actor: user.id, p_order: body.orderId });
      if (result.error) return reply({ error: '0원 완료 주문만 취소할 수 있습니다.' }, 409);
      return reply({ ok: true });
    }
    // This endpoint accepts codes only. A guessed coupon ID or body role is never authoritative.
    if (body.couponId || !uuid(body.cohortId) || typeof body.code !== 'string' || body.code.length > 30) return reply({ error: '쿠폰 코드와 기수를 확인해 주세요.' }, 400);
    const result = await db.rpc('edu_coupon_quote', { p_user: user.id, p_cohort: body.cohortId, p_code: body.code });
    if (result.error) return reply({ error: couponError(result.error.message) }, 409);
    return reply(result.data);
  } catch { return reply({ error: '쿠폰을 확인하지 못했습니다. 다시 시도해 주세요.' }, 503); }
}
