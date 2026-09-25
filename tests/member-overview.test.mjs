import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/api/admin/member-overview/route.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function harness({ authenticated = true, allowed = true, profile = true, failure = '' } = {}) {
  const calls = [];
  const rows = Array.from({ length: 45 }, (_, n) => ({ id: id(n + 100), user_id: n < 25 ? id(1) : id(2), enrollments: { user_id: n < 25 ? id(1) : id(2) } }));
  const db = { from(table) {
    const call = { table, filters: [], orders: [] }; calls.push(call);
    const query = {
      select(columns, options) { Object.assign(call, { columns, options }); return this; },
      eq(key, value) { call.filters.push([key, value]); return this; },
      neq(key, value) { call.excluded = [key, value]; return this; },
      order(key, options) { call.orders.push([key, options]); return this; },
      range(start, end) { call.range = [start, end]; return this; },
      maybeSingle() { return Promise.resolve({ data: profile ? { id: id(1) } : null, error: failure === 'profile' ? Error('private SQL detail') : null }); },
      then(resolve) {
        const filtered = rows.filter(row => call.filters.every(([key, value]) => key === 'enrollments.user_id' ? row.enrollments.user_id === value : row[key] === value));
        return Promise.resolve({ data: filtered.slice(call.range[0], call.range[1] + 1), count: filtered.length, error: failure === 'records' ? Error('private SQL detail') : null }).then(resolve);
      },
    };
    return query;
  } };
  let databaseOpened = false;
  const dependencies = {
    '@/lib/supabase/admin': { createAdminClient: () => { databaseOpened = true; return db; } },
    '@/lib/server-auth': { getAuthenticatedUser: async () => authenticated ? { id: id(3) } : null },
    '@/lib/operator-permissions': { getOperatorUser: async (scope, user) => { assert.equal(scope, 'members'); assert.equal(user.id, id(3)); return allowed ? user : null; } },
    '@/lib/edu-workflows': { uuid: value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) },
  };
  const exports = {};
  new Function('exports', 'require', code)(exports, name => { assert.ok(name in dependencies, name); return dependencies[name]; });
  return { calls, opened: () => databaseOpened, read: (query = '', view = 'enrollments', member = id(1)) => exports.GET(new Request(`https://example.test/api/admin/member-overview?member=${member}&view=${view}${query}`)) };
}

test('member read checks login and member scope before opening admin DB', async () => {
  for (const [options, expected] of [[{ authenticated: false }, 401], [{ allowed: false }, 403]]) {
    const api = harness(options);
    assert.equal((await api.read()).status, expected);
    assert.equal(api.opened(), false);
  }
});
test('member view and pagination reject invalid values before DB reads', async () => {
  for (const query of ['&page=0', '&page=-1', '&page=1.5', '&page=Infinity', '&page=100001']) {
    const api = harness(); assert.equal((await api.read(query)).status, 400); assert.equal(api.opened(), false);
  }
  for (const [view, member] of [['unknown', id(1)], ['enrollments', 'bad']]) {
    const api = harness(); assert.equal((await api.read('', view, member)).status, 400); assert.equal(api.opened(), false);
  }
});
test('all four member views scope before pagination, provide exact totals and stable order', async () => {
  for (const [view, table, key] of [['enrollments', 'enrollments', 'user_id'], ['progress', 'lesson_progress', 'enrollments.user_id'], ['submissions', 'mission_submissions', 'enrollments.user_id'], ['questions', 'edu_questions', 'user_id']]) {
    const api = harness();
    const response = await api.read('&page=2', view);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 25); assert.equal(body.rows.length, 5); assert.equal(body.pageSize, 20);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.ok(api.calls[0].excluded.includes('withdrawn'));
    const call = api.calls[1];
    assert.equal(call.table, table);
    assert.deepEqual(call.filters, [[key, id(1)]]);
    assert.deepEqual(call.range, [20, 39]);
    assert.equal(call.options.count, 'exact');
    assert.equal(call.orders.at(-1)[0], 'id');
    if (key.includes('.')) assert.match(call.columns, /enrollments!inner/);
  }
});
test('missing/withdrawn members and storage failures are safe, readonly responses', async () => {
  const missing = harness({ profile: false }); assert.equal((await missing.read()).status, 404); assert.equal(missing.calls.length, 1);
  for (const failure of ['profile', 'records']) {
    const response = await harness({ failure }).read(); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private SQL detail/);
  }
  assert.doesNotMatch(source, /export async function (POST|PATCH|DELETE)|\.(insert|update|delete|upsert|rpc)\(/);
});
