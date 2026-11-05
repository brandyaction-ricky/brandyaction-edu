import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../lib/admin-order-list.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { adminOrderQuery, parseOrderListScope, emptyOrderListScope, ORDER_PAGE_SIZE, readOrderPeriodSummary, orderDateRange } = exports;
const db = createClient('https://synthetic.example.test', 'synthetic-key', { auth: { persistSession: false }, global: { fetch: () => { throw Error('Network forbidden in query tests'); } } });

test('date shortcuts use the Korean day and include today without overflowing month ends', () => {
  const now = new Date('2026-11-04T15:30:00Z');
  assert.deepEqual(orderDateRange('today', now), { from: '2026-11-05', to: '2026-11-05' });
  assert.deepEqual(orderDateRange('yesterday', now), { from: '2026-11-04', to: '2026-11-04' });
  assert.deepEqual(orderDateRange('week', now), { from: '2026-10-30', to: '2026-11-05' });
  assert.deepEqual(orderDateRange('month', now), { from: '2026-11-01', to: '2026-11-05' });
  assert.deepEqual(orderDateRange('threeMonths', now), { from: '2026-08-05', to: '2026-11-05' });
  assert.deepEqual(orderDateRange('threeMonths', new Date('2026-05-31T00:00:00Z')), { from: '2026-02-28', to: '2026-05-31' });
  assert.deepEqual(orderDateRange('threeMonths', new Date('2024-05-31T00:00:00Z')), { from: '2024-02-29', to: '2024-05-31' });
  assert.deepEqual(orderDateRange('all', now), { from: '', to: '' });
});

test('all order pages share filters and exact counts; one page is bounded to 100', () => {
  const scope = parseOrderListScope(new URLSearchParams('status=paid&from=2026-09-28&to=2026-09-30'));
  const query = adminOrderQuery(db, scope).order('created_at', { ascending: false }).order('id').range(100, 199);
  assert.equal(ORDER_PAGE_SIZE, 100);
  assert.equal(query.url.searchParams.get('status'), 'eq.paid');
  assert.equal(query.url.searchParams.get('created_at'), 'gte.2026-09-28T00:00:00+09:00');
  assert.deepEqual(query.url.searchParams.getAll('created_at'), ['gte.2026-09-28T00:00:00+09:00', 'lt.2026-09-30T15:00:00.000Z']);
  assert.equal(query.url.searchParams.get('offset'), '100');
  assert.equal(query.url.searchParams.get('limit'), '100');
  const count = adminOrderQuery(db, scope, 'all', true);
  assert.equal(count.method, 'HEAD');
  assert.equal(count.url.searchParams.has('limit'), false);
  assert.equal(count.url.searchParams.get('status'), 'eq.paid');
});

test('search matches order, member, email or item names without a truncated ID prefetch', () => {
  const scope = { ...emptyOrderListScope, course: '11111111-1111-4111-8111-111111111111', q: '문샷, "4기" (실습)' };
  const query = adminOrderQuery(db, scope);
  const params = query.url.searchParams;
  assert.match(params.get('select'), /search_items:order_items\(\)/);
  assert.equal(params.get('course_items'), 'not.is.null');
  assert.equal(params.get('course_items.course_id'), 'eq.' + scope.course);
  assert.equal(params.get('search_items.item_name'), 'ilike.%' + scope.q + '%');
  assert.equal(params.get('or'), '(order_number.ilike."%문샷, \\"4기\\" (실습)%",customer_name.ilike."%문샷, \\"4기\\" (실습)%",customer_email.ilike."%문샷, \\"4기\\" (실습)%",search_items.not.is.null)');
});

test('exception filters use existence/anti joins and preserve parent filters', () => {
  const refund = adminOrderQuery(db, { ...emptyOrderListScope, from: '2026-09-01' }, 'refund', true).url.searchParams;
  assert.equal(refund.get('refund_payments'), 'not.is.null');
  assert.equal(refund.get('refund_payments.edu_refund_requests.status'), 'eq.processing');
  assert.match(refund.get('select'), /edu_refund_requests!inner\(\)/);
  const access = adminOrderQuery(db, emptyOrderListScope, 'access', true).url.searchParams;
  assert.equal(access.get('status'), 'eq.paid');
  assert.equal(access.get('active_items'), 'is.null');
  assert.match(access.get('select'), /enrollments!inner\(\)/);
  assert.equal(access.get('active_items.enrollments.status'), 'eq.active');
});

test('malformed filters fail closed before a database request', () => {
  for (const query of ['status=other', 'quick=other', 'course=unsafe', 'from=2026-02-30', 'to=oops', 'from=2026-10-02&to=2026-10-01']) {
    assert.throws(() => parseOrderListScope(new URLSearchParams(query)), error => error.status === 400);
  }
});


test('period summary reads all payment pages with KST order boundaries and retains eligibility filters', async () => {
  const requests = [];
  const payments = Array.from({ length: 1003 }, (_, index) => ({
    id: String(index).padStart(6, '0'), approved_amount: 1000, cancelled_amount: index === 1002 ? 500 : 0,
  }));
  const client = createClient('https://synthetic.example.test', 'synthetic-key', {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input);
      requests.push({ url, method: init.method });
      if (url.pathname.endsWith('/edu_refund_requests')) {
        return new Response(null, { status: 200, headers: { 'content-range': '0-1/2' } });
      }
      const after = url.searchParams.get('id')?.slice(3) || '';
      const page = payments.filter(payment => payment.id > after).slice(0, 500);
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  const summary = await readOrderPeriodSummary(client, { from: '2026-11-01', to: '2026-11-05' });
  assert.deepEqual(summary, { approvedRevenue: 1003000, refundedRevenue: 500, netRevenue: 1002500, processingRefunds: 2 });
  const batches = requests.filter(request => request.method !== 'HEAD');
  assert.equal(batches.length, 3);
  for (const { url } of batches) {
    assert.match(url.searchParams.get('select'), /edu_analytics_orders!inner/);
    assert.deepEqual(url.searchParams.getAll('period_order.created_at'), ['gte.2026-11-01T00:00:00+09:00', 'lt.2026-11-05T15:00:00.000Z']);
    assert.equal(url.searchParams.get('status'), 'in.(done,partial_cancelled,cancelled)');
    assert.equal(url.searchParams.get('period_order.status'), 'in.(paid,partially_refunded,refunded)');
    assert.equal(url.searchParams.get('limit'), '500');
  }
  const refunds = requests.find(request => request.method === 'HEAD').url.searchParams;
  assert.equal(refunds.get('status'), 'eq.processing');
  assert.deepEqual(refunds.getAll('period_payment.period_order.created_at'), ['gte.2026-11-01T00:00:00+09:00', 'lt.2026-11-05T15:00:00.000Z']);
});

test('empty and one-sided periods return zero and query failures do not produce zero totals', async () => {
  for (const scope of [{ from: '2026-11-05', to: '' }, { from: '', to: '2026-11-05' }]) {
    const requests = [];
    const client = createClient('https://synthetic.example.test', 'synthetic-key', {
      auth: { persistSession: false },
      global: { fetch: async input => {
        requests.push(new URL(input));
        return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json', 'content-range': '*/0' } });
      } },
    });
    assert.deepEqual(await readOrderPeriodSummary(client, scope), { approvedRevenue: 0, refundedRevenue: 0, netRevenue: 0, processingRefunds: 0 });
    assert.equal(requests[0].searchParams.getAll('period_order.created_at').length, 1);
  }
  const failed = createClient('https://synthetic.example.test', 'synthetic-key', {
    auth: { persistSession: false },
    global: { fetch: async () => new Response(JSON.stringify({ message: 'unavailable', code: 'PGRST000' }), { status: 503, headers: { 'content-type': 'application/json' } }) },
  });
  await assert.rejects(readOrderPeriodSummary(failed, { from: '2026-11-05', to: '' }));
});
