import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports={};new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/learning-usage.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const item=(type,id,used=false,requests=0)=>({type,id,firstUsedAt:used?'2026-10-03T00:00:00Z':null,requests});
test('reference ratio counts unique items rather than four categories or repeated requests',()=>{
 const items=[item('vod_complete','one',true),item('vod_complete','two'),item('material_download','one',true,99),item('live_join','one'),item('replay_view','one')];
 const ratio=exports.learningUsage([...items,items[2]]);assert.equal(ratio.total,5);assert.equal(ratio.used,2);assert.equal(ratio.percent,40);assert.equal(ratio.atLeastHalf,false);assert.equal(ratio.byType[0].total,2);
 assert.equal(exports.learningUsage(items.slice(0,4)).atLeastHalf,true);
 const empty=exports.learningUsage([]);assert.equal(empty.percent,null);assert.equal(empty.atLeastHalf,null);
});
test('rounded percentage never changes the exact half boundary',()=>{
 const result=exports.learningUsage(Array.from({length:2001},(_,i)=>item('vod_complete',String(i),i<1000)));assert.equal(result.percent,50);assert.equal(result.atLeastHalf,false);
});
