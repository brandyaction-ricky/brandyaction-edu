import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const api={};
new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/marketing-context.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(api);
test('marketing round trip keeps explicit multi-campaign dates and filters but excludes unrelated parameters',()=>{
 const search='recruitment=moonshot-4&course=free-a&campaign=a&campaign=b&preset=custom&start=2026-09-01&end=2026-09-20&creative=x&creative=y&token=secret&tab=settings';
 const href=api.marketingContextHref('conversion',search);
 const query=new URL(href,'https://example.test').searchParams;
 assert.deepEqual(query.getAll('campaign'),['a','b']);
 assert.deepEqual(query.getAll('creative'),['x','y']);
 assert.equal(query.get('start'),'2026-09-01');
 assert.equal(query.has('token'),false);assert.equal(query.has('tab'),false);
 assert.equal(api.marketingContextHref('landing',query.toString()),href.replace('/conversion','/landing'));
});
test('changing recruitment or product clears previous attribution filters and rejects invalid context',()=>{
 const old='recruitment=moonshot-4&course=free-a&campaign=old&start=2026-09-01';
 for(const selection of [{period:'moonshot-5',course:'free-a'},{period:'moonshot-4',course:'free-b'}]){
  const q=new URL(api.marketingContextHref('landing',old,selection),'https://example.test').searchParams;
  assert.equal(q.get('course'),selection.course);assert.equal(q.get('recruitment'),selection.period);assert.equal(q.has('campaign'),false);assert.equal(q.has('start'),false);
 }
 assert.equal(api.recruitmentContext('../other'),'');
 assert.equal(api.recruitmentContext('moonshot-4'),'moonshot-4');
});
