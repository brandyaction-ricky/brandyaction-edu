import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { conversionDatabaseError, conversionError, conversionPayload } from '@/lib/conversion-review-server';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
function failure(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503;
  return reply({ error: error instanceof Error && status !== 503 ? error.message : '결제 기록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, status);
}
function requireOrderManager(user: Awaited<ReturnType<typeof getOperatorUser>>) {
  if (!user || !user.permissions.orders || !user.permissions.marketing) conversionError('문의와 주문을 확인하려면 주문 및 마케팅 관리 권한이 필요합니다.', 403);
  return user;
}

export async function GET(request: Request) {
  try {
    requireOrderManager(await getOperatorUser('members'));
    const caseId = new URL(request.url).searchParams.get('case_id');
    const parsed = conversionPayload({ action: 'manage_case_order', requestId: '00000000-0000-4000-8000-000000000001', operation: 'unlink', case_id: caseId, expected_version: 1 });
    const db = createAdminClient();
    const found = await db.from('edu_conversion_cases').select('id,course_id,cohort_id,received_at,source_type,sample_origin,archived_at').eq('id', parsed.payload.case_id).maybeSingle();
    if (found.error) conversionDatabaseError(found.error);
    const inquiry = found.data;
    if (!inquiry) conversionError('문의를 찾을 수 없습니다.', 404);
    if (inquiry.source_type !== 'manual' || inquiry.sample_origin !== 'current' || !inquiry.course_id) return reply({ orders: [], available: false, message: '현재 상품으로 저장한 카카오 문의에서만 결제 기록을 연결할 수 있습니다.' });

    const links = await db.from('edu_conversion_case_orders').select('order_id,linked_at').eq('case_id', inquiry.id);
    if (links.error) {
      if (['42P01', 'PGRST205'].includes(links.error.code || '')) return reply({ orders: [], available: false, message: '이 기능은 개발자 테스트 사이트에 업데이트 중입니다. 잠시 후 다시 열어 주세요.' });
      conversionDatabaseError(links.error);
    }
    const linkRows = links.data || [];
    const linkedIds = linkRows.map(row => row.order_id);
    const dateEnd = Math.min(Date.now(), Date.parse(inquiry.received_at) + 90 * 24 * 60 * 60 * 1000);
    const relation = 'id,status,currency,total_amount,paid_at,order_items!inner(course_id,cohort_id,item_name),payments(status,approved_amount,cancelled_amount,refunds(amount,status))';
    let candidates = db.from('orders').select(relation)
      .eq('order_items.course_id', inquiry.course_id).in('status', ['paid', 'partially_refunded', 'refunded'])
      .not('paid_at', 'is', null).gte('paid_at', inquiry.received_at).lte('paid_at', new Date(dateEnd).toISOString())
      .order('paid_at', { ascending: false }).limit(100);
    candidates = inquiry.cohort_id ? candidates.eq('order_items.cohort_id', inquiry.cohort_id) : candidates.is('order_items.cohort_id', null);
    const [candidateRows, linkedRows] = await Promise.all([
      candidates,
      linkedIds.length ? db.from('orders').select(relation).in('id', linkedIds).limit(100) : Promise.resolve({ data: [], error: null }),
    ]);
    if (candidateRows.error) conversionDatabaseError(candidateRows.error);
    if (linkedRows.error) conversionDatabaseError(linkedRows.error);
    const byId = new Map<string, { id: string; status: string; currency: string; total_amount: number; paid_at: string; item_name: string; linked_at: string | null; refund_amount: number; payment_statuses: string[] }>();
    for (const row of [...(candidateRows.data || []), ...(linkedRows.data || [])] as unknown as Array<Record<string, unknown>>) {
      const items = row.order_items as Array<Record<string, unknown>>;
      const item = items?.find(value => value.course_id === inquiry.course_id && value.cohort_id === inquiry.cohort_id);
      if (!item || typeof row.paid_at !== 'string') continue;
      const payments = (row.payments as Array<Record<string, unknown>> | null) || [];
      const refundAmount = payments.flatMap(payment => (payment.refunds as Array<Record<string, unknown>> | null) || [])
        .filter(refund => refund.status === 'done').reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
      const link = linkRows.find(value => value.order_id === row.id);
      byId.set(String(row.id), {
        id: String(row.id), status: String(row.status), currency: String(row.currency), total_amount: Number(row.total_amount),
        paid_at: row.paid_at, item_name: String(item.item_name || ''), linked_at: link?.linked_at || null, refund_amount: refundAmount,
        payment_statuses: [...new Set(payments.map(payment => String(payment.status || '')).filter(Boolean))],
      });
    }
    return reply({ orders: [...byId.values()].sort((a, b) => Date.parse(b.paid_at) - Date.parse(a.paid_at)), available: true,
      window: { from: inquiry.received_at, to: new Date(dateEnd).toISOString() }, can_manage: !inquiry.archived_at });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '요청 출처를 확인해 주세요.' }, 403);
    const user = requireOrderManager(await getOperatorUser('members'));
    const raw = await request.text();
    if (raw.length > 40000) return reply({ error: '입력 내용이 너무 큽니다.' }, 413);
    let decoded: unknown;
    try { decoded = JSON.parse(raw); } catch { return reply({ error: '요청 형식을 확인해 주세요.' }, 400); }
    const { action, requestId, payload, payload_hash } = conversionPayload(decoded);
    if (action !== 'manage_case_order') conversionError('지원하지 않는 작업입니다.');
    const db = createAdminClient();
    const saved = await db.rpc('edu_conversion_case_order_manage', { p_actor: user.id, p_request: requestId, p_payload: payload, p_payload_hash: payload_hash });
    if (saved.error) conversionDatabaseError(saved.error);
    return reply({ ok: true, ...saved.data });
  } catch (error) { return failure(error); }
}
