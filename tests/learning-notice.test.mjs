import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file, mocks = {}) { const out = {}; new Function('exports', 'require', ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(out, name => mocks[name]); return out; }
const rules = load('lib/learning-notice.ts');
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true';
function harness({ user = { id: id(1), role: 'admin' }, initial = null, dbError = null, race = null } = {}) {
  let stored = initial, raceApplied = false; const calls = [], writes = [];
  const db = { from(table) {
    assert.equal(table, 'site_settings'); const filters = [], q = {}; let action = 'read', values;
    q.select = () => q;
    q.eq = (key, value) => { filters.push([key, value]); return q; };
    for (const method of ['insert', 'update']) q[method] = value => { action = method; values = value; return q; };
    q.abortSignal = signal => { assert.ok(signal instanceof AbortSignal); return q; };
    q.maybeSingle = async () => {
      calls.push({ action, filters });
      if (dbError) return { error: { message: dbError }, data: null };
      if (action === 'read') { assert.deepEqual(filters, [['key', 'edu_learning_notice'], ['is_public', false]]); return { data: stored ? { value: structuredClone(stored) } : null }; }
      if (race && !raceApplied) { stored = race; raceApplied = true; }
      if (action === 'insert' && stored) return { error: { code: '23505' } };
      if (action === 'update') {
        assert.equal(filters[0][1], 'edu_learning_notice'); assert.deepEqual(filters[1], ['is_public', false]);
        assert.equal(filters[2][0], 'value->>revision'); if (!stored || stored.revision !== filters[2][1]) return { data: null };
      }
      assert.equal(values.is_public, false); assert.equal(values.updated_by, id(1)); assert.ok(values.updated_at);
      if (action === 'insert') assert.equal(values.key, 'edu_learning_notice');
      stored = values.value; writes.push(structuredClone(values)); return { data: { key: 'edu_learning_notice' } };
    }; return q;
  } };
  const route = load('app/api/platform/learning-notice/route.ts', {
    '@/lib/learning-notice': rules, '@/lib/edu-workflows': { uuid: value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) },
    '@/lib/server-auth': { getAuthenticatedUser: async () => user }, '@/lib/supabase/admin': { createAdminClient: () => db },
  });
  return { calls, writes, get: manage => route.GET(new Request('https://edu.test/api/platform/learning-notice' + (manage ? '?manage=true' : ''))), put: (body, origin = 'https://edu.test', raw = false) => route.PUT(new Request('https://edu.test/api/platform/learning-notice', { method: 'PUT', headers: origin ? { origin } : {}, body: raw ? body : JSON.stringify(body) })), stored: () => stored };
}
const packet = (n = 2, expectedRevision = null, message = ' 전체 학습 공지 ') => ({ requestId: id(n), expectedRevision, message });
test('notice validation preserves internal text, trims edges, and rejects malformed/oversized settings', () => {
  assert.equal(rules.noticeMessage(' 공지\n둘째 줄 '), '공지\n둘째 줄'); assert.equal(rules.noticeMessage('  '), '');
  for (const value of [null, {}, 0, '가'.repeat(201)]) assert.throws(() => rules.noticeMessage(value));
  assert.deepEqual(rules.readLearningNotice(null), { message: '', revision: null });
  for (const value of [{}, [], { message: 'ok', revision: 'bad' }]) assert.throws(() => rules.readLearningNotice(value));
});
test('public projection returns only the notice while management requires active session admin', async () => {
  for (const [user, status] of [[null, 401], [{ role: 'member' }, 403], [{ role: 'staff' }, 403]]) {
    const h = harness({ user }); assert.equal((await h.get(true)).status, status); assert.equal((await h.put(packet())).status, status); assert.equal(h.calls.length, 0);
  }
  const h = harness({ user: null, initial: { message: '공개 안내', revision: id(8), privateSetting: 'never expose' } });
  const response = await h.get(); assert.deepEqual(await response.json(), { message: '공개 안내' }); assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('disabled feature, foreign origin and invalid bodies cannot write any settings', async () => {
  const h = harness(); process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'false';
  try { assert.equal((await h.get()).status, 404); assert.equal((await h.put(packet())).status, 404); } finally { process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true'; }
  for (const origin of [null, 'https://evil.test']) assert.equal((await h.put(packet(), origin)).status, 403);
  for (const input of [null, [], { ...packet(), key: 'other' }, { ...packet(), expectedRevision: undefined }, { ...packet(), message: 'x'.repeat(201) }, { ...packet(), requestId: 'bad' }]) assert.equal((await h.put(input)).status, 400);
  assert.equal((await h.put('{', 'https://edu.test', true)).status, 400); assert.equal((await h.put('x'.repeat(2049), 'https://edu.test', true)).status, 413); assert.equal(h.calls.length, 0);
});
test('create, response-loss retry, edit and clear use the same private row with authenticated attribution', async () => {
  const h = harness(); assert.equal((await h.put(packet())).status, 200); assert.equal(h.stored().message, '전체 학습 공지');
  assert.equal((await h.put(packet())).status, 200); assert.equal(h.writes.length, 1);
  assert.equal((await h.put(packet(2, null, 'changed request'))).status, 409);
  assert.equal((await h.put(packet(3, id(2), '   '))).status, 200); assert.deepEqual(await (await h.get()).json(), { message: '' });
  assert.equal((await h.put(packet(4, id(2)))).status, 409); assert.equal(h.writes.length, 2);
});
test('atomic compare on update and unique insert reject concurrent writers and preserve the winning notice', async () => {
  const race = { revision: id(9), message: '다른 관리자의 공지' };
  for (const initial of [null, { revision: id(5), message: '기존 공지' }]) {
    const h = harness({ initial, race }); assert.equal((await h.put(packet(6, initial?.revision ?? null))).status, 409); assert.deepEqual(h.stored(), race); assert.equal(h.writes.length, 0);
  }
  const retry = harness({ race: { revision: id(2), message: '전체 학습 공지' } }); assert.equal((await retry.put(packet())).status, 200); assert.equal(retry.writes.length, 0);
});
test('database outage and corrupt storage fail visibly without leaking details or replacing the current notice', async () => {
  for (const options of [{ dbError: 'secret connection SQL' }, { initial: { message: 'bad', revision: 'invalid' } }]) {
    const h = harness(options); for (const response of [await h.get(), await h.put(packet())]) { assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret|connection|SQL|invalid/); } assert.equal(h.writes.length, 0);
  }
});
