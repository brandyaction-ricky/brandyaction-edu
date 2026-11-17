import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports={};
const source=fs.readFileSync(new URL('../lib/embedded-browser.ts',import.meta.url),'utf8');
const platform={};new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/platform.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(platform);
new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,()=>platform);
test('embedded browser hints do not block full mobile browsers',()=>{
 for(const ua of ['Mozilla/5.0 Telegram/11','Mozilla/5.0 KAKAOTALK','Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36','Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148'])assert.equal(exports.isEmbeddedLoginBrowser(ua),true,ua);
 for(const ua of ['Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18 Mobile/15E148 Safari/604.1','Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/130 Mobile/15E148','Mozilla/5.0 (Linux; Android 14) Chrome/130 Safari/537.36'])assert.equal(exports.isEmbeddedLoginBrowser(ua),false,ua);
});
test('external-browser handoff retains welcome/member destinations without external redirects',()=>{
 for(const next of ['/campus/enter?mode=welcome&event=staff-qa','/campus/workspace?enrollmentId=qa&section=space'])assert.equal(new URL(exports.browserLoginPath(next),'https://edu.test').searchParams.get('next'),next);
 for(const next of ['https://other.test','//other.test','/\\other.test','/\nother.test'])assert.equal(exports.browserLoginPath(next),'/login?next=%2Fmy');
});
