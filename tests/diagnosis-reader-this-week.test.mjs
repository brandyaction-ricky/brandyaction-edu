import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// CEO 11-08 ("응 EDU도 적용해", same as MYIN): THIS WEEK in the final design — the 1×1→1 line in one row, the 4 steps
// in one row at one height, phones stack them. Only final-design reports get it; earlier designs keep their look.
test('the report reader adds the THIS WEEK layout to final-design reports only', () => {
  const src = readFileSync(new URL('../app/ui/final/diagnosis-report-reader.tsx', import.meta.url), 'utf8');
  assert.match(src, /const FINAL_DESIGN = '<meta name="design-version" content="myin-precision-final-design-v1">';/);
  assert.match(src, /\$\{READER_LAYOUT_CSS\}\$\{html\.includes\(FINAL_DESIGN\) \? FINAL_FIXES : ''\}/);
  const css = src.match(/const FINAL_FIXES = '([^']*)'/)[1];
  assert.match(css, /^\.e-mission:empty\{display:none\}\.e-mission\{display:flex;/);
  assert.match(css, /\.e-sequence\{flex-wrap:nowrap!important;align-items:stretch!important\}/);
  assert.match(css, /@media\(max-width:640px\)\{[^']*\.e-sequence\{flex-direction:column!important;align-items:flex-start!important\}[^']*rotate\(90deg\)/);
});
