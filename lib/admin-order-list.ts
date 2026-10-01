import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderListScope = { q: string; status: string; course: string; from: string; to: string; quick: string };
export const emptyOrderListScope: OrderListScope = { q: '', status: '', course: '', from: '', to: '', quick: 'all' };
export const ORDER_PAGE_SIZE = 100;
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
  const columns = 'id,order_number,user_id,status,subtotal,discount_amount,total_amount,entry_src,customer_name,customer_email,customer_phone,created_at';
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
