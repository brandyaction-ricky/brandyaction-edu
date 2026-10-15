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
const {lessonCanvasNodes,blocksFromCanvas,duplicateLessonBlock,lessonClipboardNodes} = load('lesson-document-canvas');
const {newGuidedBlock} = load('lesson-guided-tools');
const {newCalculatorBlock} = load('lesson-calculators');
const {lessonDocumentForEditor, serializeLessonDocument, parseLessonDocument, normalizeLessonDocument, lessonBodyPlainText} = load('lesson-body');
const {positionLessonImage} = load('lesson-image-position');
const {lessonEmbeddedImageIds, removeLessonImageReference} = load('lesson-toggle-images');
const {cloneLessonCards} = load('lesson-editor-import');
test('toggle images keep authorized flat assets through projection, copying and moving back out',()=>{
 const image={id:'photo',type:'image',assetId:'aaaaaaaa-1111-4111-8111-111111111111',alt:'파일 안내',content:'원본 설명'};
 const owner={id:'toggle',type:'text',content:serializeLessonDocument({type:'doc',content:[{type:'details',content:[{type:'detailsSummary',content:[{type:'text',text:'자료'}]},{type:'detailsContent',content:[{type:'paragraph'}]}]}]})};
 const original=[owner,image,blocks[3]], moved=positionLessonImage(original,image,{blockId:'toggle',togglePath:[0,1]},'unused');
 assert.deepEqual(moved.slice(1),original.slice(1)); assert.deepEqual([...lessonEmbeddedImageIds(moved)],['photo']);
 assert.deepEqual(blocksFromCanvas(lessonCanvasNodes(moved)),moved);
 const doc=parseLessonDocument(moved[0].content);assert.deepEqual(doc.content[0].content[1].content[1],{type:'lessonImage',attrs:{blockId:'photo'}});
 const copied=cloneLessonCards(moved);assert.deepEqual([...lessonEmbeddedImageIds(copied)],[copied[1].id]);assert.equal(copied[1].assetId,image.assetId);
 assert.throws(()=>cloneLessonCards([moved[0]]),/이미지도 함께/);
 assert.deepEqual(positionLessonImage(moved,image,{blockId:'toggle',after:true},'unused'),original);
 assert.equal(lessonEmbeddedImageIds(removeLessonImageReference(moved,'photo')).size,0);
 const unsafe={type:'doc',content:[{type:'lessonImage',attrs:{blockId:'photo',src:'javascript:bad',style:'position:fixed',block:{quiz:{privateKey:1}}}}]};
 assert.deepEqual(parseLessonDocument(serializeLessonDocument(unsafe)).content,[{type:'lessonImage',attrs:{blockId:'photo'}}]);
});
const blocks = [
  {id:'raw',type:'text',content:'원문\n\n[링크](https://example.com)'}, {id:'h',type:'heading',content:'한 제목'},
  {id:'s',type:'subheading',content:'작은 제목'}, {id:'q',type:'question',question:{label:'기존 질문',kind:'image',required:true}},
  {id:'m',type:'audio',assetId:'aaaaaaaa-1111-4111-8111-111111111111'},
  {id:'g',type:'prompt-generator',content:'{고객}',fields:[{id:'f',variable:'고객',label:'고객',required:true,sensitive:false,placeholder:''}]},
  {id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'qq',prompt:'문제',options:['하나','둘'],correctIndex:1}]}},
  newGuidedBlock('persona-generator','persona'),newGuidedBlock('landing-planner','landing'),
  newCalculatorBlock('recipe-calculator','recipe'),newCalculatorBlock('margin-calculator','margin'),newCalculatorBlock('marketing-funnel','funnel'),
];
test('callout content persists through the canvas without changing activities or keeping unsafe attributes',()=>{
 const notice={type:'callout',attrs:{style:'position:fixed',onclick:'alert(1)'},content:[
  {type:'paragraph',content:[{type:'text',text:'필독 안내',marks:[{type:'bold'}]}]},
  {type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'수강 전에 확인',marks:[{type:'link',attrs:{href:'https://example.com/notice'}}]}]}]}]},
 ]};
 const saved=serializeLessonDocument({type:'doc',content:[notice]});
 assert.equal(parseLessonDocument(saved).content[0].type,'callout');
 assert.equal(parseLessonDocument(saved).content[0].attrs,undefined);
 assert.match(lessonBodyPlainText(saved),/필독 안내/);
 const next=[{id:'notice',type:'text',content:saved},...blocks];
 assert.deepEqual(blocksFromCanvas(lessonCanvasNodes(next)),next);
 for(const content of [[],[{type:'text',text:'잘못된 본문'}],[{type:'doc',content:[]}]])assert.equal(normalizeLessonDocument({type:'doc',content:[{type:'callout',content}]}),null);
});
test('whole lesson projection round-trips every opaque tool and untouched legacy text exactly',()=>{
  assert.deepEqual(blocksFromCanvas(lessonCanvasNodes(blocks)),blocks);
});
test('clipboard projection omits the original text cache without mutating content, marks or activity identities',()=>{
 const nodes=lessonCanvasNodes(blocks), before=structuredClone(nodes), copied=lessonClipboardNodes(nodes);
 assert.deepEqual(nodes,before);
 for(let n=0;n<3;n++) {
  assert.equal(copied[n].attrs.block.content,'');
  assert.deepEqual(copied[n].content,nodes[n].content);
  assert.equal(copied[n].attrs.block.id,blocks[n].id);
 }
 assert.deepEqual(copied.slice(3),nodes.slice(3));
 assert.deepEqual(lessonClipboardNodes([]),[]);
});
test('editing plain heading preserves identity; richer heading becomes formatted text without dropping marks',()=>{
 const nodes=lessonCanvasNodes(blocks);nodes[1].content[0].content[0].text='새 제목';
 assert.deepEqual(blocksFromCanvas(nodes)[1],{...blocks[1],content:'새 제목'});
 nodes[1].content[0].content[0].marks=[{type:'bold'}];const changed=blocksFromCanvas(nodes)[1];
 assert.equal(changed.id,'h');assert.equal(changed.type,'text');assert.deepEqual(lessonDocumentForEditor(changed.content).content[0].content[0].marks,[{type:'bold'}]);
 assert.deepEqual(blocksFromCanvas(nodes).slice(3),blocks.slice(3));
});
test('reordering preserves identifiers and cloning regenerates question and variable identities',()=>{
 assert.deepEqual(blocksFromCanvas(lessonCanvasNodes([...blocks].reverse())),[...blocks].reverse());
 let n=0;const next=()=>`copy${++n}`;
 const copy=duplicateLessonBlock(blocks[5],next);assert.notEqual(copy.id,blocks[5].id);assert.notEqual(copy.fields[0].id,'f');assert.equal(copy.fields[0].variable,'고객');
 const quiz=duplicateLessonBlock(blocks[6],next);assert.notEqual(quiz.quiz.questions[0].id,'qq');assert.equal(quiz.quiz.questions[0].correctIndex,1);
});
test('invalid document identity is rejected, never silently rebound to existing student answers',()=>{
 const nodes=lessonCanvasNodes(blocks);assert.throws(()=>blocksFromCanvas([...nodes,nodes[0]]),/연결/);
 assert.throws(()=>blocksFromCanvas([{type:'lessonActivity'}]),/연결/);
});
test('text colors round-trip canvas and reject injected or unsupported styles',()=>{
 const style={fontSize:'20px',color:'#C51E2C',backgroundColor:'rgb(254, 240, 138)',position:'fixed'};
 const saved=serializeLessonDocument({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'색상 안내',marks:[{type:'textStyle',attrs:style}]}]}]});
 assert.deepEqual(parseLessonDocument(saved).content[0].content[0].marks,[{type:'textStyle',attrs:{fontSize:'20px',color:'#c51e2c',backgroundColor:'#fef08a'}}]);
 const doc=[{id:'colors',type:'text',content:saved},...blocks];
 assert.deepEqual(blocksFromCanvas(lessonCanvasNodes(doc)),doc);
 for(const invalid of ['red;position:fixed','url(https://example.test/pixel)','var(--unsafe)','expression(alert(1))','rgb(999,0,0)','#ffffffff','transparent']) {
  const clean=normalizeLessonDocument({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'안내',marks:[{type:'textStyle',attrs:{color:invalid,backgroundColor:invalid,fontSize:'20px'}}]}]}]});
  assert.deepEqual(clean.content[0].content[0].marks,[{type:'textStyle',attrs:{fontSize:'20px'}}]);
 }
});
