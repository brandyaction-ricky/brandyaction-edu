import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { submissionReview as review } from './helpers/submission-review.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function harness({ user = { id: id(1), role: 'staff', status: 'active', members: true }, error, missing = false } = {}) {
  const calls = [];
  const tables = {
    mission_submissions: missing ? [] : [{ id: id(10), status: 'approved', reviewed_at: '2026-09-26', reviewer_feedback: '기존 결과', private: 'hidden' }],
    profiles: [{ id: id(1), full_name: '합성 검토자', email: 'do-not-expose@example.test' }],
    audit_logs: [...Array.from({ length: 21 }, (_, n) => ({ id: String(50 - n), actor_user_id: id(1), entity_type: 'mission_submission', entity_id: id(10), action: 'mission_submission.approved', created_at: '2026-09-26', after_data: { feedback: '확인', review_checks: n ? null : review.emptyReviewChecks(), hidden: 'sensitive' }, ip_address: '127.0.0.1' })),
      { entity_type: 'profile', entity_id: id(10), action: 'mission_submission.approved' },
      { entity_type: 'mission_submission', entity_id: id(11), action: 'mission_submission.approved' },
      { entity_type: 'mission_submission', entity_id: id(10), action: 'unrelated' }],
  };
  const db = { from(table) {
    const filters = []; let start = 0, end = Infinity, single = false;
    const query = {
      select(columns, options) { calls.push({ table, columns, options }); return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      order(key, options) { calls.push({ order: key, options }); return this; },
      range(a, b) { start = a; end = b; return this; },
      maybeSingle() { single = true; return this; },
      then(resolve) {
        const rows = tables[table].filter(row => filters.every(filter => filter(row)));
        return Promise.resolve({ data: single ? rows[0] || null : rows.slice(start, end + 1), count: rows.length, error: error === table ? { message: 'private db detail' } : null }).then(resolve);
      },
    }; return query;
  } };
  const deps = {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/server-auth': { getAuthenticatedUser: async () => user },
    '@/lib/operator-permissions': { getOperatorUser: async (scope, actor) => { assert.equal(scope, 'members'); assert.equal(actor, user); return user?.status === 'active' && (user.role === 'admin' || user.role === 'staff' && user.members) ? user : null; } },
    '@/lib/edu-workflows': { uuid: value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(value) },
    '@/lib/submission-review': review,
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL('../app/api/admin/submission-review-history/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => deps[name]);
  return { calls, get: (query = `submission=${id(10)}`) => exports.GET(new Request(`https://example.test/api/admin/submission-review-history?${query}`)) };
}
test('history authenticates active members operators before accessing audit data', async () => {
  for (const user of [null, { role: 'student', status: 'active', members: true }, { role: 'staff', status: 'active', members: false }, { role: 'admin', status: 'suspended' }]) {
    const api = harness({ user }); assert.equal((await api.get()).status, user ? 403 : 401); assert.equal(api.calls.length, 0);
  }
  assert.equal((await harness({ user: { role: 'admin', status: 'active' } }).get()).status, 200);
});
test('history is entity/action-scoped, paginated, stable ordered and projected without private audit fields', async () => {
  const api = harness(); const response = await api.get(); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(body.total, 21); assert.equal(body.rows.length, 20); assert.equal(body.rows[0].reviewer, '합성 검토자');
  assert.deepEqual(body.rows[0].checks, review.emptyReviewChecks()); assert.equal(body.rows[1].checks, null);
  assert.deepEqual(Object.keys(body.current).sort(), ['id', 'reviewed_at', 'reviewer_feedback', 'status']);
  assert.deepEqual(Object.keys(body.rows[0]).sort(), ['checks', 'decision', 'feedback', 'id', 'mode', 'reviewedAt', 'reviewer']);
  assert.doesNotMatch(JSON.stringify(body), /private|sensitive|do-not-expose|ip_address|actor_user_id|127\.0\.0\.1/);
  assert.deepEqual(api.calls.filter(call => call.order).map(call => call.order), ['created_at', 'id']);
  assert.equal((await (await api.get(`submission=${id(10)}&page=2`)).json()).rows.length, 1);
});
test('history invalid input, missing entity and retryable errors never leak backend details', async () => {
  const api = harness();
  for (const query of ['', 'submission=bad', `submission=${id(10)}&page=0`, `submission=${id(10)}&page=1.5`, `submission=${id(10)}&page=100001`]) assert.equal((await api.get(query)).status, 400);
  assert.equal(api.calls.length, 0);
  assert.equal((await harness({ missing: true }).get()).status, 404);
  for (const error of ['mission_submissions', 'audit_logs', 'profiles']) {
    const response = await harness({ error }).get(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private db/);
  }
});
test('review payload validates versioned checks, bulk policy and legacy compatibility', () => {
  const body = { ids: [id(10)], decision: 'approved', feedback: ' 확인 ' };
  assert.equal(review.reviewMutation(id(1), body).name, 'review_mission_submissions');
  const mutation = review.reviewMutation(id(1), { ...body, reviewMode: 'single', reviewChecks: review.emptyReviewChecks() });
  assert.equal(mutation.name, 'review_mission_submissions_with_checks'); assert.equal(mutation.params.p_feedback, '확인');
  assert.equal(review.reviewMutation(id(1), { ...body, reviewMode: 'bulk' }).params.p_checks, null);
  for (const change of [{ ids: [] }, { ids: [id(10), id(10)] }, { ids: Array.from({ length: 51 }, (_, n) => id(n)) }, { feedback: {} }, { feedback: 'x'.repeat(2001) }, { decision: 'rejected', feedback: '' }, { reviewMode: 'single' }, { reviewMode: 'bulk', reviewChecks: review.emptyReviewChecks() }, { reviewMode: 'single', reviewChecks: { ...review.emptyReviewChecks(), version: 2 } }]) assert.throws(() => review.reviewMutation(id(1), { ...body, ...change }));
});
test('conflict and ambiguous write failures are distinguished without retrying a mutation', () => {
  assert.equal(review.reviewWriteError({ code: 'PT409' }).code, 'REVIEW_CONFLICT');
  assert.equal(review.reviewWriteError({ code: 'P0001', message: '이미 검토된 제출이 있습니다.' }).code, 'REVIEW_CONFLICT');
  assert.equal(review.reviewWriteError({ code: '42501' }).status, 403);
  assert.equal(review.reviewWriteError({ code: 'P0002' }).status, 404);
  assert.equal(review.reviewWriteError({ code: 'PGRST202' }).status, 503);
});
