import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export const schema = JSON.parse(readFileSync(new URL('../../lib/edu_web_contract_v1.schema.json', import.meta.url), 'utf8'));
export function compileExport(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', code)(exports, name => name in mocks ? mocks[name] : name.endsWith('.schema.json') ? schema : require(name));
  return exports;
}
export const contract = compileExport('lib/edu-export-contract.ts');
export const adControls = compileExport('lib/edu-ad-controls.ts', { './edu-export-contract': contract });
export const logic = compileExport('lib/edu-export.ts', { './edu-export-contract': contract, './edu-ad-controls': adControls });
export function emptySource() {
  return Object.fromEntries(['cohorts','orders','items','payments','refunds','enrollments','usage','catalog','visits','campaigns','dimensions','meta','funnel','actuals','clicks','registrations','broadcasts','products','questions','refund_requests','crm','push','consent']
    .map(key => [key, []]).concat([['settings', { learningUsageSince: '2026-10-04', productTrackingSince: null }], ['consentEnabled', true]]));
}
