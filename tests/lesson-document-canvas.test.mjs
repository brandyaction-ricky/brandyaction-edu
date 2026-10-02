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
const {lessonCanvasNodes,blocksFromCanvas,duplicateLessonBlock} = load('lesson-document-canvas');
const {newGuidedBlock} = load('lesson-guided-tools');
const {newCalculatorBlock} = load('lesson-calculators');
const {lessonDocumentForEditor, serializeLessonDocument, parseLessonDocument, normalizeLessonDocument, lessonBodyPlainText} = load('lesson-body');
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
