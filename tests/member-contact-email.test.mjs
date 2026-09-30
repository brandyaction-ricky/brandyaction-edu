import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, imports = {}) {
  const source = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', output)(exports, name => imports[name] || {});
  return exports;
}
const member = { id: '11111111-1111-4111-8111-111111111111', role: 'student', email: 'login@example.test' };
function setup({ user = member, permitted = false, error = null } = {}) {
  const writes = [], filters = [];
  const query = { select() { return this; }, update(values) { writes.push(values); return this; }, eq(key, value) { filters.push([key, value]); return this; }, async single() { return { data: { id: member.id, role: 'student', status: 'active' }, error }; } };
  const db = { from(table) { assert.equal(table, 'profiles'); return query; } };
  const { POST } = load('app/api/platform/route.ts', {
    '@/lib/server-auth': { getAuthenticatedUser: async () => user },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/platform': load('lib/platform.ts'),
    '@/lib/qa-rules': load('lib/qa-rules.ts'),
    '@/lib/crm-purchase-contact': load('lib/crm-purchase-contact.ts'),
    '@/lib/operator-permissions': { permissionsFor: async () => ({ members: permitted }), sectionScopes: { customers: 'members' } },
    'next/cache': { revalidateTag() {} },
  });
  return { writes, filters, send: body => POST(new Request('https://edu.example/api/platform', { method: 'POST', headers: { origin: 'https://edu.example', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })) };
}
const profile = { action: 'profile', name: '합성 회원', phone: '01000000000' };
test('member update changes only own delivery preference, never login identity or privileges', async () => {
  const s = setup();
  const response = await s.send({ ...profile, id: 'someone-else', user_id: 'someone-else', email: 'attacker@example.test', role: 'admin', contact_email: '  Notice@Example.test ' });
  assert.equal(response.status, 200);
  assert.deepEqual(s.writes, [{ full_name: '합성 회원', phone: '01000000000', contact_email: 'notice@example.test' }]);
  assert.deepEqual(s.filters, [['id', member.id]]);
});
test('old member clients preserve the preference; explicit empty value clears it', async () => {
  const s = setup();
  assert.equal((await s.send(profile)).status, 200);
  assert.equal('contact_email' in s.writes[0], false);
  assert.equal((await s.send({ ...profile, contact_email: '' })).status, 200);
  assert.equal(s.writes[1].contact_email, null);
});
test('invalid preference is rejected before writes and unauthenticated requests cannot save', async () => {
  const s = setup();
  for (const value of ['invalid', {}, 123]) assert.equal((await s.send({ ...profile, contact_email: value })).status, 400);
  assert.deepEqual(s.writes, []);
  assert.equal((await setup({ user: null }).send(profile)).status, 401);
});
test('operator member permission is required and login email stays outside the whitelist', async () => {
  const body = { action: 'save', section: 'customers', id: member.id, values: { contact_email: 'Notice@example.test', email: 'changed-login@example.test' } };
  const denied = setup();
  assert.equal((await denied.send(body)).status, 403);
  assert.deepEqual(denied.writes, []);
  const allowed = setup({ user: { ...member, role: 'staff' }, permitted: true });
  assert.equal((await allowed.send(body)).status, 200);
  assert.deepEqual(allowed.writes, [{ contact_email: 'notice@example.test' }]);
  assert.equal((await allowed.send({ ...body, values: { contact_email: 'invalid' } })).status, 400);
});
test('database failure cannot report a successful contact update', async () => {
  const result = await setup({ error: { message: 'synthetic failure' } }).send({ ...profile, contact_email: 'notice@example.test' });
  assert.notEqual(result.status, 200);
});
