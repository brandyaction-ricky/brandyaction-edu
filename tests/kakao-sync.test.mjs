import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name in mocks) return mocks[name];
    throw Error('Unexpected dependency ' + name);
  });
  return exports;
}
const logic = load('lib/kakao-sync.ts');
const config = { ...logic.defaultKakaoSyncConfig, enabled: true, appId: '123', channelId: '_test', termsTag: 'terms_v1', privacyTag: 'privacy_v1', setupConfirmed: true, readChannel: true };
const user = { id: 'user', identities: [{ provider: 'kakao', id: '456' }], user_metadata: {} };
const terms = { id: 456, service_terms: ['terms_v1', 'privacy_v1'].map(tag => ({ tag, agreed: true, agreed_at: '2026-01-01T00:00:00Z' })) };
const channels = relation => ({ user_id: 456, channels: [{ channel_public_id: '_test', relation }] });

test('Sync defaults off, and only explicitly approved relation scope is requested', () => {
  assert.deepEqual(logic.kakaoOAuthOptions(logic.defaultKakaoSyncConfig), {});
  assert.deepEqual(logic.kakaoOAuthOptions({ ...config, readChannel: false }), {});
  assert.deepEqual(logic.kakaoOAuthOptions(config), { scopes: 'plusfriends' });
  assert.throws(() => logic.validateKakaoSyncConfig({ ...logic.defaultKakaoSyncConfig, enabled: true }));
  assert.throws(() => logic.validateKakaoSyncConfig({ ...config, setupConfirmed: false }));
  assert.throws(() => logic.validateKakaoSyncConfig({ ...config, termsTag: 'privacy_v1' }));
  assert.throws(() => logic.validateKakaoSyncConfig({ ...config, channelId: 'https://open.kakao.com/o/x' }));
  assert.throws(() => logic.validateKakaoSyncConfig({ ...config, enabled: 'true' }));
  assert.equal(logic.validateKakaoSyncConfig({ ...config, serviceRoleToken: 'never-store' }).serviceRoleToken, undefined);
});
test('Kakao identity is bound to provider identity AND configured application', () => {
  assert.equal(logic.verifiedKakaoIdentity(user, { id: 456, app_id: 123 }, config), '456');
  assert.equal(logic.verifiedKakaoIdentity(user, { id: 999, app_id: 123 }, config), null);
  assert.equal(logic.verifiedKakaoIdentity(user, { id: 456, app_id: 999 }, config), null);
  assert.equal(logic.verifiedKakaoIdentity({ user_metadata: { sub: '456' } }, { id: 456, app_id: 123 }, config), null);
  assert.equal(logic.providerId(Number.MAX_SAFE_INTEGER + 1), '');
});
test('only exact required terms with real agreement timestamps certify consent', () => {
  assert.equal(logic.kakaoConsentSnapshot('456', config, terms, null).requiredAgreed, true);
  for (const response of [null, { ...terms, id: 999 }, { ...terms, service_terms: terms.service_terms.slice(0, 1) }, { ...terms, service_terms: [...terms.service_terms, terms.service_terms[0]] }, { ...terms, service_terms: terms.service_terms.map(t => ({ ...t, agreed: 'true' })) }, { ...terms, service_terms: terms.service_terms.map(t => ({ ...t, agreed_at: 'bad' })) }])
    assert.equal(logic.kakaoConsentSnapshot('456', config, response, null).requiredAgreed, false);
});
test('channel refusal or missing relationship is never treated as ADDED or required consent', () => {
  for (const relation of ['ADDED', 'BLOCKED', 'NONE']) {
    const result = logic.kakaoConsentSnapshot('456', config, terms, channels(relation));
    assert.equal(result.channelRelation, relation);
    assert.equal(result.requiredAgreed, true);
    assert.equal(result.marketingConsent, undefined);
  }
  for (const response of [null, channels('invalid'), { ...channels('ADDED'), user_id: 999 }, { user_id: 456, channels: [] }])
    assert.equal(logic.kakaoConsentSnapshot('456', config, terms, response).channelRelation, 'UNKNOWN');
  assert.equal(logic.kakaoConsentSnapshot('456', { ...config, readChannel: false }, terms, channels('ADDED')).channelRelation, 'UNKNOWN');
});

function mockServer({ value = config, rpcError = null, tokenInfo = { id: 456, app_id: 123 }, termsResponse = terms, channelsResponse = channels('ADDED') } = {}) {
  const calls = [];
  const server = load('lib/kakao-sync-server.ts', {
    '@/lib/kakao-sync': logic,
    '@/lib/legal-policies': { POLICY_VERSION: '2026-08-11' },
    '@/lib/supabase/admin': { createAdminClient: () => ({
      from: table => { assert.equal(table, 'kakao_sync_config'); return { select: () => ({ eq: () => ({ single: async () => ({ data: { value, revision: 0 }, error: null }) }) }) }; },
      rpc: async (...args) => { calls.push(args); return { error: rpcError }; },
    }) },
  });
  const fetchMock = async url => ({ ok: true, json: async () => url.includes('access_token_info') ? tokenInfo : url.includes('service_terms') ? termsResponse : channelsResponse });
  return { server, calls, fetchMock };
}
test('server uses verified terms, omits tokens and preserves email/SMS marketing', async () => {
  const s = mockServer(), original = globalThis.fetch;
  globalThis.fetch = s.fetchMock;
  try {
    assert.equal(await s.server.syncKakaoConsent(user, 'private-token'), true);
    assert.equal(s.calls[0][0], 'edu_record_kakao_consent');
    const payload = JSON.stringify(s.calls[0][1]);
    assert.doesNotMatch(payload, /private-token|marketing|role|email|phone/);
    assert.equal(s.calls[0][1].p_relation, 'ADDED');
  } finally { globalThis.fetch = original; }
});
test('app mismatch does not write, failed audit persistence does not bypass onsite consent', async () => {
  const original = globalThis.fetch;
  try {
    const wrong = mockServer({ tokenInfo: { id: 456, app_id: 999 } }); globalThis.fetch = wrong.fetchMock;
    assert.equal(await wrong.server.syncKakaoConsent(user, 'token'), false); assert.equal(wrong.calls.length, 0);
    const failed = mockServer({ rpcError: { message: 'offline' } }); globalThis.fetch = failed.fetchMock;
    assert.equal(await failed.server.syncKakaoConsent(user, 'token'), false);
    const optional = mockServer({ channelsResponse: null }); globalThis.fetch = optional.fetchMock;
    assert.equal(await optional.server.syncKakaoConsent(user, 'token'), true);
    assert.equal(optional.calls[0][1].p_relation, 'UNKNOWN');
    const disabled = mockServer({ value: { ...config, enabled: false } });
    globalThis.fetch = () => { throw Error('disabled Sync must not contact Kakao'); };
    assert.equal(await disabled.server.syncKakaoConsent(user, 'token'), false); assert.equal(disabled.calls.length, 0);
  } finally { globalThis.fetch = original; }
});
test('admin configuration requires admin role, same origin and optimistic revision', async () => {
  let allowed = false, stale = false, saved;
  const route = load('app/api/kakao-sync/admin/route.ts', {
    '@/lib/server-auth': { getAdminUser: async () => allowed ? { role: 'admin' } : null },
    '@/lib/kakao-sync-server': { getKakaoSyncConfig: async () => config },
    '@/lib/kakao-sync': logic,
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ update: value => {
      saved = value;
      const query = { eq: () => query, select: () => query, maybeSingle: async () => ({ data: stale ? null : { revision: 1 }, error: null }) };
      return query;
    } }) }) },
  });
  const req = (origin = 'https://dev.example') => new Request('https://dev.example/api/kakao-sync/admin', { method: 'PUT', headers: { origin }, body: JSON.stringify(config) });
  assert.equal((await route.GET()).status, 403);
  assert.equal((await route.PUT(req())).status, 403);
  allowed = true;
  assert.equal((await route.PUT(req('https://evil.example'))).status, 403);
  assert.equal((await route.PUT(req())).status, 200); assert.equal(saved.revision, 1);
  stale = true;
  assert.equal((await route.PUT(req())).status, 409);
});
test('public OAuth config fails safe and does not expose admin config', async () => {
  const route = load('app/api/auth/kakao-sync/route.ts', {
    '@/lib/kakao-sync': logic,
    '@/lib/kakao-sync-server': { getKakaoSyncConfig: async () => { throw Error('not configured'); } },
  });
  const response = await route.GET();
  assert.deepEqual(await response.json(), { options: {} });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('callback keeps Google/normal consent fallback and allows verified Kakao consent only', async () => {
  let accepted = false, count = 0, metadata = {};
  const route = load('app/auth/callback/route.ts', {
    '@/lib/platform': { safeNext: value => value.startsWith('/') && !value.startsWith('//') ? value : '/my' },
    'next/server': { NextResponse: { redirect: url => Response.redirect(url) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: {
      exchangeCodeForSession: async () => ({ data: { session: { provider_token: 'token' } }, error: null }),
      getUser: async () => ({ data: { user: { ...user, user_metadata: metadata } } }),
    } }) },
    '@/lib/kakao-sync-server': { syncKakaoConsent: async () => { count++; return accepted; } },
  });
  const req = provider => new Request('https://dev.example/auth/callback?code=test&next=/my&provider=' + provider);
  assert.match((await route.GET(req('kakao'))).headers.get('location'), /\/auth\/consent/);
  accepted = true;
  assert.equal((await route.GET(req('kakao'))).headers.get('location'), 'https://dev.example/my');
  const before = count;
  assert.match((await route.GET(req('google'))).headers.get('location'), /\/auth\/consent/); assert.equal(count, before);
  metadata = { terms_version: 'existing', privacy_version: 'existing' };
  assert.equal((await route.GET(req('google'))).headers.get('location'), 'https://dev.example/my');
});
test('anonymous free-class CTA is not wrapped by login, signup or Sync', () => {
  const source = fs.readFileSync('app/ui/landing/free-class.tsx', 'utf8');
  assert.match(source, /productConversion\(meta, config\)/);
  assert.match(source, /<ProductCtaLink conversion=\{conversion\}/);
  assert.doesNotMatch(source, /signInWithOAuth|\/login|\/signup|kakao-sync|requestSubmit/);
});
