import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const rules={};new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/entry-source.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(rules);
const code='11111111-1111-4111-8111-111111111111';
test('recruitment SMS retains the recorded room across offer/encore and leaves unknown evidence unclassified',()=>{
 const text=`자료 https://other.example/classes/item\n상품 https://brandyaction-edu.com/classes/product?src=youtube&x=1.\n앵콜 https://brandyaction-edu.com/go/${code}/encore/unknown/offer\n마감 https://brandyaction-edu-dev.vercel.app/checkout?cohort=abc&src=organic`;
 const paid=rules.recruitmentMessageLinks(text,'paid');
 assert.match(paid,/classes\/product\?src=paid&x=1\./);assert.match(paid,/encore\/paid\/offer/);assert.match(paid,/cohort=abc&src=paid/);assert.match(paid,/https:\/\/other.example\/classes\/item/);
 const organic=rules.recruitmentMessageLinks(text,'organic');assert.match(organic,/src=organic/);assert.match(organic,/encore\/organic\/offer/);
 for(const unknown of [undefined,null,'unknown','youtube','alumni']){
  const value=rules.recruitmentMessageLinks(text,unknown);assert.doesNotMatch(value,/src=/);assert.match(value,/encore\/unknown\/offer/);
 }
 for(const bad of ['https://evil.test/checkout','https://brandyaction-edu.com.evil.test/checkout','https://user@brandyaction-edu.com/checkout','http://brandyaction-edu.com/checkout','https://brandyaction-edu.com:444/checkout'])assert.equal(rules.recruitmentMessageLinks(bad,'paid'),bad);
 assert.equal(rules.withEntrySource('/classes/product-cf147f74-6783-43f7-a205-8c2128a48997?x=1#detail','youtube'),'/classes/product-cf147f74-6783-43f7-a205-8c2128a48997?x=1&src=youtube#detail');
});
