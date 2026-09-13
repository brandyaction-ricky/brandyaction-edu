import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function load(file, mocks = {}) {
  const absolute = path.resolve(root, file), exports = {};
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.resolve(root, name.slice(2)) : path.resolve(path.dirname(absolute), name);
      return load(['.ts', '.tsx'].map(extension => base + extension).find(fs.existsSync), mocks);
    }
    return require(name);
  });
  return exports;
}
const { sanitizeProductHtml, mergeProductMetadata, mergeProductResources, productResources } = load('lib/product-metadata.ts');
const { ProductDetailHtml } = load('app/ui/final/product-detail-html.tsx');
test('product HTML retains content structure while rejecting executable content and attributes', () => {
  const dirty = '<!doctype html><html><head><style>body{display:none}</style></head><body><h2 onclick="evil()">AI &amp; 실행</h2><p style="color:red">소개 <strong>강조</strong></p><script>alert(1)</script><iframe src="https://evil.test"></iframe><svg><a href="javascript:evil()">x</a></svg><img src="https://cdn.example/image.webp" onerror="evil()" alt="이미지"><a href="java&#x73;cript:evil()">금지 링크</a><a href="https://example.test/class">안전 링크</a></body></html>';
  const clean = sanitizeProductHtml(dirty);
  assert.match(clean, /<h2>AI &amp; 실행<\/h2>/);
  assert.match(clean, /<strong>강조<\/strong>/);
  assert.match(clean, /src="https:\/\/cdn.example\/image.webp"/);
  assert.doesNotMatch(clean, /script|iframe|svg|style|onclick|onerror|alert\(1\)|display:none/);
  assert.equal(sanitizeProductHtml(clean), clean);
  const rendered = renderToStaticMarkup(React.createElement(ProductDetailHtml, { html: dirty }));
  assert.match(rendered, /rel="noopener noreferrer"/);
  assert.doesNotMatch(rendered, /javascript:|onerror|onclick|<script|<iframe/);
});
test('malformed and encoded product HTML cannot create browser-controlled properties', () => {
  for (const dirty of [
    '<img src="data:image/svg+xml,<svg onload=evil()>">',
    '<a href="java&#9;script:evil()">link</a>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=evil()>">',
    '<p><script src=x />&lt;img src=x onerror=evil()&gt;</p>',
    '<img src="https://example.test/a?q=>" style="position:fixed" onerror="evil()">',
  ]) {
    const rendered = renderToStaticMarkup(React.createElement(ProductDetailHtml, { html: dirty }));
    assert.doesNotMatch(rendered, /<(?:script|svg|math|iframe|style)\b|\s(?:style|onerror|onclick|srcdoc)="|href="javascript:/i);
  }
  assert.equal(sanitizeProductHtml('a'.repeat(200001)).length, 200001);
  assert.throws(() => sanitizeProductHtml('a'.repeat(3000001)), /너무 큽니다/);
});
test('partial product updates preserve existing metadata and validate price and SEO boundaries', () => {
  const previous = { thumbnail_url: 'existing.webp', campaign: { enabled: true }, seo_title: '검색 제목' };
  const merged = mergeProductMetadata(previous, { detail_html: '<h2>내용</h2><script>x</script>', regular_price: 100000, arbitrary: 'ignored' });
  assert.deepEqual(merged, { ...previous, detail_html: '<h2>내용</h2>', regular_price: 100000 });
  assert.equal(previous.detail_html, undefined);
  assert.throws(() => mergeProductMetadata(previous, { regular_price: -1 }), /정가/);
  assert.throws(() => mergeProductMetadata(previous, { seo_title: 'a'.repeat(201) }), /200자/);
  assert.deepEqual(mergeProductMetadata(previous, { seo_title: '' }), { ...previous, seo_title: '' });
});
test('detail image gallery keeps legacy images, validates entries and preserves display order', () => {
  const { productDetailImages } = load('lib/product-metadata.ts');
  assert.deepEqual(productDetailImages({ detail_image_url: 'edu/legacy.webp' }), [{ path: 'edu/legacy.webp', name: '기존 상세 이미지', alt: '' }]);
  const detail_images = [
    { path: 'edu/first.webp', name: '첫 장.webp', alt: '첫 장' },
    { path: 'https://cdn.example/second.jpg', name: '둘째 장.jpg', alt: '' },
  ];
  const merged = mergeProductMetadata({ detail_image_url: 'edu/legacy.webp' }, { detail_images });
  assert.deepEqual(merged.detail_images, detail_images);
  assert.equal(merged.detail_image_url, 'edu/first.webp');
  assert.deepEqual(productDetailImages(merged), detail_images);
  assert.throws(() => mergeProductMetadata({}, { detail_images: [{ path: 'javascript:alert(1)' }] }), /주소/);
  assert.throws(() => mergeProductMetadata({}, { detail_images: Array.from({ length: 31 }, () => ({ path: 'edu/a.webp' })) }), /30장/);
});
test('product resources preserve private storage paths and validate per-file access', () => {
  const resource = { id: '11111111-1111-4111-8111-111111111111', name: '무료 워크북.pdf', path: 'edu/11111111-1111-4111-8111-111111111111.pdf', scope: 'public' };
  const merged = mergeProductResources({ campaign: true }, [resource]);
  assert.deepEqual(productResources(merged), [resource]);
  assert.equal(merged.campaign, true);
  assert.throws(() => mergeProductResources({}, [{ ...resource, path: '../private.pdf' }]), /정보/);
  assert.throws(() => mergeProductResources({}, [{ ...resource, scope: 'admin' }]), /정보/);
});

test('product save API persists approved editor metadata and stops if existing metadata cannot be loaded', async () => {
  const previous = { metadata: { campaign: { enabled: true }, thumbnail_url: 'existing.webp' } };
  const writes = [];
  let readError = null;
  const db = { from(table) {
    assert.equal(table, 'courses');
    let isUpdate = false;
    return { select() { return this; }, eq() { return this; }, update(values) { isUpdate = true; writes.push(values); return this; }, async single() { return isUpdate ? { data: { id: 'product' }, error: null } : { data: previous, error: readError }; } };
  } };
  const route = load('app/api/platform/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/server': {},
    '@/lib/server-auth': { getAuthenticatedUser: async () => ({ id: 'operator' }) },
    '@/lib/operator-permissions': { permissionsFor: async () => ({ products: true }), sectionScopes: { products: 'products' } },
    '@/lib/edu-settings': {}, '@/lib/crm-delivery': {},
  });
  const send = values => route.POST(new Request('https://edu.example/api/platform', { method: 'POST', headers: { origin: 'https://edu.example' }, body: JSON.stringify({ action: 'save', section: 'products', id: 'product', values }) }));
  assert.equal((await send({ title: '새 상품명', detail_html: '<h2>본문</h2><script>evil()</script>', seo_title: '검색 제목', metadata: { campaign: null } })).status, 200);
  assert.equal(writes[0].title, '새 상품명');
  assert.equal(writes[0].detail_html, undefined);
  assert.deepEqual(writes[0].metadata, { ...previous.metadata, detail_html: '<h2>본문</h2>', seo_title: '검색 제목' });
  readError = { code: 'temporary' };
  assert.equal((await send({ seo_title: '덮어쓰기' })).status, 409);
  assert.equal(writes.length, 1);
});

test('published product metadata drives search and sharing titles while an empty override falls back', async () => {
  let product = { title: '상품 이름', summary: '상품 소개', metadata: { seo_title: '검색용 제목', seo_description: '검색용 설명' } };
  const filters = [];
  const query = { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, async maybeSingle() { return { data: product }; } };
  const page = load('app/[[...path]]/page.tsx', {
    '@/lib/edu-settings': { getEduSettings: async () => ({ seo: {} }) },
    '@/lib/supabase/server': { createClient: async () => ({ from: () => query }) },
    '@/app/ui/platform': {}, '@/lib/server-auth': {}, 'next/navigation': {},
  });
  const params = Promise.resolve({ path: ['classes', 'my-class'] });
  let metadata = await page.generateMetadata({ params });
  assert.equal(metadata.title, '검색용 제목 | BrandyAction EDU');
  assert.equal(metadata.description, '검색용 설명');
  assert.equal(metadata.openGraph.title, metadata.title);
  assert.ok(filters.some(([key, value]) => key === 'status' && value === 'published'));
  product = { ...product, metadata: { seo_title: '', seo_description: '' } };
  metadata = await page.generateMetadata({ params });
  assert.equal(metadata.title, '상품 이름 | BrandyAction EDU');
  assert.equal(metadata.description, '상품 소개');
});
