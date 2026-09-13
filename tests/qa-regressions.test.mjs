import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => { if (!(name in dependencies)) throw Error(name); return dependencies[name]; });
  return exports;
}
const rules = load('lib/qa-rules.ts');
const platform = load('lib/platform.ts');
const { createMutationGate } = load('lib/mutation-gate.ts');

test('F-01 same-tick double submit executes once and shares the result', async () => {
  const gate = createMutationGate(); let calls = 0; let finish;
  const send = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const first = gate({ action: 'save' }, send);
  const second = gate({ action: 'save' }, send);
  assert.equal(calls, 1); assert.equal(first, second);
  finish({ ok: true }); assert.deepEqual(await second, { ok: true });
});
test('F-01 failed intent reuses request ID; completed intent gets a new ID', async () => {
  const gate = createMutationGate(); const ids = [];
  await assert.rejects(gate({ action: 'question' }, async body => { ids.push(body.requestId); throw Error('network'); }));
  await gate({ action: 'question' }, async body => { ids.push(body.requestId); return 'ok'; });
  await gate({ action: 'question' }, async body => { ids.push(body.requestId); return 'ok'; });
  assert.equal(ids[0], ids[1]); assert.notEqual(ids[1], ids[2]);
});
test('F-01 a different simultaneous mutation is not reported as saved', async () => {
  const gate = createMutationGate(); let finish;
  const first = gate({ action: 'question' }, () => new Promise(resolve => { finish = resolve; }));
  await assert.rejects(gate({ action: 'profile' }, async () => 'wrong action'), /진행 중인 저장/);
  finish('ok'); await first;
});
test('F-02 reconciliation preserves an existing refund request ID', async () => {
  const id = crypto.randomUUID();
  const result = await createMutationGate()({ action: 'refund', requestId: id }, async body => body);
  assert.equal(result.requestId, id);
});
test('F-03 no admin screen downloads raw journey events', () => {
  for (const tables of Object.values(rules.adminTables)) assert.equal(tables.includes('customer_journey_events'), false);
  assert.deepEqual(rules.adminTables.analytics, []);
  assert.deepEqual(rules.adminTables.banners, ['site_banners']);
});
test('F-04 status reflects expired recruitment, ended operation, scheduled start and override', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  assert.equal(rules.cohortStatus({ status: 'recruiting', recruitment_end_at: '2026-09-03' }, now), 'closed');
  assert.equal(rules.cohortStatus({ status: 'in_progress', operation_end_at: '2026-08-23' }, now), 'completed');
  assert.equal(rules.cohortStatus({ status: 'recruiting', recruitment_start_at: '2026-10-01' }, now), 'upcoming');
  assert.equal(rules.cohortStatus({ status: 'cancelled', operation_start_at: '2026-09-01' }, now), 'cancelled');
});
test('F-06 database errors distinguish duplicate, constraint and reference failures', () => {
  assert.match(rules.databaseMessage('23505'), /이미 사용/);
  assert.match(rules.databaseMessage('23514'), /허용 범위/);
  assert.match(rules.databaseMessage('23503'), /연결된/);
});
test('F-07 cohort dates supply an explicit learning period fallback', () => {
  assert.match(rules.cohortPeriod({ operation_start_at: '2026-10-01', operation_end_at: '2026-10-31' }), /2026/);
  assert.equal(rules.cohortPeriod(), '일정 추후 안내');
});
test('F-08 absent URLs never become /undefined or /null requests', () => {
  for (const value of [undefined, null, '', 'undefined', 'null', 'QA text', '//evil.example']) assert.equal(platform.safeUrl(value), '');
  assert.equal(platform.safeUrl('/classes'), '/classes');
});
test('F-09 phone validation rejects alphabetic input instead of erasing it', () => {
  for (const value of ['abc', '010abc12345678', '123', '+1 1234567890']) assert.throws(() => rules.phoneNumber(value));
  assert.equal(rules.phoneNumber('010-1234-5678'), '01012345678');
  assert.equal(rules.phoneNumber('02-123-4567'), '021234567');
  assert.equal(rules.phoneNumber(''), null);
  assert.throws(() => rules.phoneNumber('', true));
});
test('F-10 all reported status and discount codes are translated', () => {
  for (const value of ['suspended', 'open', 'answered', 'fixed', 'percentage', 'hidden']) assert.notEqual(platform.labels[value], value);
});
test('F-12 only our bucket URLs normalize to portable storage keys', () => {
  assert.equal(rules.assetPath('https://db.example/storage/v1/object/public/course-assets/edu/test.png', 'https://db.example'), 'edu/test.png');
  assert.equal(rules.assetPath('https://other.example/test.png', 'https://db.example'), 'https://other.example/test.png');
});
test('F-15 image validation rejects text, traversal and script URLs', () => {
  for (const value of ['QA-테스트 후기', 'javascript:alert(1)', 'site/../../secret.png', 'https://user:pass@host/x']) assert.equal(rules.validImage(value), false);
  for (const value of ['edu/test.png', 'site/banners/test.webp', 'https://cdn.example/image']) assert.equal(rules.validImage(value), true);
});

function handler(user, database) {
  return load('app/api/platform/route.ts', {
    '@/lib/server-auth': { getAuthenticatedUser: async () => user },
    '@/lib/supabase/admin': { createAdminClient: () => database },
    '@/lib/supabase/server': { createClient: async () => database },
    '@/lib/platform': platform, '@/lib/platform-rules': load('lib/platform-rules.ts'), '@/lib/qa-rules': rules,
    '@/lib/product-metadata': load('lib/product-metadata.ts', { './platform': platform, './product-conversion': load('lib/product-conversion.ts'), './product-html-document': load('lib/product-html-document.ts') }),
    '@/lib/edu-settings': { getEduSettings: async () => ({ operations: {} }) },
    '@/lib/mission-quiz': {}, '@/lib/legal-policies': { POLICY_VERSION: 'test' },
    '@/lib/operator-permissions': { getOperatorUser: async () => user?.role === 'admin' ? user : null, permissionsFor: async value => ({ products: value?.role === 'admin', members: value?.role === 'admin', orders: value?.role === 'admin', content: value?.role === 'admin', marketing: value?.role === 'admin' }), sectionScopes: { cohorts: 'products', testimonials: 'content', products: 'products' } },
    '@/lib/crm-delivery': { crmDeliveryState: () => ({ enabled: false, configured: false }) },
  });
}
const request = body => new Request('https://example.com/api/platform', { method: 'POST', headers: { origin: 'https://example.com', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const admin = { id: crypto.randomUUID(), role: 'admin' };
test('F-06/F-09/F-15 invalid capacity, phone and image are rejected before DB writes', async () => {
  const h = handler(admin, { from: () => { throw Error('must not write'); } });
  for (const body of [
    { action: 'save', section: 'cohorts', id: crypto.randomUUID(), values: { capacity: 0 } },
    { action: 'save', section: 'testimonials', values: { title: 'QA', reviewer_name: 'QA', video_url: 'https://example.com/v', thumbnail_url: 'QA title' } },
    { action: 'profile', name: 'QA', phone: 'abc' },
  ]) assert.equal((await h.POST(request(body))).status, 400);
});
test('F-02 archive cannot be invoked by a member', async () => {
  const h = handler({ ...admin, role: 'student' }, {});
  assert.equal((await h.POST(request({ action: 'archive', section: 'banners', ids: [crypto.randomUUID()] }))).status, 403);
});
test('article banner rejects deceptive non-YouTube URLs before writing', async () => {
  const h = handler(admin, { from: () => { throw Error('must not write'); } });
  const response = await h.POST(request({ action: 'article-banner', value: { title: '무료 영상', videos: [{ title: '위장 주소', url: 'https://evil.example/?next=youtube.com' }] } }));
  assert.equal(response.status, 400);
});
test('F-14 anonymous API selects only public review fields', async () => {
  let projection;
  const db = { from(table) { return { select(columns) { if (table === 'reviews') projection = columns; return this; }, limit() { return this; }, order() { return this; }, eq() { return this; }, then(resolve) { resolve({ data: [] }); } }; } };
  assert.equal((await handler(null, db).GET(new Request('https://example.com/api/platform'))).status, 200);
  assert.ok(projection.includes('author_name'));
  for (const key of ['user_id', 'order_id', 'cohort_id', '*']) assert.equal(projection.includes(key), false);
});
