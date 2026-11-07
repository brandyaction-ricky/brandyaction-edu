import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

function load(path, modules = {}, env = {}) {
  const exports = {};
  new Function('exports', 'require', 'process', ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)
    (exports, name => { assert.ok(modules[name], name); return modules[name]; }, { env });
  return exports;
}
const lib = load('../lib/short-links.ts');
const server = load('../lib/short-links-server.ts', { 'node:crypto': crypto, './short-links': lib });
const entry = load('../lib/broadcast-entry.ts');

// In-memory stand-in for the few supabase-js calls the routes make.
function fakeDb(rows = [], { rpcError = null, rpcData } = {}) {
  const calls = [];
  return { rows, calls,
    rpc: async (name, args) => { calls.push({ name, args }); if (rpcError) return { data: null, error: rpcError };
      if (rpcData !== undefined) return { data: rpcData, error: null };
      const row = rows.find(r => r.key === args.p_key && r.is_active); if (row && args.p_record) row.click_count++;
      return { data: row ? row.destination : null, error: null }; },
    from() {
      let op = 'select', payload; const filters = [];
      const run = () => {
        calls.push({ op, payload, filters });
        if (op === 'insert') {
          if (rows.some(r => r.key === payload.key)) return { data: null, error: { code: '23505' } };
          const row = { is_active: true, click_count: 0, last_clicked_at: null, created_at: 'c', updated_at: 'u', ...payload };
          rows.push(row); return { data: row, error: null };
        }
        const hit = rows.filter(r => filters.every(([k, v]) => r[k] === v));
        if (op === 'update') hit.forEach(r => Object.assign(r, payload));
        return { data: op === 'update' ? hit[0] ?? null : hit, error: null };
      };
      const b = { select: () => b, order: () => b, limit: () => b, eq: (k, v) => (filters.push([k, v]), b),
        insert: p => (op = 'insert', payload = p, b), update: p => (op = 'update', payload = p, b),
        single: async () => run(), maybeSingle: async () => { const r = run(); return { ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data }; },
        then: (ok, no) => Promise.resolve(run()).then(ok, no) };
      return b;
    } };
}
const row = (key, extra = {}) => ({ key, label: '무료 강의 카톡방', channel: '마케팅', destination: 'https://open.kakao.com/o/abc', is_active: true,
  click_count: 0, last_clicked_at: null, created_at: 'c', updated_at: 'u', ...extra });
const modules = (db, actor = { id: 'admin-1' }) => ({ '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/broadcast-entry': entry,
  '@/lib/short-links': lib, '@/lib/short-links-server': server, '@/lib/operator-permissions': { getOperatorUser: async () => actor }, 'node:crypto': crypto });

test('destinations: https to a real host only, no login part, port, IP or loop back into /go/', () => {
  assert.equal(lib.shortLinkTarget(' https://open.kakao.com/o/abc?x=1 '), 'https://open.kakao.com/o/abc?x=1');
  assert.equal(lib.shortLinkTarget('https://brandyaction-edu.com/classes/x'), 'https://brandyaction-edu.com/classes/x');
  for (const bad of ['http://open.kakao.com/o/abc', 'javascript:alert(1)', '//evil.test', '/classes/x', 'https://user:pw@evil.test/',
    'https://evil.test:8443/', 'https://127.0.0.1/', 'https://localhost/', 'https://[::1]/', 'https://www.brandyaction-edu.com/go/abc',
    'https://evil.test/a b', 'https://evil.test/\\x', 'https://evil.test/' + 'a'.repeat(2000), 42, null])
    assert.equal(lib.shortLinkTarget(bad), null, String(bad));
  assert.equal(lib.shortLinkKey('free-class'), 'free-class');
  for (const bad of ['a', '-ab', 'ab-', 'Free', 'a_b', 'a'.repeat(41), '../x']) assert.equal(lib.shortLinkKey(bad), null, bad);
  assert.deepEqual(lib.shortLinkCreateInput({ key: ' Free-Class ', label: ' 카톡방 ', channel: '마케팅', target: 'https://open.kakao.com/o/abc' }),
    { key: 'free-class', label: '카톡방', channel: '마케팅', destination: 'https://open.kakao.com/o/abc' });
  assert.throws(() => lib.shortLinkCreateInput({ label: 'x', channel: 'y', target: 'http://x.test' }), /https/);
  assert.throws(() => lib.shortLinkPatchInput({ key: 'abc' }), /바꿀 내용/);
  assert.throws(() => lib.shortLinkPatchInput({ key: 'abc', active: 'no' }), /켜기/);
});

test('/go/<key> follows only the stored destination, counts real visits and sends unknown or switched-off links home', async () => {
  const req = (method = 'GET', headers = {}) => new Request('https://brandyaction-edu.com/go/free-class', { method, headers: { 'user-agent': 'Mozilla/5.0', 'sec-fetch-mode': 'navigate', ...headers } });
  const ctx = code => ({ params: Promise.resolve({ code }) });
  const db = fakeDb([row('free-class'), row('off', { is_active: false })]), route = load('../app/go/[code]/route.ts', modules(db));
  const response = await route.GET(req(), ctx('free-class'));
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), 'https://open.kakao.com/o/abc');
  assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(db.rows[0].click_count, 1);
  await route.HEAD(req('HEAD'), ctx('free-class')); await route.GET(req('GET', { 'user-agent': 'kakaotalk-scrap/1.0' }), ctx('free-class'));
  await route.GET(req('GET', { 'sec-purpose': 'prefetch' }), ctx('free-class'));
  assert.equal(db.rows[0].click_count, 1, 'HEAD, link preview and prefetch are not counted');
  for (const code of ['off', 'missing', '../../evil', 'UPPER'])
    assert.equal((await route.GET(req(), ctx(code))).headers.get('location'), 'https://brandyaction-edu.com/');
  assert.equal(db.calls.filter(c => c.name).length, 6, 'malformed keys never reach the database');
  assert.equal((await load('../app/go/[code]/route.ts', modules(fakeDb([], { rpcData: 'https://evil.test:9/' }))).GET(req(), ctx('abc'))).status, 503);
  assert.equal((await load('../app/go/[code]/route.ts', modules(fakeDb([], { rpcError: { message: 'x' } }))).GET(req(), ctx('abc'))).status, 503);
});

test('admin API needs marketing access and the same origin, and records who changed the link', async () => {
  const db = fakeDb([row('free-class')]), route = load('../app/api/admin/short-links/route.ts', modules(db));
  const send = (method, body, origin = 'https://brandyaction-edu.com') => new Request('https://brandyaction-edu.com/api/admin/short-links', { method, headers: { origin }, body: JSON.stringify(body) });
  const list = await (await route.GET(new Request('https://brandyaction-edu.com/api/admin/short-links'))).json();
  assert.equal(list.items[0].url, 'https://brandyaction-edu.com/go/free-class');
  assert.equal((await route.POST(send('POST', { label: 'a', channel: 'b', target: 'https://x.test/' }, 'https://evil.test'))).status, 403);
  assert.equal((await load('../app/api/admin/short-links/route.ts', modules(db, null)).GET(new Request('https://brandyaction-edu.com/x'))).status, 403);
  const created = await route.POST(send('POST', { label: '무료 자료', channel: '마케팅', target: 'https://drive.google.com/x', key: '' }));
  assert.equal(created.status, 201); const { item } = await created.json();
  assert.match(item.key, /^[a-z2-9]{6}$/); assert.equal(db.rows.at(-1).created_by, 'admin-1');
  assert.equal((await route.POST(send('POST', { label: 'a', channel: 'b', target: 'https://x.test/', key: 'free-class' }))).status, 409);
  const changed = await route.PATCH(send('PATCH', { key: 'free-class', target: 'https://open.kakao.com/o/new' }));
  assert.equal((await changed.json()).item.target, 'https://open.kakao.com/o/new'); assert.equal(db.rows[0].updated_by, 'admin-1');
  assert.equal((await route.PATCH(send('PATCH', { key: 'free-class', target: 'http://x.test' }))).status, 422);
  assert.equal((await route.PATCH(send('PATCH', { key: 'nothing', active: false }))).status, 404);
});

test('OS integration: Bearer key only, MYIN-like { data } shape, safe retries', async () => {
  const secret = 'k'.repeat(40), db = fakeDb([row('free-class', { click_count: 7 })]);
  const route = load('../app/api/integrations/brandy-os/links/route.ts', modules(db), { EDU_OS_LINKS_SECRET: secret });
  const call = (method, body, headers = { authorization: `Bearer ${secret}` }) => route[method](new Request('https://brandyaction-edu.com/api/integrations/brandy-os/links',
    { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
  assert.equal((await load('../app/api/integrations/brandy-os/links/route.ts', modules(db)).GET(new Request('https://x.test/'))).status, 503);
  assert.equal((await call('GET', null, { authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await call('GET', null, { authorization: `Bearer ${secret}`, origin: 'https://evil.test' })).status, 403);
  const list = await (await call('GET')).json();
  assert.deepEqual(Object.keys(list.data.items[0]).sort(), ['active', 'channel', 'clicks', 'createdAt', 'key', 'label', 'lastClickedAt', 'target', 'updatedAt', 'url']);
  assert.equal(list.data.items[0].clicks, 7);
  const body = { target: 'https://open.kakao.com/o/xyz', label: '영상 12 카톡방', channel: '퇴사 채널', by: 'os:abc-123' };
  const first = await call('POST', body), again = await call('POST', body);
  assert.equal(first.status, 201); assert.equal(again.status, 200);
  const [a, b] = [await first.json(), await again.json()];
  assert.equal(a.data.created, true); assert.equal(b.data.created, false); assert.equal(a.data.key, b.data.key);
  assert.equal(db.rows.at(-1).created_by, 'os:abc-123');
  const bad = await call('POST', { ...body, target: 'http://x.test' });
  assert.equal(bad.status, 422); assert.match((await bad.json()).message, /https/);
  assert.equal((await (await call('PATCH', { key: a.data.key, active: false })).json()).data.active, false);
  assert.ok(!JSON.stringify([a, b, list]).includes(secret));
});

test('migration: additive table, only service role, counted hits and https-only destinations', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(readFileSync(new URL('../supabase/migrations/20261107130000_edu_short_links.sql', import.meta.url), 'utf8'));
  await db.exec("insert into edu_short_links(key,label,channel,destination) values ('free-class','카톡방','마케팅','https://open.kakao.com/o/abc'),('off','x','y','https://x.test/'); update edu_short_links set is_active=false where key='off'");
  for (const [key, destination] of [['Bad', 'https://x.test/'], ['ok-key', 'http://x.test/'], ['ok-key', 'javascript:alert(1)'], ['ok-key', 'https://user@x.test/']])
    await assert.rejects(db.query('insert into edu_short_links(key,label,channel,destination) values ($1,$2,$3,$4)', [key, 'a', 'b', destination]), /check constraint/);
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    await assert.rejects(db.query('select * from edu_short_links'), /permission denied/);
    await assert.rejects(db.query("select edu_short_link_hit('free-class', true)"), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const hit = async (key, record) => (await db.query('select edu_short_link_hit($1,$2) as v', [key, record])).rows[0].v;
  assert.equal(await hit('free-class', true), 'https://open.kakao.com/o/abc');
  assert.equal(await hit('free-class', false), 'https://open.kakao.com/o/abc');
  assert.equal(await hit('off', true), null); assert.equal(await hit('missing', true), null);
  const counted = (await db.query("select key,click_count,last_clicked_at is not null as seen from edu_short_links order by key")).rows;
  assert.deepEqual(counted, [{ key: 'free-class', click_count: 1, seen: true }, { key: 'off', click_count: 0, seen: false }]);
});
