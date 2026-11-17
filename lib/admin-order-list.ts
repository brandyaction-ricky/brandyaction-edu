import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderListScope = { q: string; status: string; course: string; from: string; to: string; quick: string };
export const emptyOrderListScope: OrderListScope = { q: '', status: '', course: '', from: '', to: '', quick: 'all' };
export const ORDER_PAGE_SIZE = 100;
export const orderDatePresets = [
  { value: 'today', label: '오늘' },
  { value: 'yesterday', label: '어제' },
  { value: 'week', label: '최근 7일' },
  { value: 'month', label: '이번 달' },
  { value: 'threeMonths', label: '최근 3개월' },
  { value: 'all', label: '전체 기간' },
] as const;
export function orderDateRange(preset: typeof orderDatePresets[number]['value'], now = new Date()) {
  if (preset === 'all') return { from: '', to: '' };
  // Shift to the Korean calendar first, independent of the browser's timezone.
  const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = new Date(today + 'T00:00:00Z');
  const start = new Date(end);
  if (preset === 'yesterday') start.setUTCDate(start.getUTCDate() - 1);
  if (preset === 'week') start.setUTCDate(start.getUTCDate() - 6);
  if (preset === 'month') start.setUTCDate(1);
  if (preset === 'threeMonths') {
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 3);
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(day, lastDay));
  }
  const from = start.toISOString().slice(0, 10);
  return { from, to: preset === 'yesterday' ? from : today };
}
const statuses = ['paid', 'pending', 'payment_failed', 'partially_refunded', 'refunded', 'cancelled'];
const quickStates = ['all', 'failed', 'refund', 'access'];

export function parseOrderListScope(params: URLSearchParams): OrderListScope {
  const scope = Object.fromEntries(Object.entries(emptyOrderListScope).map(([key, fallback]) => [key, params.get(key) ?? fallback])) as OrderListScope;
  scope.q = scope.q.trim().slice(0, 100);
  const dateValid = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
  if ((scope.status && !statuses.includes(scope.status)) || !quickStates.includes(scope.quick)
    || (scope.course && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(scope.course))
    || !dateValid(scope.from) || !dateValid(scope.to) || (scope.from && scope.to && scope.from > scope.to)) {
    throw Object.assign(new Error('주문 조회 조건을 확인해 주세요.'), { status: 400 });
  }
  return scope;
}

// Each relation is an existence filter, so multiple items/payments never
// duplicate orders or inflate the exact count. Apply all filters before range.
export function adminOrderQuery(db: SupabaseClient, scope: OrderListScope, quick = scope.quick, head = false) {
  const embeds: string[] = [];
  if (scope.course) embeds.push('course_items:order_items()');
  if (scope.q) embeds.push('search_items:order_items()');
  if (quick === 'refund') embeds.push('refund_payments:payments(edu_refund_requests!inner())');
  if (quick === 'access') embeds.push('active_items:order_items(enrollments!inner())');
  const columns = 'id,order_number,user_id,status,subtotal,discount_amount,total_amount,entry_src,is_test_order,customer_name,customer_email,customer_phone,created_at,analytics_member:profiles!orders_user_id_fkey(role,status,is_internal,deleted_at)';
  let query = db.from('orders').select([head ? 'id' : columns, ...embeds].join(','), { count: 'exact', head });
  if (scope.status) query = query.eq('status', scope.status);
  if (scope.from) query = query.gte('created_at', scope.from + 'T00:00:00+09:00');
  if (scope.to) query = query.lt('created_at', new Date(Date.parse(scope.to + 'T00:00:00+09:00') + 86400000).toISOString());
  if (scope.course) query = query.eq('course_items.course_id', scope.course).not('course_items', 'is', null);
  if (scope.q) {
    // Quote PostgREST values and escape LIKE wildcards: punctuation is search
    // text, never filter grammar or an unbounded wildcard.
    const pattern = '%' + scope.q.replace(/[\\%_*]/g, value => '\\' + value) + '%';
    const quoted = '"' + pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    query = query.ilike('search_items.item_name', pattern).or([
      ...['order_number', 'customer_name', 'customer_email'].map(column => `${column}.ilike.${quoted}`),
      'search_items.not.is.null',
    ].join(','));
  }
  if (quick === 'failed') query = query.eq('status', 'payment_failed');
  if (quick === 'refund') query = query.eq('refund_payments.edu_refund_requests.status', 'processing').not('refund_payments', 'is', null);
  if (quick === 'access') query = query.eq('status', 'paid').eq('active_items.enrollments.status', 'active').is('active_items', null);
  return query;
}

// Only describes the operational row. SQL views own analytics eligibility.
export function orderExclusionLabel(order: Record<string, unknown>, member?: Record<string, unknown> | null) {
  if (order.is_test_order === true) return '시험 주문 · 집계 제외';
  if (!order.user_id || !member || member.status === 'withdrawn' || member.deleted_at) return '탈퇴·미연결 회원 · 집계 제외';
  if (member.is_internal === true || ['admin', 'staff'].includes(String(member.role))) return '내부 계정 · 집계 제외';
  if (Number(order.total_amount) === 0) return '무료 주문 · 집계 제외';
  return '';
}

// Date scope follows order creation in KST, just like the order list.
// The private view retains the existing analytics exclusions in one place.
export async function readOrderPeriodSummary(db: SupabaseClient, scope: Pick<OrderListScope, 'from' | 'to'>) {
  const end = scope.to ? new Date(Date.parse(scope.to + 'T00:00:00+09:00') + 86400000).toISOString() : '';
  let approvedRevenue = 0;
  let refundedRevenue = 0;
  let cursor = '';
  const batchSize = 500;
  while (true) {
    let query = db.from('payments')
      .select('id,approved_amount,cancelled_amount,period_order:edu_analytics_orders!inner(created_at,status)')
      .in('status', ['done', 'partial_cancelled', 'cancelled'])
      .in('period_order.status', ['paid', 'partially_refunded', 'refunded'])
      .order('id').limit(batchSize);
    if (scope.from) query = query.gte('period_order.created_at', scope.from + 'T00:00:00+09:00');
    if (end) query = query.lt('period_order.created_at', end);
    if (cursor) query = query.gt('id', cursor);
    const result = await query;
    if (result.error) throw result.error;
    const payments = result.data || [];
    for (const payment of payments) {
      approvedRevenue += Number(payment.approved_amount || 0);
      refundedRevenue += Number(payment.cancelled_amount || 0);
    }
    if (payments.length < batchSize) break;
    cursor = payments[payments.length - 1].id;
  }
  let processing = db.from('edu_refund_requests')
    .select('id,period_payment:payments!inner(period_order:orders!inner(created_at))', { count: 'exact', head: true })
    .eq('status', 'processing');
  if (scope.from) processing = processing.gte('period_payment.period_order.created_at', scope.from + 'T00:00:00+09:00');
  if (end) processing = processing.lt('period_payment.period_order.created_at', end);
  const result = await processing;
  if (result.error) throw result.error;
  return { approvedRevenue, refundedRevenue, netRevenue: approvedRevenue - refundedRevenue, processingRefunds: result.count || 0 };
}
