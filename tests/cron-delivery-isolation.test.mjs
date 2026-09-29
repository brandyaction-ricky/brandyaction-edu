import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { timingSafeEqual } from 'node:crypto';

function harness(env) {
  const calls = { crm: 0, push: 0 };
  function route(path) {
    const exports = {};
    const modules = {
      'node:crypto': { timingSafeEqual },
      '@/lib/crm-delivery': { dispatchDueCrm: async () => { calls.crm++; return { sent: 1 }; } },
      '@/lib/web-push-server': { dispatchWebPush: async () => { calls.push++; return { sent: 1 }; } },
    };
    new Function('exports', 'require', 'process', ts.transpileModule(
      fs.readFileSync(new URL(`../app/api/cron/${path}/route.ts`, import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
    ).outputText)(exports, name => {
      assert.ok(modules[name], `Unexpected import: ${name}`);
      return modules[name];
    }, { env });
    return (authorization = 'Bearer test-cron-secret') => exports.GET(new Request(`https://dev.example.test/api/cron/${path}`, {
      headers: authorization ? { authorization } : {},
    }));
  }
  return { calls, crm: route('crm'), push: route('push') };
}

test('a shared cron credential can run push while scheduled SMS/email stays paused', async () => {
  const h = harness({ CRON_SECRET: 'test-cron-secret', CRM_CRON_ENABLED: 'false' });
  const paused = await h.crm();
  assert.equal(paused.status, 200);
  assert.equal(paused.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await paused.json(), { ok: true, disabled: true, campaigns: 0, automations: 0, sent: 0, failed: 0 });
  assert.equal((await h.push()).status, 200);
  assert.deepEqual(h.calls, { crm: 0, push: 1 });
});

test('pausing CRM never bypasses authentication or invokes a delivery service', async () => {
  for (const secret of [undefined, 'test-cron-secret']) {
    const h = harness({ CRON_SECRET: secret, CRM_CRON_ENABLED: 'false' });
    for (const credential of [null, 'Bearer wrong']) {
      assert.equal((await h.crm(credential)).status, 401);
      assert.equal((await h.push(credential)).status, 401);
    }
    assert.deepEqual(h.calls, { crm: 0, push: 0 });
  }
});

test('existing environments keep scheduled delivery unless explicitly paused', async () => {
  for (const enabled of [undefined, 'true']) {
    const h = harness({ CRON_SECRET: 'test-cron-secret', CRM_CRON_ENABLED: enabled });
    const result = await h.crm();
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: true, sent: 1 });
    assert.deepEqual(h.calls, { crm: 1, push: 0 });
  }
});
