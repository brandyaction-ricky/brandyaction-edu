import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../../lib/product-visibility.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
export const productVisibility = {};
new Function('exports', code)(productVisibility);
