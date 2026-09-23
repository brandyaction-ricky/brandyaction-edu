import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function routeFor({ environment = 'development', role = 'admin', configured = true, fail = false } = {}) {
  const sent = [];
  const env = {
    NEXT_PUBLIC_APP_ENV: environment,
    CRM_TEST_RECIPIENT_PHONE: configured ? '01012345678' : undefined,
    SOLAPI_SENDER_PHONE: configured ? '01098765432' : undefined,
    SOLAPI_API_KEY: configured ? 'test-key' : undefined,
    SOLAPI_API_SECRET: configured ? 'test-secret' : undefined,
  };
  const modules = {
    'solapi': { SolapiMessageService: class { async send(message) {
      sent.push(message);
      if (fail) throw new Error('private provider detail');
      return { failedMessageList: [], groupInfo: { groupId: 'qa-group' } };
    } } },
    '@/lib/operator-permissions': { getOperatorUser: async () => role ? { role } : null },
  };
  const exports = {};
  new Function('exports', 'require', 'process', ts.transpileModule(
    fs.readFileSync(new URL('../app/api/crm/test-send/route.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText)(exports, name => {
    assert.ok(modules[name], `unexpected import ${name}`);
    return modules[name];
  }, { env });
  const request = (origin = 'https://dev.example.test') => new Request('https://dev.example.test/api/crm/test-send', {
    method: 'POST', headers: { origin }, body: JSON.stringify({ recipient: '01000000000' }),
  });
  return { route: exports, request, sent };
}

test('DEV test SMS is admin-only, same-origin, and fixed to the configured recipient', async () => {
  const qa = routeFor();
  const response = await qa.route.POST(qa.request());
  assert.equal(response.status, 200);
  assert.equal(qa.sent.length, 1);
  assert.equal(qa.sent[0].to, '01012345678');
  assert.equal(qa.sent[0].type, 'SMS');
  assert.equal((await response.json()).recipient, '010****5678');
  for (const invalid of [
    { origin: 'https://other.example.test' },
    { role: 'staff' },
    { role: null },
    { environment: 'production' },
    { configured: false },
  ]) {
    const current = routeFor(invalid);
    const result = await current.route.POST(current.request(invalid.origin));
    assert.ok(result.status >= 400);
    assert.equal(current.sent.length, 0);
  }
});

test('provider errors reveal no upstream data and are not automatically retried', async () => {
  const qa = routeFor({ fail: true });
  const response = await qa.route.POST(qa.request());
  assert.equal(response.status, 502);
  assert.equal(qa.sent.length, 1);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private provider detail/);
});

test('activating campaigns does not release older automation runs without a separate switch', async () => {
  const exports = {};
  const source = fs.readFileSync(new URL('../lib/crm-delivery.ts', import.meta.url), 'utf8');
  const db = { from: table => {
    if (table !== 'crm_campaigns') throw new Error('automation queue was read');
    const chain = { select: () => chain, eq: () => chain, lte: () => chain,
      order: () => chain, limit: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
    return chain;
  } };
  const modules = {
    'solapi': { SolapiMessageService: class {} },
    '@/lib/supabase/admin': { createAdminClient: () => db },
  };
  new Function('exports', 'require', 'process', ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports, name => modules[name], { env: {
    CRM_DELIVERY_ENABLED: 'true', SOLAPI_API_KEY: 'key', SOLAPI_API_SECRET: 'secret',
    SOLAPI_SENDER_PHONE: '01098765432', CRM_AUTOMATIONS_ENABLED: 'false',
  } });
  const result = await exports.dispatchDueCrm();
  assert.deepEqual(result, { disabled: false, campaigns: 0, automations: 0, sent: 0, failed: 0 });
});
