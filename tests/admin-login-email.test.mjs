import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (mocks[name]) return mocks[name];
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts', mocks);
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    throw Error('Unmocked dependency: ' + name);
  });
  return exports;
}
const helpers = load('lib/admin-login-email.ts');
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dev-auth.example.test';
const newAddressToken = 'a'.repeat(64);
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
    auth: { admin: { async getUserById() { return { data: { user: { id: member, email: 'old@example.test' } }, error: null }; }, async generateLink(value) { generated.push(value); return { data: { user: { id: options.otherUser ? 'other-member' : member }, properties: { hashed_token: 'synthetic-current-address-token', action_link: options.actionLink || `https://dev-auth.example.test/auth/v1/verify?type=email_change&token=${newAddressToken}` } }, error: options.duplicate ? { code: 'email_exists' } : null }; } } },
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
  assert.equal(link.searchParams.get('token_hash'), newAddressToken);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-only-token/);
  assert.equal(h.writes[0].actor_user_id, 'actor'); assert.equal(h.writes[0].before_data.email, 'old@example.test');
  assert.equal(h.writes.at(-1).after_data.status, 'waiting');
  assert.doesNotMatch(JSON.stringify(h.writes), /synthetic-only-token|password/);
});
test('new email verification rejects action links outside the configured Auth server', async () => {
  for (const actionLink of [`https://evil.example/auth/v1/verify?type=email_change&token=${newAddressToken}`, `http://dev-auth.example.test/auth/v1/verify?type=email_change&token=${newAddressToken}`, `https://dev-auth.example.test/other?type=email_change&token=${newAddressToken}`, `https://dev-auth.example.test/auth/v1/verify?type=recovery&token=${newAddressToken}`, 'invalid']) {
    const h = database({ actionLink }); let sent = false;
    await assert.rejects(helpers.requestAdminEmailChange(h.db, 'actor', member, valid, 'https://brandyaction-edu-dev.vercel.app', async () => { sent = true; }));
    assert.equal(sent, false); assert.equal(h.writes.at(-1).after_data.status, 'failed');
  }
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
  assert.equal(response.headers.get('location'), 'https://brandyaction-edu-dev.vercel.app/auth/email-change-help?flow=admin_email_change&status=expired');
  assert.doesNotMatch(response.headers.get('location'), /token_hash|change=12/);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
});
test('administrator mail explains the one-hour confirmation deadline and later normal login', async () => {
  let delivery;
  await helpers.sendAdminEmailChange(valid.email, 'https://example.test/confirm', '12', async (_url, options) => {
    delivery = JSON.parse(options.body);
    return Response.json({ id: 'synthetic-delivery' });
  });
  assert.deepEqual(delivery.to, [valid.email]);
  assert.match(delivery.text, /1시간 안에/);
  assert.match(delivery.text, /관리자에게 새 확인 메일을 요청/);
  assert.match(delivery.text, /나중에도 새 이메일과 브랜디에듀 비밀번호로 로그인/);
});
test('invalid administrator links retain the resend guidance without trusting identifiers or setting a session', async () => {
  const route = load('app/auth/confirm/route.ts', {
    'next/server': { NextResponse: { redirect(url) { const response = new Response(null, { status: 307, headers: { location: String(url) } }); response.cookies = { set() { throw Error('Must not set a session'); } }; return response; } } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { verifyOtp: async () => { throw Error('private-provider-error'); } } }) },
    '@/lib/supabase/admin': { createAdminClient() { throw Error('Must not open the admin database'); } },
  });
  for (const query of ['token_hash=invalid&type=email_change&flow=admin_email_change&change=999', 'type=email_change&flow=admin_email_change']) {
    const response = await route.GET(new Request('https://brandyaction-edu-dev.vercel.app/auth/confirm?' + query));
    assert.equal(response.headers.get('location'), 'https://brandyaction-edu-dev.vercel.app/auth/email-change-help?flow=admin_email_change');
    assert.equal(response.headers.get('set-cookie'), null);
  }
});
test('expired admin help is available without login and reuses support settings, while self-service stays in profile', async () => {
  let settingsReads = 0;
  const page = load('app/auth/email-change-help/page.tsx', {
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: ({ children, ...props }) => jsxRuntime.jsx('a', { ...props, children }) },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) },
    '@/lib/edu-settings': { getEduSettings: async () => { settingsReads++; return { operations: { supportUrl: 'https://support.example.test/chat' } }; } },
  }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ status: 'expired', flow: 'admin_email_change' }) }));
  assert.match(html, /1시간이 지났거나 이미 확인/);
  assert.match(html, /href="https:\/\/support.example.test\/chat"[^>]*>확인 메일 다시 요청하기/);
  assert.match(html, /새 계정을 만들 필요는 없어요/);
  assert.match(html, /이미 변경했다면 로그인하기/);
  const self = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ status: 'expired' }) }));
  assert.match(self, /새 확인 메일 받으러 가기/);
  assert.doesNotMatch(self, /support.example.test/);
  assert.equal(settingsReads, 1);
});
