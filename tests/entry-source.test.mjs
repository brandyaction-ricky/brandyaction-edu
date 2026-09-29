import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/entry-source.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { loginBeforeCheckout, parseEntrySource, withEntrySource } = exports;

test('only campaign source codes survive into checkout links and direct visitors stay untagged', () => {
  for (const value of ['paid', 'organic', 'alumni', 'youtube']) {
    assert.equal(parseEntrySource(value), value);
    assert.equal(withEntrySource('/checkout?cohort=abc', value), `/checkout?cohort=abc&src=${value}`);
  }
  assert.equal(parseEntrySource('paid<script>'), null);
  assert.equal(parseEntrySource(null), null);
  assert.equal(withEntrySource('/checkout?cohort=abc', null), '/checkout?cohort=abc');
  assert.equal(withEntrySource('https://open.kakao.com/o/example', 'paid'), 'https://open.kakao.com/o/example');
  assert.equal(withEntrySource('/classes/product?cohort=abc', 'paid'), '/classes/product?cohort=abc');
  assert.equal(withEntrySource('/checkout?cohort=abc&src=organic', 'paid'), '/checkout?cohort=abc&src=paid');
});

test('guest application opens login directly and preserves campaign source after return', () => {
  const checkout = withEntrySource('/checkout?cohort=abc', 'paid');
  assert.equal(loginBeforeCheckout(checkout, false), '/login?next=%2Fcheckout%3Fcohort%3Dabc%26src%3Dpaid');
  assert.equal(loginBeforeCheckout(checkout, true), checkout);
  assert.equal(loginBeforeCheckout('/safe-custom', false), '/safe-custom');
  assert.equal(loginBeforeCheckout('https://open.kakao.com/o/example', false), 'https://open.kakao.com/o/example');
  assert.equal(loginBeforeCheckout('//example.com/checkout', false), '//example.com/checkout');
});
