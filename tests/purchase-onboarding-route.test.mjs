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
  const dependencies = {
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('direct guidance must not read or write survey data'); } },
    '@/lib/purchase-onboarding-progress-server': { readOnboardingProgress: async () => ({ telegram: false }), confirmOnboardingStep: async () => ({ ok: true }) },
    '@/lib/server-auth': { getAuthenticatedUser: async () => user },
    '@/lib/qa-rules': { imagePreviewUrl: () => '' },
    '@/lib/purchase-onboarding-server': { eligiblePurchase: async (userId, requested) => { calls.push([userId, requested]); return purchase; } },
    '@/lib/purchase-onboarding': { MOONSHOT_SUPPORT_URL: 'http://pf.kakao.com/_ydxjhxj/chat' },
    '@/lib/public-platform-data': { getPublicSupport: () => { throw Error('not needed'); } },
    '@/lib/platform': { safeUrl: () => '' },
  };
  const route = {};
  new Function('exports', 'require', compiled)(route, name => dependencies[name]);
  return { route, calls };
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
