import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('email hints limit both the caller and order across requests and release expired counters', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema private;');
    await db.exec(readFileSync(new URL('../supabase/migrations/20261113040300_account_email_hint.sql', import.meta.url), 'utf8'));
    for (const role of ['anon', 'authenticated']) {
      const { rows } = await db.query("select has_function_privilege($1,'public.edu_account_hint_allow(text,text)','execute') as allowed", [role]);
      assert.equal(rows[0].allowed, false);
    }
    await db.exec('set role service_role');
    const key = n => n.toString(16).padStart(64, '0');
    const allowed = async (client, order) => (await db.query('select public.edu_account_hint_allow($1,$2) as ok', [key(client), key(order)])).rows[0].ok;
    for (let i = 0; i < 8; i++) assert.equal(await allowed(0, 1), true);
    assert.equal(await allowed(0, 2), false);
    assert.equal(await allowed(2, 1), false);
    assert.equal(await allowed(2, 2), true);
    await db.exec("update private.edu_account_hint_attempts set expires_at=now()-interval '1 second'");
    assert.equal(await allowed(0, 1), true);
  } finally { await db.close(); }
});

test('order lookup returns only an active purchaser’s masked Auth email and rejects a wrong phone before account lookup', async () => {
  const { build } = await import('esbuild');
  const { createRequire } = await import('node:module');
  const bundle = await build({ entryPoints: ['app/api/auth/find-email/route.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', write: false });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
  const { POST } = mod.exports;
  const origin = 'https://edu.example.test';
  const savedFetch = globalThis.fetch;
  const vars = { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-test' };
  const originals = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  const paths = [];
  let allow = true;
  Object.assign(process.env, vars);
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      assert.equal(url.origin, 'https://db.example.test');
      paths.push(url.pathname);
      if (url.pathname.endsWith('/rpc/edu_account_hint_allow')) return Response.json(allow);
      if (url.pathname.endsWith('/orders')) {
        assert.equal(url.searchParams.get('order_number'), 'eq.BAE-20261113100000000-ABCDEF12');
        assert.equal(url.searchParams.get('is_test_order'), 'eq.false');
        return Response.json([{ user_id: '11111111-1111-4111-8111-111111111111', customer_phone: '010-1111-1111' }]);
      }
      if (url.pathname.endsWith('/profiles')) {
        assert.equal(url.searchParams.get('status'), 'eq.active');
        assert.equal(url.searchParams.get('deleted_at'), 'is.null');
        return Response.json([{ id: '11111111-1111-4111-8111-111111111111' }]);
      }
      if (url.pathname.startsWith('/auth/v1/admin/users/')) return Response.json({ id: '11111111-1111-4111-8111-111111111111', email: 'student@example.test' });
      throw Error('Unexpected request');
    };
    const lookup = phone => POST(new Request(origin + '/api/auth/find-email', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ order: 'bae-20261113100000000-abcdef12', phone }) }));
    assert.deepEqual(await (await lookup('01022222222')).json(), { hint: null });
    assert.equal(paths.length, 2);
    assert.deepEqual(await (await lookup('01011111111')).json(), { hint: 's***@example.test' });
    const before = paths.length;
    allow = false;
    assert.equal((await lookup('01011111111')).status, 429);
    assert.equal(paths.length, before + 1);
  } finally {
    globalThis.fetch = savedFetch;
    for (const [k, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[k]; else process.env[k] = value;
    }
  }
});
