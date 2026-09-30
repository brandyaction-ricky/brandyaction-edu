import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/google-id-login.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
const require = name => {
  assert.equal(name, './platform');
  return { safeNext: value => value && /^\/(?![\\/])/.test(value) && !/[\\\u0000-\u001f]/.test(value) ? value : '/my' };
};
new Function('exports', 'require', compiled)(exports, require);
const { googleIdDestination } = exports;

test('Google ID login keeps existing-member destination and new-member consent', () => {
  const agreed = { terms_version: '2026', privacy_version: '2026' };
  assert.equal(googleIdDestination(agreed, '/checkout?cohort=123'), '/checkout?cohort=123');
  assert.equal(googleIdDestination({}, '/checkout?cohort=123'), '/auth/consent?next=%2Fcheckout%3Fcohort%3D123');
  assert.equal(googleIdDestination({ terms_version: '2026' }, '/my'), '/auth/consent?next=%2Fmy');
  assert.equal(googleIdDestination(agreed, '//evil.example'), '/my');
});
