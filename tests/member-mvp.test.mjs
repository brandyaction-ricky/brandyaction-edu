import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
function load(file, mocks = {}) { const out = {}; new Function('exports', 'require', ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(out, name => mocks[name]); return out; }
const rules = load('lib/member-mvp.ts'), id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true';
const packet = (n = 2, expectedRevision = null, extra = {}) => ({ kind: 'member', member: id(10), isMvp: true, color: null, requestId: id(n), expectedRevision, ...extra });
function harness({ user = { id: id(1), role: 'admin' }, operator = true, absent = false, initial = null, initialSettings = null, failure = false, race = null } = {}) {
  let row = initial, settings = initialSettings, raced = false; const calls = [], writes = [];
  const db = { from(table) {
    assert.ok(['profiles', 'edu_member_mvp', 'edu_mvp_settings'].includes(table)); let action = 'read', values, columns; const filters = [], q = {};
    q.select = value => { columns = value; return q; };
    for (const method of ['eq', 'neq', 'in']) q[method] = (key, value) => { filters.push([method, key, value]); return q; };
    for (const method of ['insert', 'update']) q[method] = value => { action = method; values = value; return q; };
    q.abortSignal = () => q;
    const execute = async single => {
      calls.push({ table, action, columns, filters }); if (failure) return { error: { message: 'secret SQL error' } };
      if (action === 'read') {
        if (table === 'profiles') { assert.deepEqual(filters[1], ['neq', 'status', 'withdrawn']); return { data: absent ? [] : [{ id: id(10) }] }; }
        const current = table === 'edu_mvp_settings' ? settings : row;
        return { data: single ? current : current ? [current] : [] };
      }
      assert.notEqual(table, 'profiles'); assert.equal(values.updated_by, id(1)); assert.ok(values.updated_at);
      if (race && !raced) { if (table === 'edu_mvp_settings') settings = race; else row = race; raced = true; }
      const current = table === 'edu_mvp_settings' ? settings : row;
      if (action === 'insert' && current) return { error: { code: '23505' } };
      if (action === 'update') {
        assert.deepEqual(filters[0], ['eq', table === 'edu_mvp_settings' ? 'id' : 'user_id', table === 'edu_mvp_settings' ? true : id(10)]);
        if (current?.revision !== filters[1][2]) return { data: null };
      }
      const result = { ...current, ...values }; if (table === 'edu_mvp_settings') settings = result; else row = result; writes.push({ table, values }); return { data: { revision: result.revision } };
    };
    q.maybeSingle = () => execute(true); q.then = (a, b) => execute(false).then(a, b); return q;
  } };
  const route = load('app/api/admin/member-mvp/route.ts', { '@/lib/member-mvp': rules, '@/lib/edu-workflows': { uuid: v => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) }, '@/lib/server-auth': { getAuthenticatedUser: async () => user }, '@/lib/operator-permissions': { getOperatorUser: async scope => { assert.equal(scope, 'members'); return operator; } }, '@/lib/supabase/admin': { createAdminClient: () => db } });
  return { calls, writes, row: () => row, settings: () => settings, get: (query = '?members=' + id(10)) => route.GET(new Request('https://edu.test/api/admin/member-mvp' + query)), put: (body, origin = 'https://edu.test', raw = false) => route.PUT(new Request('https://edu.test/api/admin/member-mvp', { method: 'PUT', headers: origin ? { origin } : {}, body: raw ? body : JSON.stringify(body) })) };
}
test('strict hex colors and removal clearing prevent arbitrary CSS while preserving default inheritance', () => {
  assert.equal(rules.mvpColor('#aabb00'), '#AABB00'); assert.deepEqual(rules.mvpSelection(true, null), { isMvp: true, color: null }); assert.deepEqual(rules.mvpSelection(false, '#ABCDEF'), { isMvp: false, color: null });
  for (const value of ['red', '#123', '#FFFFFF;background:red', '#GGGGGG', 0, null]) assert.throws(() => rules.mvpColor(value)); assert.throws(() => rules.mvpSelection('true', null));
});
test('only member operators can read and only active admins can mutate or read global settings', async () => {
  for (const [user, operator, status] of [[null, false, 401], [{ role: 'member' }, false, 403]]) {
    const h = harness({ user, operator }); assert.equal((await h.get()).status, status); assert.equal((await h.put(packet())).status, status); assert.equal(h.calls.length, 0);
  }
  const staff = harness({ user: { id: id(3), role: 'staff' } }); assert.equal((await staff.get()).status, 200); assert.equal((await (await staff.get()).json()).canManage, false); assert.equal((await staff.get('?settings=true')).status, 403); assert.equal((await staff.put(packet())).status, 403);
});
test('feature gate, origin, invalid members/body/limits prevent writes', async () => {
  const h = harness(); process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'false'; try { assert.equal((await h.get()).status, 404); assert.equal((await h.put(packet())).status, 404); } finally { process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true'; }
  for (const query of ['', '?members=bad', '?members=' + Array.from({ length: 101 }, (_, n) => id(n)).join(',')]) assert.equal((await h.get(query)).status, 400);
  for (const origin of [null, 'https://evil.test']) assert.equal((await h.put(packet(), origin)).status, 403);
  for (const value of [null, [], packet(2, null, { role: 'admin' }), packet(2, null, { color: 'red' }), packet(2, null, { member: 'bad' }), packet(2, null, { expectedRevision: undefined }), { kind: 'settings', color: '#FF00FF', expectedRevision: null, requestId: id(2), member: id(10) }]) assert.equal((await h.put(value)).status, 400);
  assert.equal((await h.put('x'.repeat(2049), 'https://edu.test', true)).status, 413); assert.equal((await h.put('{', 'https://edu.test', true)).status, 400); assert.equal(h.calls.length, 0);
});
test('member selection, lost-response retry, color change and removal only touch recognition data', async () => {
  const h = harness(); const initial = await (await h.get()).json(); assert.equal(initial.defaultColor, '#FFD700'); assert.equal(initial.members[0].isMvp, false);
  assert.equal((await h.put(packet())).status, 200); assert.equal((await h.put(packet())).status, 200); assert.equal(h.writes.length, 1);
  assert.equal((await h.put(packet(2, null, { color: '#FFFFFF' }))).status, 409);
  assert.equal((await h.put(packet(3, id(2), { color: '#ab0000' }))).status, 200); assert.equal(h.row().border_color, '#AB0000');
  assert.equal((await h.put(packet(4, id(3), { isMvp: false, color: '#AB0000' }))).status, 200); assert.equal(h.row().is_mvp, false); assert.equal(h.row().border_color, null);
  assert.equal((await h.put(packet(5, id(2)))).status, 409); assert.ok(h.writes.every(item => item.table === 'edu_member_mvp'));
  const data = await (await h.get()).json(); assert.deepEqual(Object.keys(data.members[0]).sort(), ['color', 'isMvp', 'member', 'revision']);
});
test('global default changes independently, retries safely and respects concurrent writers', async () => {
  const p = { kind: 'settings', color: '#00aa00', expectedRevision: null, requestId: id(2) }, h = harness();
  assert.equal((await h.put(p)).status, 200); assert.equal((await h.put(p)).status, 200); assert.equal(h.settings().color, '#00AA00'); assert.equal(h.writes.length, 1); assert.equal(h.row(), null);
  const race = harness({ race: { id: true, color: '#FFFFFF', revision: id(9) } }); assert.equal((await race.put(p)).status, 409); assert.equal(race.settings().color, '#FFFFFF'); assert.equal(race.writes.length, 0);
});
test('concurrent member writes, missing members and database errors never silently overwrite or leak', async () => {
  const race = { user_id: id(10), is_mvp: false, border_color: null, revision: id(9) };
  for (const initial of [null, { user_id: id(10), is_mvp: true, border_color: null, revision: id(5) }]) { const h = harness({ initial, race }); assert.equal((await h.put(packet(6, initial?.revision ?? null))).status, 409); assert.deepEqual(h.row(), race); }
  const absent = harness({ absent: true }); assert.equal((await absent.put(packet())).status, 404); assert.equal(absent.writes.length, 0);
  const failure = harness({ failure: true }); for (const r of [await failure.get(), await failure.put(packet())]) { assert.equal(r.status, 503); assert.doesNotMatch(await r.text(), /secret|SQL/); }
});
test('actual SQL enforces service-only access, safe colors, singleton defaults and member cleanup', async () => {
  const db = new PGlite(); try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table profiles(id uuid primary key);'); await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260929010036_member_mvp.sql', import.meta.url), 'utf8')); await db.query('insert into profiles values($1),($2)', [id(1), id(10)]);
    for (const role of ['anon', 'authenticated']) { await db.exec('set role ' + role); for (const table of ['edu_member_mvp', 'edu_mvp_settings']) await assert.rejects(db.query('select * from ' + table), /permission denied/); await assert.rejects(db.query('insert into edu_member_mvp(user_id,revision) values($1,$2)', [id(10), id(2)]), /permission denied/); await db.exec('reset role'); }
    assert.equal((await db.query("select count(*)::int as n from pg_class where relname in ('edu_member_mvp','edu_mvp_settings') and relrowsecurity")).rows[0].n, 2);
    await db.exec('set role service_role'); await db.query('insert into edu_member_mvp(user_id,is_mvp,revision,updated_by) values($1,true,$2,$3)', [id(10), id(2), id(1)]);
    for (const c of ['red', '#aabbcc', '#123456;']) await assert.rejects(db.query('update edu_member_mvp set border_color=$1', [c]), /check constraint/);
    await db.query("update edu_member_mvp set border_color='#FFFFFF'"); await assert.rejects(db.exec('update edu_member_mvp set is_mvp=false'), /check constraint/);
    await db.query("update edu_member_mvp set is_mvp=false,border_color=null,revision=$1 where user_id=$2 and revision=$3", [id(3), id(10), id(2)]); assert.equal((await db.query('update edu_member_mvp set is_mvp=true where user_id=$1 and revision=$2 returning user_id', [id(10), id(2)])).rows.length, 0);
    await db.query("insert into edu_mvp_settings(color,revision) values('#FFD700',$1)", [id(2)]); await assert.rejects(db.query("insert into edu_mvp_settings(color,revision) values('#ABCDEF',$1)", [id(3)]), /unique constraint/); await assert.rejects(db.exec('update edu_mvp_settings set id=false'), /check constraint/);
    await db.exec('reset role'); await db.query('delete from profiles where id=$1', [id(1)]); assert.equal((await db.query('select updated_by from edu_member_mvp')).rows[0].updated_by, null); await db.query('delete from profiles where id=$1', [id(10)]); assert.equal((await db.query('select * from edu_member_mvp')).rows.length, 0);
  } finally { await db.close(); }
});
