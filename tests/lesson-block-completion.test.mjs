import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(name){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL(`../lib/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,n=>load(n.replace('./','')));return out;}
const {validateLessonBlocks,assessBlockCompletion,publicLessonBlocks,missingBlockRequirements}=load('lesson-blocks');
const doc={schemaVersion:1,blocks:[{id:'q',type:'question',question:{label:'필수 질문',kind:'text',required:true}},{id:'quiz',type:'quiz',quiz:{passPercent:100,questions:[{id:'a',prompt:'문제',options:['정답','오답'],correctIndex:0}]}}],checklist:[{id:'c',label:'확인',required:true}]};
const good={blocks:{q:'답변',quiz:{a:0}},checklist:['c']};
test('self completion requires checked items, required answers and server-graded quiz pass',()=>{
 assert.equal(assessBlockCompletion(doc,good).ready,true);
 for(const values of [{...good,checklist:[]},{...good,blocks:{...good.blocks,q:'  '}},{...good,blocks:{...good.blocks,quiz:{a:1}}}])assert.equal(assessBlockCompletion(doc,values).ready,false);
 assert.equal(missingBlockRequirements(publicLessonBlocks(doc),{blocks:{},checklist:[]}).length,3);
 assert.doesNotMatch(JSON.stringify(publicLessonBlocks(doc)),/correctIndex/);
});
test('original daily mission checklist-only policy does not invent quiz or answer gates',()=>{
 const daily={...doc,completion:{mode:'mentor',requireAnswers:false,requireQuizPass:false}};
 assert.deepEqual(validateLessonBlocks(daily),daily);
 assert.equal(assessBlockCompletion(daily,{blocks:{},checklist:['c']}).ready,true);
 assert.equal(assessBlockCompletion(daily,{blocks:{},checklist:[]}).ready,false);
});
test('content-only lessons pass without a quiz, but a partial percentage quiz still needs every response',()=>{
 assert.equal(assessBlockCompletion({schemaVersion:1,blocks:[],checklist:[]},{blocks:{},checklist:[]}).ready,true);
 const changed=structuredClone(doc);changed.blocks[1].quiz.passPercent=50;changed.blocks[1].quiz.questions.push({...changed.blocks[1].quiz.questions[0],id:'b'});
 assert.equal(assessBlockCompletion(changed,good).ready,false);
 assert.equal(assessBlockCompletion(changed,{...good,blocks:{...good.blocks,quiz:{a:0,b:1}}}).ready,true);
});
test('completion policies fail closed and ephemeral private fields are never demanded from saved answers',()=>{
 for(const completion of [null,{}, {mode:'self',requireAnswers:true}, {mode:'auto',requireAnswers:true,requireQuizPass:true},{mode:'self',requireAnswers:'false',requireQuizPass:true}])assert.throws(()=>validateLessonBlocks({...doc,completion}));
 const secret={schemaVersion:1,blocks:[{id:'tool',type:'prompt-generator',fields:[{id:'key',label:'비공개',variable:'key',placeholder:'',required:true,sensitive:true}]}],checklist:[]};
 assert.equal(assessBlockCompletion(secret,{blocks:{},checklist:[]}).ready,true);
});
