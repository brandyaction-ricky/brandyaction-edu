import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/api/purchase-onboarding/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const orderId = '11111111-1111-4111-8111-111111111111';
const inviteUrl = 'https://t.me/+ExampleCode123';

function handler({ user = { id: 'buyer' }, purchase = { telegramOnly: true, orderId, orderNumber: 'QA-4', itemName: '문샷 챌린지 4기', settings: { inviteUrl } } } = {}) {
  const calls = [];
  const progressCalls = [];
  const dependencies = {
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('direct guidance must not read or write survey data'); } },
    '@/lib/purchase-onboarding-progress-server': { readOnboardingProgress: async (...args) => { progressCalls.push(['read', ...args]); return { telegram: false }; }, confirmOnboardingStep: async (...args) => { progressCalls.push(['confirm', ...args]); return { ok: true }; } },
    '@/lib/server-auth': { getAuthenticatedUser: async () => user },
    '@/lib/qa-rules': { imagePreviewUrl: () => '' },
    '@/lib/purchase-onboarding-server': { eligiblePurchase: async (userId, requested) => { calls.push([userId, requested]); return purchase; } },
    '@/lib/purchase-onboarding': { MOONSHOT_SUPPORT_URL: 'http://pf.kakao.com/_ydxjhxj/chat' },
    '@/lib/public-platform-data': { getPublicSupport: () => { throw Error('not needed'); } },
    '@/lib/platform': { safeUrl: () => '' },
  };
  const route = {};
  new Function('exports', 'require', compiled)(route, name => dependencies[name]);
  return { route, calls, progressCalls };
}

test('fourth-cohort guide requires an authenticated paid order and does not return invite link on GET', async () => {
  const { route, calls } = handler();
  const response = await route.GET(new Request(`https://edu.test/api/purchase-onboarding?order=${orderId}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.telegramOnly, true);
  assert.equal(body.supportUrl, 'http://pf.kakao.com/_ydxjhxj/chat');
  assert.equal(body.url, undefined);
  assert.deepEqual(calls, [['buyer', orderId]]);
  assert.equal((await handler({ user: null }).route.GET(new Request('https://edu.test/api/purchase-onboarding'))).status, 401);
  assert.equal((await handler({ purchase: null }).route.GET(new Request('https://edu.test/api/purchase-onboarding'))).status, 404);
});

test('fourth-cohort link action returns the configured link without creating a web survey record', async () => {
  const { route } = handler();
  const request = action => new Request('https://edu.test/api/purchase-onboarding', { method: 'POST',
    headers: { origin: 'https://edu.test', 'content-type': 'application/json' }, body: JSON.stringify({ order: orderId, action }) });
  const response = await route.POST(request('link'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, inviteUrl);
  assert.equal((await route.POST(request('answer'))).status, 400);
  assert.equal((await handler({ purchase: null }).route.POST(request('link'))).status, 404);
});


test('only opted-in cohorts can read and confirm the four-step checklist', async () => {
  for (const enabled of [false, true]) {
    const { route, progressCalls } = handler({ purchase: { telegramOnly: true, orderId,
      orderNumber: 'QA', itemName: '문샷', settings: { inviteUrl, checklistEnabled: enabled } } });
    const body = await (await route.GET(new Request(`https://edu.test/api/purchase-onboarding?order=${orderId}`))).json();
    assert.equal(Boolean(body.progress), enabled);
    const response = await route.POST(new Request('https://edu.test/api/purchase-onboarding', {
      method: 'POST', headers: { origin: 'https://edu.test', 'content-type': 'application/json' },
      body: JSON.stringify({ order: orderId, action: 'confirm', step: 'telegram' }),
    }));
    assert.equal(response.status, enabled ? 200 : 400);
    assert.deepEqual(progressCalls.map(call => call[0]), enabled ? ['read', 'confirm'] : []);
  }
});

test('a direct guide returns only the confirmed buyer link and avoids legacy survey or progress', async () => {
  const completionGuide = { label: '문샷 공부방 입장하기', url: 'https://campus.example.test/welcome', message: 'OT 안내를 확인해 주세요.' };
  const { route, progressCalls } = handler({ purchase: { orderId, orderNumber: 'QA', itemName: '문샷', completionGuide } });
  const response = await route.GET(new Request(`https://edu.test/api/purchase-onboarding?order=${orderId}`));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { available: true, orderId, orderNumber: 'QA', itemName: '문샷', completionGuide });
  assert.deepEqual(progressCalls, []);
});

test('only a paid order owner receives the guide for the ordered cohort, with legacy fallback for untouched cohorts', async () => {
  const load = (path, dependencies = {}) => {
    const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const result = {};
    new Function('exports', 'require', code)(result, name => dependencies[name]);
    return result;
  };
  const config = load('../lib/purchase-onboarding.ts');
  const cohortId = '22222222-2222-4222-8222-222222222222';
  const otherId = '33333333-3333-4333-8333-333333333333';
  const key = config.completionGuideSettingsKey(cohortId);
  const completionGuide = { label: '5기 공부방', url: 'https://campus.example.test/5' };
  const guideRow = { key, value: completionGuide, is_public: false };
  const rows = {
    orders: [{ id: orderId, order_number: 'QA', user_id: 'buyer', status: 'paid' }],
    order_items: [{ order_id: orderId, item_name: '문샷 5기', cohort_id: cohortId }],
    cohorts: [{ id: cohortId, name: '5기' }],
    site_settings: [
      guideRow,
      { key: config.completionGuideSettingsKey(otherId), value: { label: '다른 기수', url: 'https://campus.example.test/other' }, is_public: false },
      { key: config.onboardingSettingsKey(cohortId), value: { roomName: '기존 공지방', inviteUrl, enabled: true }, is_public: false },
    ],
  };
  const db = { from(table) {
    let data = rows[table];
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq(column, expected) { data = data.filter(row => row[column] === expected); return query; },
      in(column, expected) { data = data.filter(row => expected.includes(row[column])); return query; },
      then(resolve) { resolve({ data }); },
    };
    return query;
  } };
  const { eligiblePurchase } = load('../lib/purchase-onboarding-server.ts', {
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/purchase-onboarding': config,
  });
  assert.deepEqual((await eligiblePurchase('buyer', orderId)).completionGuide, completionGuide);
  const messageOnly = { label: '', url: '', message: 'OT 안내를 확인해 주세요.' };
  guideRow.value = messageOnly;
  assert.deepEqual((await eligiblePurchase('buyer', orderId)).completionGuide, messageOnly);
  assert.equal(await eligiblePurchase('another-user', orderId), null);
  rows.orders[0].status = 'cancelled';
  assert.equal(await eligiblePurchase('buyer', orderId), null);
  rows.orders[0].status = 'paid';
  guideRow.value = { label: '', url: '', message: '   ' };
  assert.equal(await eligiblePurchase('buyer', orderId), null);
  rows.site_settings.shift();
  assert.equal((await eligiblePurchase('buyer', orderId)).settings.inviteUrl, inviteUrl);
});
