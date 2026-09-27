import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/public-platform-plan.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { publicTables, publicReadParams, publicViewForPath, PUBLIC_PAGE_SIZE } = exports;

test('public routes request only their own content contract', () => {
  assert.equal(PUBLIC_PAGE_SIZE, 12);
  assert.equal(publicViewForPath([]), 'home');
  assert.equal(publicViewForPath(['classes', 'course-1']), 'class');
  assert.equal(publicViewForPath(['my', 'missions']), null);
  assert.equal(publicViewForPath(['admin', 'products']), null);
  for (const tables of Object.values(publicTables)) {
    for (const privateTable of ['profiles', 'orders', 'enrollments', 'mission_submissions', 'lesson_contents', 'cohort_session_contents']) {
      assert.equal(tables.includes(privateTable), false, `${privateTable} must not be shared`);
    }
  }
  assert.deepEqual(publicTables.stories, ['review_videos']);
  assert.deepEqual(publicTables.classes, ['courses', 'cohorts']);
});

test('route identity and search are explicit; member pages have no public read', () => {
  const search = new URLSearchParams('cohort=offer-1');
  assert.equal(publicReadParams(['classes', 'abc'], search)?.toString(), 'view=class&slug=abc');
  assert.equal(publicReadParams(['checkout'], search)?.toString(), 'view=checkout&cohort=offer-1');
  assert.equal(publicReadParams(['classes'], search, 2, 'test')?.toString(), 'view=classes&page=2&q=test');
  assert.equal(publicReadParams(['my', 'orders'], search), null);
});
