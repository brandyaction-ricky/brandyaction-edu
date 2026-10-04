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
const source = fs.readFileSync(new URL('../lib/youtube-thumbnail.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { youtubeThumbnailUrl } = exports;
const cache = new Map();

function LinkStub(props) {
  return React.createElement('a', props);
}

function ImageStub(props) {
  const imageProps = { ...props };
  delete imageProps.unoptimized;
  delete imageProps.sizes;
  return React.createElement('img', imageProps);
}

function load(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute);

  const component = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const moduleExports = {};
  cache.set(absolute, moduleExports);
  new Function('exports', 'require', component)(moduleExports, name => {
    if (name === 'next/link') return LinkStub;
    if (name === 'next/image') return ImageStub;
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const target = ['', '.ts', '.tsx'].map(extension => base + extension).find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!target) throw Error('Cannot resolve ' + name);
      return load(path.relative(root, target));
    }
    return require(name);
  });
  return moduleExports;
}

test('creates YouTube thumbnail URLs for supported video URL formats', () => {
  const videoId = '6TM-qyfubj4';
  const expected = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  for (const url of [
    `https://youtu.be/${videoId}?si=share`,
    `https://www.youtube.com/watch?v=${videoId}&t=12`,
    `https://youtube.com/shorts/${videoId}`,
    `https://m.youtube.com/live/${videoId}`,
    `https://music.youtube.com/watch?v=${videoId}`,
    `https://www.youtube-nocookie.com/embed/${videoId}`,
  ]) {
    assert.equal(youtubeThumbnailUrl(url), expected, url);
  }
});

test('rejects non-YouTube hosts, malformed IDs, and unsafe protocols', () => {
  for (const url of [
    '',
    'https://example.com/watch?v=6TM-qyfubj4',
    'https://youtube.com.evil.test/watch?v=6TM-qyfubj4',
    'https://user:pass@youtube.com/watch?v=6TM-qyfubj4',
    'https://youtu.be/too-short',
    'javascript:alert(1)',
    'not a URL',
  ]) {
    assert.equal(youtubeThumbnailUrl(url), '', url);
  }
});

test('landing story cards use the YouTube thumbnail when no saved thumbnail exists', () => {
  const { Story } = load('app/ui/final/primitives.tsx');
  const markup = renderToStaticMarkup(React.createElement(Story, {
    story: {
      id: 'story',
      title: '고객 이야기',
      description: '실행한 과정과 변화',
      reviewer_name: '케이',
      reviewer_role: '미용실 운영',
      video_url: 'https://youtu.be/6TM-qyfubj4?si=share',
    },
  }));

  assert.match(markup, /src="https:\/\/i\.ytimg\.com\/vi\/6TM-qyfubj4\/hqdefault\.jpg"/);
  assert.doesNotMatch(markup, /BRANDYACTION EDU/);
});

test('landing story cards prefer an explicitly saved thumbnail', () => {
  const { Story } = load('app/ui/final/primitives.tsx');
  const markup = renderToStaticMarkup(React.createElement(Story, {
    story: {
      id: 'story',
      title: '고객 이야기',
      reviewer_name: '케이',
      thumbnail_url: 'https://cdn.example/story.jpg',
      video_url: 'https://youtu.be/6TM-qyfubj4',
    },
  }));

  assert.match(markup, /src="https:\/\/cdn\.example\/story\.jpg"/);
  assert.doesNotMatch(markup, /i\.ytimg\.com/);
});
