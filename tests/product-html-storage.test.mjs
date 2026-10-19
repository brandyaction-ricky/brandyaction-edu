import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const actor = '11111111-1111-4111-8111-111111111111';
const filePath = `edu/product-html/${actor}/22222222-2222-4222-8222-222222222222.txt`;
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts', mocks);
    if (name.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) + '.ts', mocks);
    return require(name);
  });
  return exports;
}
const document = load('lib/product-html-document.ts');
const storage = load('lib/product-html-storage.ts');
const metadata = load('lib/product-metadata.ts');
function harness({ source = '<h1>서버 저장 상세</h1>', user = { id: actor }, products = true, content = false, published = false, size, mime = 'text/plain', missing = false } = {}) {
  const bytes = new Blob([source]), calls = [];
  const bucket = {
    info: async () => ({ data: missing ? null : { size: size ?? bytes.size, contentType: mime }, error: missing ? {} : null }),
    download: async () => ({ data: bytes }),
    createSignedUploadUrl: async (path, options) => { calls.push({ action: 'upload', path, options }); return { data: { token: 'synthetic' } }; },
    createSignedUrl: async (path, expiry, options) => { calls.push({ action: 'read', path, expiry, options }); return { data: { signedUrl: 'https://synthetic.storage/detail.txt' } }; },
  };
  const db = { storage: { from: name => { assert.equal(name, 'course-resources'); return bucket; } }, from: () => ({ select() { return this; }, contains(key, value) { calls.push({ key, value }); return this; }, eq(key, value) { calls.push({ key, value }); return this; }, is(key, value) { calls.push({ key, value }); return this; }, limit() { return this; }, maybeSingle: async () => ({ data: published ? { id: actor, status: 'published' } : null }) }) };
  const mocks = { '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/server-auth': { getAuthenticatedUser: async () => user }, '@/lib/operator-permissions': { permissionsFor: async () => ({ products, content }) } };
  const upload = load('app/api/platform/upload/route.ts', mocks);
  const read = load('app/api/platform/product-html/route.ts', mocks);
  return { db, calls, upload: (body, origin = 'https://edu.test') => upload.POST(new Request('https://edu.test/api/platform/upload', { method: 'POST', headers: { origin }, body: JSON.stringify(body) })), read: (path = filePath) => read.GET(new Request('https://edu.test/api/platform/product-html?file=' + encodeURIComponent(path))) };
}

test('HTML upload grants require product permission, a safe filename, bounded bytes, and immutable private paths', async () => {
  const body = { kind: 'product-html', name: '한글 상세.html', size: 10 * 1024 * 1024 };
  const h = harness();
  const result = await h.upload({ ...body, path: '../forged.html', bucket: 'course-assets' });
  assert.equal(result.status, 200);
  const grant = await result.json();
  assert.match(grant.path, new RegExp(`^edu/product-html/${actor}/[a-f0-9-]{36}\\.txt$`));
  assert.equal(grant.contentType, 'text/plain'); assert.equal(grant.bucket, 'course-resources');
  assert.deepEqual(h.calls[0].options, { upsert: false });
  for (const values of [{ name: 'bad.svg' }, { name: '../test.html' }, { size: 0 }, { size: 20 * 1024 * 1024 + 1 }]) assert.equal((await h.upload({ ...body, ...values })).status, 400);
  assert.equal((await h.upload(body, 'https://evil.test')).status, 403);
  assert.equal((await harness({ user: null }).upload(body)).status, 403);
  assert.equal((await harness({ products: false, content: true }).upload(body)).status, 403);
});

test('saved file bytes are checked server-side and course metadata stays small with the paid/free guard intact', async () => {
  const h = harness({ source: '<h1>무료 라이브 강의</h1><a href="https://open.kakao.com/test">참여</a><img src="data:image/png;base64,' + 'a'.repeat(4_000_000) + '">' });
  const values = { detail_html_file: filePath, detail_html_document: '', detail_html: 'forged fallback' };
  await storage.prepareStoredProductMetadata(h.db, actor, {}, values);
  const saved = metadata.mergeProductMetadata({}, values);
  assert.equal(saved.detail_html_file, filePath); assert.equal(saved.detail_html_document, '');
  assert.ok(saved.detail_html.length < 1000); assert.match(saved.detail_html, /open.kakao.com/);
  assert.equal(document.productDocument(saved), `edu-html:${filePath}`);
  assert.equal(document.productDocument({ detail_html_document: '<h1>기존 원본</h1>' }), '<h1>기존 원본</h1>');
  const next = { detail_html_file: filePath, detail_html_document: '', detail_html: 'forged' };
  await storage.prepareStoredProductMetadata(h.db, actor, saved, next);
  assert.equal(next.detail_html, saved.detail_html);
  assert.equal(metadata.mergeProductMetadata(saved, { detail_html_file: '', detail_html_document: '' }).detail_html_file, '');
});

test('forged, missing, oversized, binary and conflicting files cannot become saved detail content', async () => {
  for (const config of [{ missing: true }, { size: 21 * 1024 * 1024 }, { mime: 'text/html' }, { size: 999 }, { source: '<script>bad()</script>' }]) {
    const h = harness(config);
    await assert.rejects(storage.prepareStoredProductMetadata(h.db, actor, {}, { detail_html_file: filePath }));
  }
  const h = harness();
  await assert.rejects(storage.prepareStoredProductMetadata(h.db, actor, {}, { detail_html_file: filePath.replace(actor, '33333333-3333-4333-8333-333333333333') }), /계정/);
  await assert.rejects(storage.prepareStoredProductMetadata(h.db, actor, {}, { detail_html_file: filePath, detail_html_document: '<h1>ambiguous</h1>' }), /하나만/);
  for (const value of ['../private.txt', 'https://evil.test', filePath + '/x']) assert.throws(() => metadata.mergeProductMetadata({}, { detail_html_file: value }));
  assert.throws(() => document.validateStoredProductDocument('한'.repeat(7_000_000)), /20MB/);
  assert.match(document.buildProductDocument('<h1>안전 렌더링</h1>' + 'x'.repeat(3_100_000)), /script-src 'none'/);
});

test('only a live published course or product operator can obtain a short-lived file read URL', async () => {
  const publicFile = harness({ user: null, published: true });
  assert.equal((await publicFile.read()).status, 200);
  assert.ok(publicFile.calls.some(call => call.key === 'status' && call.value === 'published'));
  assert.ok(publicFile.calls.some(call => call.key === 'archived_at' && call.value === null));
  const signed = publicFile.calls.find(call => call.action === 'read');
  assert.equal(signed.expiry, 60); assert.equal(signed.options.download, 'detail.txt');
  const draft = harness({ user: null }); assert.equal((await draft.read()).status, 404); assert.equal(draft.calls.some(call => call.action === 'read'), false);
  assert.equal((await harness({ products: false, content: true }).read()).status, 404);
  const editor = harness(); const response = await editor.read(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await editor.read('../private.txt')).status, 400);
  assert.equal((await harness({ published: true, size: 21 * 1024 * 1024 }).read()).status, 409);
});

test('the real Storage SDK receives a text/plain Blob even when the selected file is text/html', async () => {
  const { createClient } = require('@supabase/supabase-js');
  let transferred = false;
  const client = createClient('https://synthetic.supabase.co', 'synthetic-anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, options) => {
      assert.match(String(url), /storage\/v1\/object\/upload\/sign\/course-resources\//);
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get('').type, 'text/plain');
      assert.equal(await options.body.get('').text(), '<h1>UTF-8 HTML</h1>');
      transferred = true;
      return Response.json({ Key: `course-resources/${filePath}`, Id: actor });
    } },
  });
  const field = load('app/ui/editor-fields.tsx', { '@/lib/supabase/client': { createClient: () => client } });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ bucket: 'course-resources', path: filePath, token: 'synthetic', contentType: 'text/plain', value: filePath });
  try {
    await field.uploadPlatformFile(new File(['<h1>UTF-8 HTML</h1>'], 'detail.html', { type: 'text/html' }), 'product-html');
    assert.equal(transferred, true);
  } finally { globalThis.fetch = previousFetch; }
});
