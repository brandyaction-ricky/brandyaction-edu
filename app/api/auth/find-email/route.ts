import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidPhone, normalizePhone } from '@/lib/auth-validation';
import { maskEmail } from '@/lib/crm-purchase-email';

const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({}, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({}, 415);
  const input = await request.json().catch(() => null);
  const order = typeof input?.order === 'string' ? input.order.trim().toUpperCase() : '';
  const phone = typeof input?.phone === 'string' ? input.phone.trim() : '';
  if (!/^BAE-\d{17}-[A-F0-9]{8}$/.test(order) || !/^[\d ()-]{10,20}$/.test(phone) || !isValidPhone(phone)) {
    return reply({ error: '주문번호와 결제할 때 입력한 전화번호를 확인해 주세요.' }, 400);
  }
  try {
    const db = createAdminClient();
    // Vercel overwrites this header. Other hosts share a conservative fallback bucket.
    const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || '';
    const hash = (s: string) => createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update(s).digest('hex');
    const gate = await db.rpc('edu_account_hint_allow', { p_client: hash('account-client:' + (process.env.VERCEL && isIP(ip) ? ip : 'shared')), p_order: hash('account-order:' + order) });
    if (gate.error) throw gate.error;
    if (gate.data !== true) return reply({ error: '조회 횟수를 초과했어요. 15분 뒤 다시 시도해 주세요.' }, 429);

    const purchase = await db.from('orders').select('user_id,customer_phone').eq('order_number', order)
      .in('status', ['paid', 'partially_refunded', 'refunded']).eq('is_test_order', false).maybeSingle();
    if (purchase.error) throw purchase.error;
    if (!purchase.data?.user_id || normalizePhone(purchase.data.customer_phone || '') !== normalizePhone(phone)) return reply({ hint: null });
    const member = await db.from('profiles').select('id').eq('id', purchase.data.user_id)
      .eq('status', 'active').is('deleted_at', null).eq('role', 'student').maybeSingle();
    if (member.error) throw member.error;
    if (!member.data) return reply({ hint: null });
    const account = await db.auth.admin.getUserById(member.data.id);
    if (account.error && account.error.status !== 404) throw account.error;
    const email = account.data.user?.email;
    return reply({ hint: email && /^[^@\s]+@[^@\s]+$/.test(email) ? maskEmail(email) : null });
  } catch {
    return reply({ error: '지금은 조회할 수 없어요. 잠시 후 다시 시도해 주세요.' }, 503);
  }
}
