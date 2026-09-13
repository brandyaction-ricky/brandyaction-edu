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
const cache = new Map();

function load(file) {
  const absolute = path.isAbsolute(file) ? file : path.join(root, file);
  if (cache.has(absolute)) return cache.get(absolute);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  cache.set(absolute, exports);
  new Function('exports', 'require', compiled)(exports, name => {
    if (name === 'next/link') return function LinkStub(props) { return React.createElement('a', props); };
    if (name === 'next/image') return function ImageStub(props) {
      const imageProps = { ...props };
      delete imageProps.fill;
      delete imageProps.unoptimized;
      return React.createElement('img', imageProps);
    };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const target = ['', '.ts', '.tsx'].map(extension => base + extension).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!target) throw Error('Cannot resolve ' + name);
      return load(target);
    }
    return require(name);
  });
  return exports;
}

const { HomeHero, homeHeroSlides } = load('app/ui/final/home-hero.tsx');
const { sections } = load('lib/platform.ts');
const freeCourse = {
  id: 'course',
  slug: 'free-class',
  title: '실제 무료 클래스',
  summary: '저장된 무료 클래스 소개',
  category: 'free',
};
const banners = [
  {
    id: 'banner-1',
    eyebrow: 'FIRST EYEBROW',
    title: '첫 번째 메인 제목',
    description: '첫 번째 설명',
    link_label: '첫 CTA',
    link_url: '/classes/first',
    image_url: 'https://cdn.example/first.webp',
  },
  {
    id: 'banner-2',
    eyebrow: 'SECOND EYEBROW',
    title: '두 번째 메인 제목',
    description: '두 번째 설명',
    link_label: '두 번째 CTA',
    link_url: '/classes/second',
  },
];

test('managed banner fields become the homepage hero slide data', () => {
  const slides = homeHeroSlides(banners, '/classes/free-class');
  assert.equal(slides.length, 2);
  assert.deepEqual(slides[0], {
    id: 'banner-1',
    eyebrow: 'FIRST EYEBROW',
    title: '첫 번째 메인 제목',
    description: '첫 번째 설명',
    linkLabel: '첫 CTA',
    linkUrl: '/classes/first',
    imageUrl: 'https://cdn.example/first.webp',
  });
  const unsafe = homeHeroSlides([{ ...banners[0], link_url: 'javascript:alert(1)' }], '/classes/free-class');
  assert.equal(unsafe[0].linkUrl, '/classes/free-class');
});

test('two or more managed banners render carousel controls and only one main CTA', () => {
  const markup = renderToStaticMarkup(React.createElement(HomeHero, {
    banners,
    freeCourse,
    freeOpen: true,
  }));
  for (const value of ['첫 번째 메인 제목', '첫 번째 설명', '첫 CTA', '이전 배너', '다음 배너', '배너 자동 전환 일시정지', '1 / 2', 'hero-slider-dots']) assert.ok(markup.includes(value));
  assert.equal((markup.match(/class="btn primary large"/g) || []).length, 1);
  assert.doesNotMatch(markup, /전체 클래스 보기|hero-secondary/);
});

test('one banner stays static and admin exposes every hero content control', () => {
  const markup = renderToStaticMarkup(React.createElement(HomeHero, {
    banners: banners.slice(0, 1),
    freeCourse,
    freeOpen: false,
  }));
  assert.doesNotMatch(markup, /hero-slider-controls|이전 배너|다음 배너/);
  const controls = sections.find(section => section.key === 'banners').fields;
  const fields = new Map(controls.map(field => [field.key, field.label]));
  assert.deepEqual([...fields.keys()], ['eyebrow', 'title', 'description', 'image_path', 'link_label', 'link_url', 'is_active', 'display_order', 'starts_at', 'ends_at']);
  for (const label of ['브랜드 상단 문구', '메인 제목', '설명 문구', 'CTA 버튼 문구', 'CTA 연결 주소', '슬라이드 순서']) assert.ok([...fields.values()].includes(label));
  assert.equal(controls.find(field => field.key === 'title').maxLength, 120);
});

test('homepage consumes managed banners and resolves stored banner assets', () => {
  const platform = fs.readFileSync(path.join(root, 'app/ui/platform.tsx'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'app/api/platform/route.ts'), 'utf8');
  assert.match(platform, /<HomeHero[\s\S]*banners=\{rows\("site_banners"\)\}/);
  assert.doesNotMatch(platform, /hero-secondary|전체 클래스 보기/);
  assert.match(route, /banner\.image_url = imagePreviewUrl/);
  assert.match(route, /table === 'site_banners'\) query = query\.order\('created_at'\)/);
});
