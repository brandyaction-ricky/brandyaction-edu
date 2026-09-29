import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const cache=new Map();function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,r=>load(r.replace('./','')));return exports;}
const {LearningDraftStore,learningDraftKey,parseLearningEditorDraft}=load('learning-editor-draft');
const {LessonDocumentWriter}=load('lesson-block-authoring');
const actor='aaaaaaaa-1111-4111-8111-111111111111',lesson='bbbbbbbb-1111-4111-8111-111111111111',revision='cccccccc-1111-4111-8111-111111111111';
const doc=(content='본문')=>({schemaVersion:1,blocks:[{id:'body',type:'text',content}],checklist:[]});
const form={basic:{week_id:'',day_number:'1',title:'작성 중',description:'',duration_label:'',is_published:false,is_preview:false},format:'text',bodyText:'',videoUrl:'',externalUrl:'',resourceName:'',resourcePath:''};
const draft=()=>({version:1,actorId:actor,scopeLessonId:lesson,storedLessonId:lesson,savedAt:new Date().toISOString(),base:form,form,blocks:{active:true,document:doc(),writer:{revision,committed:doc('원본'),pending:null}}});
const storage=()=>{const map=new Map();return{map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};

test('unfinished questions, generator fields, quiz keys and empty media survive draft parsing unchanged',()=>{
 const d=draft();d.blocks.document.blocks.push({id:'question',type:'question',question:{label:'',kind:'text',required:true}},{id:'quiz',type:'quiz',quiz:{questions:[{id:'q',prompt:'',options:['',''],correctIndex:-1}],passPercent:0}},{id:'image',type:'image',url:''},{id:'generator',type:'prompt-generator',content:'{',fields:[{id:'f',label:'',variable:'',placeholder:'',required:true,sensitive:true}]});
 d.blocks.document.presentation={tag:'basics',tagLabel:'기초 학습'};
 d.blocks.document.checklist.push({id:'c',label:'',required:true});d.blocks.document.progression={track:'daily',dayNumber:0};
 assert.deepEqual(parseLearningEditorDraft(JSON.stringify(d),actor,lesson),d);
});
test('drafts are bound to the signed-in actor and exact lesson while malformed data cannot enter the editor',()=>{
 const d=draft();assert.notEqual(learningDraftKey(actor,lesson),learningDraftKey(lesson,actor));assert.notEqual(learningDraftKey(actor,lesson),learningDraftKey(actor,''));
 for(const value of [{...d,actorId:lesson},{...d,scopeLessonId:actor},{...d,storedLessonId:actor},{...d,blocks:{...d.blocks,document:{schemaVersion:1,blocks:[{id:'x',type:'quiz',quiz:null}],checklist:[]}}},{...d,blocks:{...d.blocks,document:{...doc(),checklist:[null]}}},{...d,blocks:{...d.blocks,writer:{revision,committed:doc(),pending:{}}}}])assert.throws(()=>parseLearningEditorDraft(JSON.stringify(value),actor,lesson));
 const malformed=draft();malformed.blocks.document.blocks[0].quiz={questions:'not-an-array'};assert.throws(()=>parseLearningEditorDraft(JSON.stringify(malformed),actor,lesson));
 const extra=draft();extra.form={...form,basic:{...form.basic,unexpected:'data'}};assert.throws(()=>parseLearningEditorDraft(JSON.stringify(extra),actor,lesson));
 assert.throws(()=>parseLearningEditorDraft('{',actor,lesson));assert.throws(()=>learningDraftKey('unknown',lesson));
});
test('storage checks prevent deleting or overwriting another tab draft and surface quota failures',()=>{
 const s=storage(),key=learningDraftKey(actor,lesson),one=new LearningDraftStore(s,key),two=new LearningDraftStore(s,key);
 one.write(draft());assert.throws(()=>two.write(draft()),/다른 창/);assert.throws(()=>two.clear(),/다른 창/);assert.ok(s.getItem(key));
 one.clear();assert.equal(s.getItem(key),null);
 const failing=new LearningDraftStore({...s,setItem:()=>{throw new Error('quota');}},key);assert.throws(()=>failing.write(draft()),/quota/);
});
test('pending write checkpoints replay the original request after reload before saving later edits',async()=>{
 const writes=[];const first=new LessonDocumentWriter(revision,doc('원본'),async r=>{writes.push(r);throw new Error('offline');});
 await assert.rejects(first.save(lesson,doc('첫 수정')));const checkpoint=first.checkpoint();
 const reopened=new LessonDocumentWriter(revision,doc('원본'),async r=>{writes.push(r);return{revision:r.requestId};});reopened.restore(checkpoint,lesson);
 await reopened.save(lesson,doc('이어 쓴 내용'));assert.deepEqual(writes[1],writes[0]);assert.equal(writes[2].expectedRevision,writes[0].requestId);assert.equal(writes[2].document.blocks[0].content,'이어 쓴 내용');
});
test('fresh saved head acknowledges a lost response but a different author revision never restores over it',async()=>{
 let write;const first=new LessonDocumentWriter(revision,doc('원본'),async r=>{write=r;throw new Error('lost');});await assert.rejects(first.save(lesson,doc('성공했지만 응답 없음')));
 const checkpoint=first.checkpoint();let count=0;const recovered=new LessonDocumentWriter(write.requestId,write.document,async r=>{count++;return{revision:r.requestId};});recovered.restore(checkpoint,lesson);await recovered.save(lesson,write.document);assert.equal(count,0);
 const another=new LessonDocumentWriter(actor,doc('다른 직원 수정'),async()=>{throw new Error('must not send');});assert.throws(()=>another.restore(checkpoint,lesson),/더 새로운/);
 assert.throws(()=>recovered.restore(checkpoint,actor),/다른 학습/);
});

test('all existing guided and calculator definitions survive a local backup without losing fields',()=>{
 const d=draft(),{newGuidedBlock}=load('lesson-guided-tools'),{newCalculatorBlock}=load('lesson-calculators');
 for(const type of ['persona-generator','landing-planner'])d.blocks.document.blocks.push(newGuidedBlock(type,type));
 for(const type of ['recipe-calculator','margin-calculator','marketing-funnel'])d.blocks.document.blocks.push(newCalculatorBlock(type,type));
 assert.deepEqual(parseLearningEditorDraft(JSON.stringify(d),actor,lesson),d);
});
