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
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name) + '.ts', mocks);
    throw Error('Unexpected dependency ' + name);
  });
  return exports;
}
const email = load('lib/email-auth.ts');
const landing = load('lib/landing.ts');
const id = 'aaaaaaaa-aaaa-4000-8000-000000000001';
test('email signup validates confirmation and never pre-grants consent or roles', () => {
  const values = email.signupValues(' 고객 ', ' user@example.test ', 'abc12345', 'abc12345');
  assert.deepEqual(values.options.data, { full_name: '고객' });
  assert.equal(values.email, 'user@example.test');
  assert.throws(() => email.signupValues('고객', 'bad-email', 'abc12345', 'abc12345'));
  assert.throws(() => email.signupValues('고객', 'a@b.test', '12345678', '12345678'));
  assert.throws(() => email.signupValues('고객', 'a@b.test', 'abc12345', 'different'));
  assert.equal(email.afterEmailLogin({}, '/classes/live'), '/auth/consent?next=%2Fclasses%2Flive');
  assert.equal(email.afterEmailLogin({ terms_version: 'v1', privacy_version: 'v1' }, '//evil.example'), '/my');
  assert.equal(new URL(email.emailCallback('https://dev.example', 'https://evil.example')).searchParams.get('next'), '/my');
  assert.match(email.emailAuthError({ code: 'email_not_confirmed' }), /인증 메일/);
  assert.match(email.emailAuthError({ code: 'email_address_not_authorized' }), /발송하지 못했습니다/);
});
test('email confirmation accepts supported token types and prevents external redirects', async () => {
  let called = 0, error = null;
  const route = load('app/auth/confirm/route.ts', {
    'next/server': { NextResponse: { redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { verifyOtp: async () => { called++; return { error, data: { user: { user_metadata: {} } } }; } } }) },
  });
  const request = query => route.GET(new Request('https://dev.example/auth/confirm?' + query));
  assert.match((await request('token_hash=x&type=invite')).headers.get('location'), /email_confirmation/);
  assert.equal(called, 0);
  const consent = await request('token_hash=x&type=signup&next=https://evil.example');
  assert.equal(consent.headers.get('location'), 'https://dev.example/auth/consent?next=%2Fmy');
  assert.equal(consent.headers.get('Cache-Control'), 'private, no-store');
  assert.match((await request('token_hash=x&type=recovery')).headers.get('location'), /\/auth\/reset-password$/);
  error = { message: 'expired secret token' };
  const expired = await request('token_hash=x&type=email');
  assert.match(expired.headers.get('location'), /email_confirmation/);
  assert.doesNotMatch(expired.headers.get('location'), /secret|token_hash/);
});
test('live publishing requires both permissions, safe assets, and handles concurrent edits', async () => {
  let productAccess = false, rpcError = null;
  const calls = [];
  const chain = { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id }, error: null }) };
  const route = load('app/api/landing/admin/route.ts', {
    '@/lib/operator-permissions': { getOperatorUser: async scope => scope === 'marketing' || productAccess ? { id } : null },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => chain, rpc: async (...args) => { calls.push(args); return { data: {}, error: rpcError }; } }) },
  });
  const config = { ...landing.defaultConfig(id), kakao_url: 'https://open.kakao.com/o/testOnly' };
  const send = body => route.POST(new Request('https://dev.example/api/landing/admin', { method: 'POST', headers: { origin: 'https://dev.example' }, body: JSON.stringify(body) }));
  const body = { action: 'publish_live', config, note: 'test', detail_image_url: 'edu/detail.webp' };
  assert.equal((await send(body)).status, 403);
  assert.equal(calls.length, 0);
  productAccess = true;
  assert.equal((await send({ ...body, detail_image_url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await send({ ...body, config: { ...config, kakao_url: '' } })).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await send(body)).status, 200);
  assert.equal(calls[0][0], 'edu_publish_live_asset');
  assert.equal(calls[0][1].p_detail_image, 'edu/detail.webp');
  assert.equal(calls[0][1].p_content, undefined);
  assert.equal((await send({ ...body, action: 'publish' })).status, 200);
  assert.equal(calls[1][1].p_detail_image, null);
  rpcError = { message: 'STALE_REVISION' };
  assert.equal((await send(body)).status, 409);
});
test('upload preview uses the public asset bucket and rejects script and traversal URLs', () => {
  const { imagePreviewUrl } = load('lib/qa-rules.ts');
  assert.equal(imagePreviewUrl('edu/long.webp', 'https://db.example'), 'https://db.example/storage/v1/object/public/course-assets/edu/long.webp');
  assert.equal(imagePreviewUrl('/images/local.png', 'https://db.example'), '/images/local.png');
  assert.equal(imagePreviewUrl('javascript:alert(1)', 'https://db.example'), '');
  assert.equal(imagePreviewUrl('edu/../secret.webp', 'https://db.example'), '');
});
