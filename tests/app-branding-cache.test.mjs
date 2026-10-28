import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
require('next/dist/server/node-environment-baseline');
const { unstable_cache } = require('next/cache');
const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external');
function load(file, mocks = {}) {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports, name => {
    if (!(name in mocks)) throw Error(name);
    return mocks[name];
  });
  return exports;
}
const rules = load('lib/app-branding.ts');
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const saved = { revision: id(1), iconId: id(2), sourceHash: 'a'.repeat(64), secret: 'never-public' };
process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://branding-cache-fixture.test';

// Exercise the installed Next cache and Supabase client, not fn => fn mocks.
// Only the cache backend and HTTP transport are in memory; no live DB is used.
function harness() {
  let now = 0, reads = 0, mode = 'ok', stored = saved, cacheOptions;
  const entries = new Map();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, 'fixture-server-key', {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: async (input, init) => {
      reads++;
      const url = new URL(input);
      assert.equal(url.pathname, '/rest/v1/site_settings');
      assert.deepEqual([...url.searchParams], [['select', 'value'], ['key', 'eq.edu_app_branding'], ['is_public', 'eq.false']]);
      assert.ok(init.signal);
      if (mode === 'timeout') await new Promise((resolve, reject) => {
        if (init.signal.aborted) reject(init.signal.reason);
        else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
      if (mode === 'error') return Response.json({ message: 'private SQL and key must not leak' }, { status: 400 });
      return Response.json(stored === null ? [] : [{ value: stored }]);
    } },
  });
  const incrementalCache = {
    generateSimpleCacheKey: async key => key,
    get: async (key, options) => {
      const row = entries.get(key);
      return row ? { value: row.value, isStale: now - row.at > options.revalidate * 1000 } : null;
    },
    set: async (key, value) => { entries.set(key, { value, at: now }); },
  };
  const server = load('lib/app-branding-server.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/app-branding': rules,
    'next/cache': { unstable_cache: (fn, keys, options) => {
      cacheOptions = { keys, ...options };
      return unstable_cache(fn, keys, options);
    } },
  });
  const read = async () => {
    const work = { route: '/my', incrementalCache, isStaticGeneration: false };
    const result = await workAsyncStorage.run(work, () => server.getPublicAppBranding());
    await Promise.all(Object.values(work.pendingRevalidates || {}));
    return result;
  };
  return {
    read, db, server, options: () => cacheOptions, reads: () => reads,
    fail: value => { mode = value; }, store: value => { stored = value; },
    advance: milliseconds => { now += milliseconds; },
    invalidate: () => entries.clear(), entries,
  };
}

test('successful branding stays cached past 60 seconds without a background DB read', async () => {
  const h = harness(), first = await h.read();
  assert.equal(first.custom, true);
  assert.doesNotMatch(JSON.stringify(first), /sourceHash|secret|fixture-server-key/);
  assert.deepEqual(h.options().tags, [rules.APP_BRANDING_TAG]);
  assert.ok(h.options().keys.includes(process.env.NEXT_PUBLIC_SUPABASE_URL));
  h.advance(61_000); h.fail('error');
  assert.deepEqual(await h.read(), first);
  assert.deepEqual(await Promise.all(Array.from({ length: 10 }, () => h.read())), Array(10).fill(first));
  assert.equal(h.reads(), 1);
  assert.equal(h.options().revalidate, false);
});

test('save/reset tag eviction loads fresh settings, including an intentional default icon', async () => {
  const h = harness(); await h.read();
  h.store({ revision: id(3), iconId: id(4), sourceHash: 'b'.repeat(64) });
  h.invalidate();
  assert.match((await h.read()).icon, new RegExp(id(4)));
  h.store({ revision: id(5), iconId: null, sourceHash: null }); h.invalidate();
  const reset = await h.read();
  assert.equal(reset.custom, false); assert.equal(reset.revision, id(5));
  assert.equal(reset.icon, '/icons/edu-192.png'); assert.equal(h.reads(), 3);
});

test('a failed cold read falls back without caching failure and recovers on the next request', async t => {
  const warnings = []; t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
  const h = harness(); h.fail('error');
  assert.equal((await h.read()).custom, false);
  assert.equal(h.entries.size, 0);
  assert.equal(warnings.length, 1); assert.match(warnings[0], /app-branding/);
  assert.doesNotMatch(warnings[0], /private SQL|fixture-server-key/);
  h.fail('ok'); assert.equal((await h.read()).custom, true); assert.equal(h.reads(), 2);
});

test('actual Supabase AbortSignal bounds a cold public lookup to two seconds and permits recovery', async t => {
  t.mock.method(console, 'warn', () => {});
  const h = harness(); h.fail('timeout');
  // AbortSignal.timeout uses an unref'ed timer; keep this isolated test alive.
  const keepAlive = setInterval(() => {}, 1000), start = performance.now();
  try {
    assert.equal((await h.read()).custom, false);
    const elapsed = performance.now() - start;
    assert.ok(elapsed >= 1900 && elapsed < 4000, `public timeout took ${elapsed}ms`);
    assert.equal(h.entries.size, 0);
    h.fail('ok'); assert.equal((await h.read()).custom, true);
  } finally { clearInterval(keepAlive); }
});

test('malformed private settings are not cached as defaults; disabled feature never queries', async t => {
  t.mock.method(console, 'warn', () => {});
  const h = harness(); h.store({ revision: 'not-valid', iconId: '../../private' });
  assert.equal((await h.read()).custom, false); assert.equal(h.entries.size, 0);
  h.store(saved); assert.equal((await h.read()).custom, true);
  process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'false';
  try {
    const disabled = harness(); assert.equal((await disabled.read()).custom, false); assert.equal(disabled.reads(), 0);
  } finally { process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true'; }
});

test('admin reads still fail explicitly instead of returning a public fallback', async () => {
  const h = harness(); h.fail('error');
  await assert.rejects(h.server.readStoredAppBranding(h.db));
});
