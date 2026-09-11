import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/platform.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const compiledModule={exports:{}};new Function('exports',compiled)(compiledModule.exports);
const {safeNext,safeUrl}=compiledModule.exports;
test('OAuth return URLs stay on the application origin',()=>{
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/my\\x','/\n/evil.example',null]) assert.equal(safeNext(value),'/my');
 for(const value of ['/my/classes','/checkout?cohort=123','/admin']) assert.equal(safeNext(value),value);
});
test('untrusted content links cannot execute scripts',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,hello','file:///etc/passwd','vbscript:msgbox(1)']) assert.equal(safeUrl(value),'');
 assert.equal(safeUrl('https://example.com/resource.pdf'),'https://example.com/resource.pdf');
 assert.equal(safeUrl('/classes'),'/classes');
});
