import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function health({ env = {}, databaseError = null } = {}) {
  const source = fs.readFileSync(new URL('../app/api/health/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const query = {
    select() { return this; },
    async limit() { return { error: databaseError }; },
  };
  const exports = {};
  const tossEnvironmentSource = fs.readFileSync(new URL('../lib/toss-environment.ts', import.meta.url), 'utf8');
  const tossEnvironmentCompiled = ts.transpileModule(tossEnvironmentSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const tossEnvironment = {};
  new Function('exports', tossEnvironmentCompiled)(tossEnvironment);
  new Function('exports', 'require', 'process', compiled)(
    exports,
    name => name.endsWith('supabase/admin')
      ? { createAdminClient: () => ({ from: () => query }) }
      : name.endsWith('toss-environment')
        ? tossEnvironment
      : (() => { throw new Error(`unexpected import: ${name}`); })(),
    { env },
  );
  return exports.GET;
}

const completeDevEnv = {
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_SUPABASE_URL: 'https://devprojectref.supabase.co',
  NEXT_PUBLIC_TOSS_CLIENT_KEY: 'test_ck_mock',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-only-for-test',
  TOSS_SECRET_KEY: 'test_sk_mock',
  TOSS_WEBHOOK_TOKEN: 'webhook-token-only-for-test',
  VERCEL_ENV: 'production',
  VERCEL_GIT_COMMIT_SHA: '1234567890abcdef',
};

test('health reports a connected DEV stack without exposing credentials', async () => {
  const response = await health({ env: completeDevEnv })();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(body, {
    ok: true,
    environment: 'development',
    deployment: 'production',
    release: '1234567890ab',
    services: {
      supabase: { configured: true, reachable: true, projectRef: 'devprojectref' },
      toss: {
        clientConfigured: true,
        secretConfigured: true,
        webhookConfigured: true,
        mode: 'test',
        refundsEnabled: true,
      },
    },
  });
  assert.doesNotMatch(JSON.stringify(body), /service-role-only-for-test|test_sk_mock|webhook-token-only-for-test/);
});

test('health fails closed when the database is unavailable', async () => {
  const response = await health({ env: completeDevEnv, databaseError: { code: 'offline' } })();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).services.supabase.reachable, false);
});

test('health rejects a live Toss secret in a non-production app', async () => {
  const response = await health({ env: { ...completeDevEnv, TOSS_SECRET_KEY: 'live_sk_mock' } })();
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.services.toss.mode, 'mismatch');
});

test('health reports live refunds ready only after the production approval gate', async () => {
  const env = {
    ...completeDevEnv,
    NEXT_PUBLIC_APP_ENV: 'production',
    NEXT_PUBLIC_TOSS_CLIENT_KEY: 'live_ck_mock',
    TOSS_SECRET_KEY: 'live_sk_mock',
    EDU_ALLOW_LIVE_REFUNDS: 'true',
  };
  const production = await health({ env })();
  assert.equal(production.status, 200);
  assert.equal((await production.json()).services.toss.refundsEnabled, true);

  const preview = await health({ env: { ...env, VERCEL_ENV: 'preview' } })();
  assert.equal((await preview.json()).services.toss.refundsEnabled, false);
});

test('health rejects unknown Toss credential modes in a development app', async () => {
  const response = await health({ env: { ...completeDevEnv, TOSS_SECRET_KEY: 'opaque-secret', NEXT_PUBLIC_TOSS_CLIENT_KEY: 'opaque-client' } })();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).services.toss.mode, 'unknown');
});

test('health fails when required service configuration is missing', async () => {
  const response = await health({ env: { NEXT_PUBLIC_APP_ENV: 'development' } })();
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.services.supabase.configured, false);
  assert.equal(body.services.toss.mode, 'missing');
});
