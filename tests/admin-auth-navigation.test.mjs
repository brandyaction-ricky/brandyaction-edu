import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, name => {
    if (!(name in dependencies)) throw Error(name);
    return dependencies[name];
  });
  return exports;
}
const platform = load('lib/platform.ts');
const scopes = load('lib/operator-scopes.ts');
const admin = { id: '12345678-1234-1234-1234-123456789012', role: 'admin', status: 'active', email: 'admin@example.test' };

function authHarness({ authError = null, profileError = null, profile = admin, authUser = { id: admin.id, email: admin.email, user_metadata: { role: 'admin' } } } = {}) {
  let calls = 0;
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: profile, error: profileError }; } };
  const auth = load('lib/server-auth.ts', {
    react: { cache: fn => fn },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => { calls++; return { data: { user: authUser }, error: authError }; } }, from: () => query }) },
  });
  return { ...auth, calls: () => calls };
}

test('missing/invalid sessions are unauthenticated, transient Auth and profile failures remain retryable', async () => {
  for (const authError of [{ name: 'AuthSessionMissingError' }, { status: 401 }]) assert.equal(await authHarness({ authError }).getAuthenticatedUser(), null);
  for (const options of [{ authError: { status: 503 } }, { authError: { status: 429 } }, { profileError: { code: 'PGRST000' } }]) {
    await assert.rejects(authHarness(options).getAuthenticatedUser(), error => error.status === 503);
  }
});

test('account status and database role remain authoritative over user-editable metadata', async () => {
  assert.equal(await authHarness({ profile: { ...admin, status: 'suspended' } }).getAuthenticatedUser(), null);
  assert.equal((await authHarness({ profile: { ...admin, role: 'member' } }).getAuthenticatedUser()).role, 'member');
});

test('operator checks reuse the already verified request user and preserve denied scopes', async () => {
  const auth = authHarness();
  const operators = load('lib/operator-permissions.ts', {
    '@/lib/server-auth': auth,
    '@/lib/operator-scopes': scopes,
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('admin needs no permission query'); } },
  });
  const user = await auth.getAuthenticatedUser();
  assert.equal((await operators.getOperatorUser('products', user)).role, 'admin');
  assert.equal(auth.calls(), 1);
  assert.equal(await operators.getOperatorUser('products', null), null);
  assert.equal(await operators.getOperatorUser('products', { ...user, role: 'member' }), null);
  assert.equal(auth.calls(), 1);
});

function apiHarness(user, failure = null) {
  const calls = { auth: 0, summaries: 0, tables: [] };
  const db = {
    from(table) {
      calls.tables.push(table);
      const query = new Proxy({}, { get: (_, key) => key === 'then' ? resolve => Promise.resolve({ data: [], error: null, count: 3 }).then(resolve) : () => query });
      return query;
    },
    async rpc() { calls.summaries++; return { data: { id: 'summary', pendingReviews: 3 }, error: null }; },
  };
  const auth = { async getAuthenticatedUser() { calls.auth++; if (failure) throw failure; return user; } };
  const operators = load('lib/operator-permissions.ts', { '@/lib/server-auth': auth, '@/lib/operator-scopes': scopes, '@/lib/supabase/admin': { createAdminClient: () => db } });
  const route = load('app/api/platform/route.ts', {
    '@/lib/server-auth': auth,
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/platform': platform,
    '@/lib/platform-rules': load('lib/platform-rules.ts'),
    '@/lib/qa-rules': load('lib/qa-rules.ts'),
    '@/lib/product-metadata': load('lib/product-metadata.ts', { './platform': platform, './product-conversion': load('lib/product-conversion.ts'), './product-html-document': load('lib/product-html-document.ts') }),
    '@/lib/edu-settings': { getEduSettings: async () => ({ operations: {} }) },
    '@/lib/mission-quiz': {}, '@/lib/legal-policies': { POLICY_VERSION: 'test' },
    '@/lib/operator-permissions': operators,
    '@/lib/crm-delivery': { crmDeliveryState: () => ({}) },
  });
  return { calls, read: section => route.GET(new Request('https://example.test/api/platform?admin=1&section=' + section)) };
}

test('admin API distinguishes sign-in, permission and temporary connection errors before loading data', async () => {
  for (const [user, expected] of [[null, 401], [{ ...admin, role: 'member' }, 403]]) {
    const api = apiHarness(user);
    const response = await api.read('products');
    assert.equal(response.status, expected);
    assert.equal(api.calls.auth, 1);
    assert.deepEqual(api.calls.tables, []);
  }
  const api = apiHarness(null, Object.assign(Error('auth unavailable'), { status: 503 }));
  assert.equal((await api.read('products')).status, 503);
});

test('menu reads authenticate once and preserve review badges without full dashboard aggregation', async () => {
  const api = apiHarness(admin);
  const response = await api.read('banners');
  assert.equal(response.status, 200);
  assert.equal(api.calls.auth, 1);
  assert.equal(api.calls.summaries, 0);
  assert.equal((await response.json()).data.admin_summary[0].pendingReviews, 3);
  assert.deepEqual(api.calls.tables.sort(), ['mission_submissions', 'site_banners']);
});

test('the operating home still returns the full dashboard aggregate', async () => {
  const api = apiHarness(admin);
  assert.equal((await api.read('home')).status, 200);
  assert.equal(api.calls.summaries, 1);
  assert.equal(api.calls.auth, 1);
});
