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
  const exports = {};
  const absolute = path.resolve(root, file);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/lib/')) return load(name.slice(2) + '.ts', mocks);
    if (name.startsWith('./')) return new Proxy({}, { get: () => () => null });
    return require(name);
  });
  return exports;
}

function renderClass({ loading = true, error = '', data = {} } = {}) {
  let state = 0;
  const { Platform } = load('app/ui/platform.tsx', {
    react: { ...React, useState(initial) {
      const index = state++;
      return React.useState(index === 1 ? data : index === 3 ? loading : index === 4 ? error : index === 16 && Object.keys(data).length ? JSON.stringify(['classes/test-class?', 'view=class&slug=test-class']) : initial);
    } },
    '@/lib/supabase/client': {},
    '@/lib/supabase/config': {},
    '@/features/admin-ui': load('features/admin-ui/components/use-route-dialog.ts'),
    'next/navigation': { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    './final/primitives': {
      Empty: ({ title }) => React.createElement('h2', null, title), Brand: () => null,
      courseType: () => '무료 클래스',
    },
    './final/public-views': { ProductDetail: () => React.createElement('article', null, '클래스 본문') },
  });
  return renderToStaticMarkup(React.createElement(Platform, { path: ['classes', 'test-class'], user: null }));
}

test('class entry renders a waiting indicator, not the missing-page home action', () => {
  const html = renderClass();
  assert.match(html, /class="page-loading"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-busy="true"/);
  assert.match(html, /class="page-loading-spinner" aria-hidden="true"/);
  assert.match(html, /곧 열립니다/);
  assert.doesNotMatch(html, /홈으로|페이지를 찾을 수 없습니다/);
});

test('a completed empty response still offers the genuine missing-page action', () => {
  const html = renderClass({ loading: false });
  assert.match(html, /페이지를 찾을 수 없습니다/);
  assert.match(html, /href="\/">홈으로/);
  assert.doesNotMatch(html, /page-loading-spinner|곧 열립니다/);
});

test('a failed request offers retry without misreporting the class as missing', () => {
  const html = renderClass({ loading: false, error: '일시적인 연결 오류' });
  assert.match(html, /role="alert"/);
  assert.match(html, /다시 시도/);
  assert.match(html, /페이지를 불러오지 못했습니다/);
  assert.doesNotMatch(html, /page-loading-spinner|페이지를 찾을 수 없습니다|홈으로/);
});

test('an available class retains its normal content', () => {
  const html = renderClass({ loading: false, data: { courses: [{ id: 'course', slug: 'test-class', category: 'free' }] } });
  assert.match(html, /클래스 본문/);
  assert.doesNotMatch(html, /page-loading-spinner|곧 열립니다|페이지를 찾을 수 없습니다/);
});
