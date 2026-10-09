import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const exports = {}; cache.set(name, exports);
  const source = fs.readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  new Function('exports','require', ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports, path => load(path.replace('./','')));
  return exports;
}

const {lessonImageRows,lessonImageColumns,joinNextImageRow,splitImageRow}=load('lesson-image-row');
const {validateLessonBlocks,publicLessonBlocks}=load('lesson-blocks');
const {lessonCanvasNodes,blocksFromCanvas,duplicateLessonBlock}=load('lesson-document-canvas');
const images=()=>[1,2,3,4].map(i=>({id:'image-'+i,type:'image',assetId:'aaaaaaaa-1111-4111-8111-11111111111'+i,alt:'안내 '+i,content:'설명 '+i}));
test('two then three images preserve flat authorized assets, captions and canvas/public round trips',()=>{
 const input=images(),pair=joinNextImageRow(input,input[0].id,'pair'),triple=joinNextImageRow(pair,input[1].id,'triple');
 assert.deepEqual(lessonImageRows(pair).map(r=>r.length),[2,1,1]);
 assert.deepEqual(lessonImageRows(triple).map(r=>r.length),[3,1]);
 assert.deepEqual([...lessonImageColumns(triple).values()],[{count:3,start:1},{count:3,start:3},{count:3,start:5}]);
 const document={schemaVersion:1,blocks:triple,checklist:[]};
 assert.deepEqual(validateLessonBlocks(document),document);
 assert.deepEqual(publicLessonBlocks(document),document);
 assert.deepEqual(blocksFromCanvas(lessonCanvasNodes(triple)),triple);
 assert.deepEqual(splitImageRow(triple,input[1].id),input);
 assert.throws(()=>joinNextImageRow(triple,input[0].id,'four'),/3장/);
 assert.deepEqual(input,images());
});
test('text is never moved across a row; removal, reordering and duplicate do not lose any images',()=>{
 const input=images(),pair=joinNextImageRow(input,'image-1','row');
 const interrupted=[pair[0],{id:'text',type:'text',content:'중요 안내'},...pair.slice(1)];
 assert.equal(lessonImageColumns(interrupted).size,0);
 assert.throws(()=>joinNextImageRow(interrupted,'image-1','new'),/바로 다음/);
 assert.equal(lessonImageColumns(pair.filter(b=>b.id!=='image-1')).size,0);
 assert.deepEqual(lessonImageRows([pair[1],pair[0],...pair.slice(2)])[0].map(b=>b.id),['image-2','image-1']);
 const copy=duplicateLessonBlock(pair[0],()=> 'copy');assert.equal(copy.imageGroup,undefined);assert.equal(copy.assetId,input[0].assetId);
 // Concurrent edits may combine group identifiers. Presentation still caps rows at three.
 assert.deepEqual(lessonImageRows(input.map(b=>({...b,imageGroup:'row'}))).map(r=>r.length),[3,1]);
});
test('group metadata cannot be injected into other block types or CSS',()=>{
 const doc=block=>({schemaVersion:1,blocks:[block],checklist:[]});
 for(const imageGroup of ['',null,[],{},'row;display:none','__proto__']) assert.throws(()=>validateLessonBlocks(doc({...images()[0],imageGroup})));
 assert.throws(()=>validateLessonBlocks(doc({id:'text',type:'text',content:'설명',imageGroup:'row'})));
 assert.deepEqual(validateLessonBlocks(doc(images()[0])),doc(images()[0]));
});
