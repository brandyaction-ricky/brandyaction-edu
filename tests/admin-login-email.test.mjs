import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (mocks[name]) return mocks[name];
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts', mocks);
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    throw Error('Unmocked dependency: ' + name);
  });
  return exports;
}
const helpers = load('lib/admin-login-email.ts');
const member = 'aaaaaaaa-aaaa-4000-8000-000000000001';
const valid = { email: 'new@example.test', confirmEmail: 'new@example.test', reason: '회원 요청', confirmed: true };
function database(options = {}) {
  const calls = [], writes = [], generated = [];
  const db = {
    from(table) {
      const query = { select() { return this; }, eq(...v) { calls.push([table, ...v]); return this; }, gte() { return this; }, limit() { return this; },
        insert(value) { this.operation = 'insert'; writes.push(value); return this; }, update(value) { this.operation = 'update'; writes.push(value); return this; },
        async maybeSingle() { return { data: table === 'profiles' ? { id: member, status: 'active', role: options.role || 'student' } : options.audit, error: null }; },
        async single() { return { data: { id: 12 }, error: options.auditFailure ? { message: 'private SQL' } : null }; },
        then(resolve) { return Promise.resolve({ data: options.recent ? [{ id: 11 }] : [], error: null }).then(resolve); },
      }; return query;
    },
    auth: { admin: { async getUserById() { return { data: { user: { id: member, email: 'old@example.test' } }, error: null }; }, async generateLink(value) { generated.push(value); return { data: { user: { id: options.otherUser ? 'other-member' : member }, properties: { hashed_token: 'synthetic-only-token' } }, error: options.duplicate ? { code: 'email_exists' } : null }; } } },
  };
  return { db, calls, writes, generated };
}
test('admin email validation requires matching addresses, reason and explicit confirmation', () => {
  assert.deepEqual(helpers.validateAdminEmailChange({ ...valid, email: ' New@Example.test ' }), { email: valid.email, reason: valid.reason });
  for (const edit of [{ email: 'invalid' }, { confirmEmail: 'other@example.test' }, { reason: '' }, { reason: 'x'.repeat(501) }, { confirmed: false }]) assert.throws(() => helpers.validateAdminEmailChange({ ...valid, ...edit }));
  assert.throws(() => helpers.adminEmailOrigin(new Request('https://brandyaction-edu.com/api/admin/member-login-email', { headers: { origin: 'https://evil.example' } })), error => error.status === 403);
});
test('anonymous, student and staff cannot read or request another member email change', async () => {
  for (const [user, status] of [[null, 401], [{ id: 'actor', role: 'student' }, 403], [{ id: 'actor', role: 'staff' }, 403]]) {
    const route = load('app/api/admin/member-login-email/route.ts', { '@/lib/server-auth': { getAuthenticatedUser: async () => user }, '@/lib/supabase/admin': { createAdminClient() { throw Error('Database must not open'); } } });
    for (const method of ['GET', 'POST']) assert.equal((await route[method](new Request('https://brandyaction-edu.com/api/admin/member-login-email', { method }))).status, status);
  }
});
test('confirmation goes only to the new address, keeps the original account and audits the intent', async () => {
  process.env.RESEND_API_KEY = 'synthetic'; process.env.CRM_EMAIL_FROM = 'test@example.test';
  const h = database(), deliveries = [];
  const result = await helpers.requestAdminEmailChange(h.db, 'actor', member, valid, 'https://brandyaction-edu-dev.vercel.app', async (...v) => deliveries.push(v));
  assert.equal(result.currentEmail, 'old@example.test');
  assert.deepEqual(h.generated, [{ type: 'email_change_new', email: 'old@example.test', newEmail: valid.email }]);
  assert.equal(deliveries.length, 1); assert.equal(deliveries[0][0], valid.email);
  const link = new URL(deliveries[0][1]); assert.equal(link.pathname, '/auth/confirm'); assert.equal(link.searchParams.get('flow'), 'admin_email_change');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-only-token/);
  assert.equal(h.writes[0].actor_user_id, 'actor'); assert.equal(h.writes[0].before_data.email, 'old@example.test');
  assert.equal(h.writes.at(-1).after_data.status, 'waiting');
  assert.doesNotMatch(JSON.stringify(h.writes), /synthetic-only-token|password/);
});
test('duplicate addresses and mail failures are audited without changing or exposing passwords', async () => {
  for (const [options, send, expected] of [[{ duplicate: true }, async () => { throw Error('Must not send'); }, /이미/], [{}, async () => { throw Error('provider secret'); }, /완료하지 못/], [{ otherUser: true }, async () => { throw Error('Must not send'); }, /완료하지 못/]]) {
    const h = database(options);
    await assert.rejects(helpers.requestAdminEmailChange(h.db, 'actor', member, valid, 'https://brandyaction-edu-dev.vercel.app', send), expected);
    assert.equal(h.writes.at(-1).after_data.status, 'failed');
    assert.doesNotMatch(JSON.stringify(h.writes), /provider secret|password|synthetic-only-token/);
  }
});
test('recent requests, operator targets and audit storage failures stop before token generation', async () => {
  for (const options of [{ recent: true }, { role: 'admin' }, { role: 'staff' }, { auditFailure: true }]) {
    const h = database(options);
    await assert.rejects(helpers.requestAdminEmailChange(h.db, 'actor', member, valid, 'https://brandyaction-edu-dev.vercel.app'));
    assert.equal(h.generated.length, 0);
  }
});
test('completion audit requires the verified user and new email with no outstanding change', async () => {
  const h = database({ audit: { entity_id: member, after_data: { new_email: valid.email, reason: '회원 요청', status: 'waiting' } } });
  for (const user of [{ id: 'other', email: valid.email }, { id: member, email: 'old@example.test' }, { id: member, email: valid.email, new_email: valid.email }]) assert.equal(await helpers.completeAdminEmailChange(h.db, '12', user), false);
  assert.equal(h.writes.length, 0);
  assert.equal(await helpers.completeAdminEmailChange(h.db, '12', { id: member, email: valid.email }), true);
  assert.equal(h.writes[0].after_data.status, 'completed');
});
test('verified admin email link records completion and goes straight to member password setup', async () => {
  let completed = 0, verified = 0;
  const route = load('app/auth/confirm/route.ts', {
    'next/server': { NextResponse: { redirect(url) { const response = new Response(null, { status: 307, headers: { location: String(url) } }); response.cookies = { set(name, value) { response.headers.append('set-cookie', `${name}=${value}`); } }; return response; } } },
    '@/lib/supabase/server': { createClient: async cookies => ({ auth: { async verifyOtp(input) { verified++; assert.equal(input.type, 'email_change'); cookies([{ name: 'qa-session', value: 'qa-only' }]); return { error: null, data: { user: { id: member, email: valid.email }, session: {} } }; } } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({}) },
    '@/lib/admin-login-email': { async completeAdminEmailChange(db, id, user) { completed++; assert.equal(id, '12'); assert.equal(user.id, member); return true; } },
  });
  const response = await route.GET(new Request('https://brandyaction-edu-dev.vercel.app/auth/confirm?token_hash=qa-only&type=email_change&flow=admin_email_change&change=12'));
  assert.equal(verified, 1); assert.equal(completed, 1);
  assert.equal(response.headers.get('location'), 'https://brandyaction-edu-dev.vercel.app/auth/reset-password?flow=admin_email_change');
  assert.equal(response.headers.get('set-cookie'), 'qa-session=qa-only');
  assert.doesNotMatch(response.headers.get('location'), /token_hash|qa-only/);
});
test('failed verification cannot complete an administrator change or create a member session', async () => {
  const route = load('app/auth/confirm/route.ts', {
    'next/server': { NextResponse: { redirect(url) { const response = new Response(null, { status: 307, headers: { location: String(url) } }); response.cookies = { set() { throw Error('Must not set a session'); } }; return response; } } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { verifyOtp: async () => ({ error: { code: 'otp_expired' }, data: {} }) } }) },
    '@/lib/supabase/admin': { createAdminClient() { throw Error('Must not open the admin database'); } },
  });
  const response = await route.GET(new Request('https://brandyaction-edu-dev.vercel.app/auth/confirm?token_hash=expired&type=email_change&flow=admin_email_change&change=12'));
  assert.equal(response.headers.get('location'), 'https://brandyaction-edu-dev.vercel.app/auth/email-change-help');
});
