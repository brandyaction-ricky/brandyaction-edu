import fs from 'node:fs';
import ts from 'typescript';
import { days } from './curriculum-days.mjs';
export const questionContexts = {};
const code = ts.transpileModule(fs.readFileSync(new URL('../../lib/question-learning-context-server.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('exports', 'require', code)(questionContexts, name => { if (name === './curriculum-days') return days; throw Error(name); });
