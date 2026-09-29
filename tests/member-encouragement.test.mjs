import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
function load(file, mocks = {}) { const out = {}; new Function('exports', 'require', ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(out, name => mocks[name]); return out; }
const rules = load('lib/member-encouragement.ts');
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true';
const packet = (n = 2, expectedRevision = null, message = ' 같이 해봐요 ') => ({ publicName: ' 학습 친구 ', message, expectedRevision, requestId: id(n) });
function harness({ user = { id: id(1), role: 'member' }, initial = null, dbError = null, race = null, feed = [] } = {}) {
  let stored = initial, raceApplied = false; const calls = [], writes = [];
  const db = { from(table) {
    assert.equal(table, 'edu_member_encouragements'); const filters = [], q = {}; let action = 'read', values, columns, limit;
    q.select = value => { columns = value; return q; };
    for (const method of ['eq', 'neq', 'gt', 'order']) q[method] = (key, value) => { filters.push([method, key, value]); return q; };
    q.limit = value => { limit = value; return q; };
    for (const method of ['insert', 'update']) q[method] = value => { action = method; values = value; return q; };
    q.abortSignal = signal => { assert.ok(signal instanceof AbortSignal); return q; };
    q.then = (resolve, reject) => Promise.resolve().then(() => {
      calls.push({ action, filters, columns, limit });
      assert.equal(columns, 'id,public_name,message,profiles!inner(status)');
      assert.equal(limit, 51); assert.deepEqual(filters.slice(0, 3), [['eq', 'profiles.status', 'active'], ['neq', 'message', ''], ['order', 'id', { ascending: true }]]);
      return dbError ? { error: { message: dbError } } : { data: feed };
    }).then(resolve, reject);
    q.maybeSingle = async () => {
      calls.push({ action, filters, columns });
      if (dbError) return { error: { message: dbError } };
      if (action === 'read') { assert.equal(columns, 'public_name,message,revision'); assert.deepEqual(filters, [['eq', 'user_id', user.id]]); return { data: stored ? { public_name: stored.publicName, message: stored.message, revision: stored.revision } : null }; }
      if (race && !raceApplied) { stored = race; raceApplied = true; }
      if (action === 'insert' && stored) return { error: { code: '23505' } };
      if (action === 'update') {
        assert.deepEqual(filters[0], ['eq', 'user_id', user.id]);
        assert.equal(filters[1][1], 'revision'); if (!stored || stored.revision !== filters[1][2]) return { data: null };
        assert.equal(values.user_id, undefined);
      } else assert.equal(values.user_id, user.id);
      stored = { publicName: values.public_name, message: values.message, revision: values.revision }; writes.push(values); return { data: { revision: stored.revision } };
    }; return q;
  } };
  const route = load('app/api/platform/encouragement/route.ts', {
    '@/lib/member-encouragement': rules, '@/lib/edu-workflows': { uuid: value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) },
    '@/lib/server-auth': { getAuthenticatedUser: async () => user }, '@/lib/supabase/admin': { createAdminClient: () => db },
  });
  return { calls, writes, get: (query = '') => route.GET(new Request('https://edu.test/api/platform/encouragement' + query)), put: (body, origin = 'https://edu.test', raw = false) => route.PUT(new Request('https://edu.test/api/platform/encouragement', { method: 'PUT', headers: origin ? { origin } : {}, body: raw ? body : JSON.stringify(body) })), stored: () => stored };
}
test('explicit public nickname is required for publication, bounded inputs and literal text survive', () => {
  assert.deepEqual(rules.encouragementInput(' 공개 별명 ', ' <img onerror=x>\n응원 '), { publicName: '공개 별명', message: '<img onerror=x>\n응원' });
  assert.deepEqual(rules.readEncouragement(null), { publicName: '', message: '', revision: null });
  assert.deepEqual(rules.encouragementInput('', '   '), { publicName: '', message: '' });
  for (const [name, message] of [['', '공개 메시지'], ['x'.repeat(41), ''], ['x', 'x'.repeat(81)], [null, ''], ['x', {}]]) assert.throws(() => rules.encouragementInput(name, message));
  for (const value of [{}, [], { publicName: '', message: '', revision: 'bad' }]) assert.throws(() => rules.readEncouragement(value));
  for (const value of [{ rows: [{ id: id(1), publicName: 'a', message: '' }], nextCursor: null }, { rows: [], nextCursor: 'bad' }, {}]) assert.throws(() => rules.readEncouragementPage(value));
});
test('public feed filters active members and projects no real names, emails, ownership or revisions', async () => {
  const feed = Array.from({ length: 51 }, (_, i) => ({ id: id(10 + i), public_name: '공개 친구', message: '응원', user_id: id(1), revision: id(2), full_name: 'private', email: 'private', profiles: { status: 'active' } }));
  const h = harness({ user: null, feed }); const response = await h.get('?cursor=' + id(9)), data = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(data.rows.length, 50); assert.equal(data.nextCursor, id(59));
  assert.deepEqual(data.rows[0], { id: id(10), publicName: '공개 친구', message: '응원' }); assert.deepEqual(h.calls[0].filters[3], ['gt', 'id', id(9)]);
  assert.equal((await h.get('?mine=true')).status, 401); assert.equal((await h.put(packet())).status, 401); assert.equal(h.writes.length, 0);
  const last = harness({ feed: feed.slice(0, 50) }); assert.equal((await (await last.get()).json()).nextCursor, null);
});
test('feature gate, origin, malformed body and cross-user overwrite attempts fail before database access', async () => {
  const h = harness(); process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'false';
  try { assert.equal((await h.get()).status, 404); assert.equal((await h.put(packet())).status, 404); } finally { process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true'; }
  for (const origin of [null, 'https://evil.test']) assert.equal((await h.put(packet(), origin)).status, 403);
  for (const body of [null, [], { ...packet(), user_id: id(3) }, { ...packet(), publicName: '' }, { ...packet(), message: 'x'.repeat(81) }, { ...packet(), expectedRevision: undefined }, { ...packet(), requestId: 'bad' }]) assert.equal((await h.put(body)).status, 400);
  assert.equal((await h.get('?cursor=invalid')).status, 400); assert.equal((await h.put('{', 'https://edu.test', true)).status, 400); assert.equal((await h.put('x'.repeat(2049), 'https://edu.test', true)).status, 413); assert.equal(h.calls.length, 0);
});
test('owner create, retry after response loss, edit and withdrawal keep one row and use the active user ID', async () => {
  const h = harness(); assert.deepEqual(await (await h.get('?mine=true')).json(), { publicName: '', message: '', revision: null });
  assert.equal((await h.put(packet())).status, 200); assert.equal((await h.put(packet())).status, 200); assert.equal(h.writes.length, 1);
  assert.equal((await h.put(packet(2, null, 'different'))).status, 409);
  assert.equal((await h.put(packet(3, id(2), '   '))).status, 200); assert.deepEqual(await (await h.get('?mine=true')).json(), { publicName: '학습 친구', message: '', revision: id(3) });
  assert.equal((await h.put(packet(4, id(2)))).status, 409); assert.equal(h.writes.length, 2);
});
test('concurrent insert/update preserve the winning message, while duplicate winning requests succeed', async () => {
  const race = { publicName: '동일 회원', message: '다른 화면 저장', revision: id(9) };
  for (const initial of [null, { publicName: '기존 별명', message: '기존 메시지', revision: id(5) }]) {
    const h = harness({ initial, race }); assert.equal((await h.put(packet(6, initial?.revision ?? null))).status, 409); assert.deepEqual(h.stored(), race); assert.equal(h.writes.length, 0);
  }
  const h = harness({ race: { publicName: '학습 친구', message: '같이 해봐요', revision: id(2) } }); assert.equal((await h.put(packet())).status, 200); assert.equal(h.writes.length, 0);
});
test('database errors and malformed stored data never expose database details or discard content', async () => {
  for (const options of [{ dbError: 'secret SQL connection' }, { initial: { publicName: '', message: 'invalid', revision: id(4) } }]) {
    const h = harness(options); for (const response of [await h.get('?mine=true'), await h.put(packet())]) { assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret|SQL|connection|invalid/); } assert.equal(h.writes.length, 0);
  }
});
test('real PostgreSQL constraints, role grants, ownership uniqueness, atomic revision compare and cascade', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table profiles(id uuid primary key);');
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260929002659_member_encouragement.sql', import.meta.url), 'utf8'));
    await db.query('insert into profiles values($1),($2)', [id(1), id(2)]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role); await assert.rejects(db.query('select * from edu_member_encouragements'), /permission denied/);
      await assert.rejects(db.query('insert into edu_member_encouragements(user_id,revision) values($1,$2)', [id(1), id(10)]), /permission denied/); await db.exec('reset role');
    }
    assert.equal((await db.query("select relrowsecurity from pg_class where relname='edu_member_encouragements'")).rows[0].relrowsecurity, true);
    await db.exec('set role service_role');
    await db.query('insert into edu_member_encouragements(user_id,public_name,message,revision) values($1,$2,$3,$4)', [id(1), '공개 별명', '함께 해봐요', id(10)]);
    for (const [name, message] of [['', '공개'], ['a'.repeat(41), ''], ['a', 'x'.repeat(81)], [' 이름 ', '메시지']]) await assert.rejects(db.query('insert into edu_member_encouragements(user_id,public_name,message,revision) values($1,$2,$3,$4)', [id(2), name, message, id(20)]), /check constraint/);
    await assert.rejects(db.query('insert into edu_member_encouragements(user_id,revision) values($1,$2)', [id(1), id(11)]), /unique constraint/);
    assert.equal((await db.query('update edu_member_encouragements set message=$1,revision=$2 where user_id=$3 and revision=$4 returning revision', ['바뀐 응원', id(11), id(1), id(10)])).rows.length, 1);
    assert.equal((await db.query('update edu_member_encouragements set message=$1 where user_id=$2 and revision=$3 returning revision', ['덮어쓰기', id(1), id(10)])).rows.length, 0);
    await db.query("update edu_member_encouragements set message='' where user_id=$1", [id(1)]);
    assert.equal((await db.query("select * from edu_member_encouragements where message<>''")).rows.length, 0);
    await assert.rejects(db.exec('delete from edu_member_encouragements'), /permission denied/);
    await db.exec('reset role'); await db.query('delete from profiles where id=$1', [id(1)]); assert.equal((await db.query('select * from edu_member_encouragements')).rows.length, 0);
  } finally { await db.close(); }
});
