import fs from 'node:fs';
import ts from 'typescript';
function load(file, deps = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', js)(exports, name => { if (!(name in deps)) throw Error(name); return deps[name]; });
  return exports;
}
export const submissionReview = load('lib/submission-review.ts', { './edu-workflows': load('lib/edu-workflows.ts') });
