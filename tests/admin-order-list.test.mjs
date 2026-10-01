import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../lib/admin-order-list.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { adminOrderQuery, parseOrderListScope, emptyOrderListScope, ORDER_PAGE_SIZE } = exports;
const db = createClient('https://synthetic.example.test', 'synthetic-key', { auth: { persistSession: false }, global: { fetch: () => { throw Error('Network forbidden in query tests'); } } });

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
