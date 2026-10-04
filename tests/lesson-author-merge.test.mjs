import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,r=>load(r.replace('./','')));return exports;}
const {mergeAuthorDraft,authorValuesEqual}=load('lesson-author-merge');
const base=()=>({form:{basic:{week_id:'aaaaaaaa-1111-4111-8111-111111111111',day_number:'1',title:'수업',description:'',duration_label:'',is_published:true,is_preview:false},format:'text',bodyText:'본문',videoUrl:'',externalUrl:'',resourceName:'',resourcePath:''},blocks:{active:true,document:{schemaVersion:1,blocks:[{id:'one',type:'text',content:'첫째'},{id:'two',type:'text',content:'둘째'}],checklist:[]}}});
test('different basic fields and stable block identities merge without overwriting either writer',()=>{
 const original=base(),mine=structuredClone(original),latest=structuredClone(original);
 mine.form.basic.title='내 제목';mine.blocks.document.blocks[0].content='내 첫째';latest.form.basic.duration_label='30분';latest.blocks.document.blocks[1].content='다른 분 둘째';
 const result=mergeAuthorDraft(original,mine,latest);assert.equal(result.conflicts.length,0);assert.equal(result.payload.form.basic.title,'내 제목');assert.equal(result.payload.form.basic.duration_label,'30분');assert.deepEqual(result.payload.blocks.document.blocks.map(x=>x.content),['내 첫째','다른 분 둘째']);assert.equal(original.form.basic.title,'수업');
});
test('overlapping fields require choices and choosing latest preserves independent local edits',()=>{
 const original=base(),mine=structuredClone(original),latest=structuredClone(original);mine.form.basic.title='내 제목';latest.form.basic.title='다른 제목';mine.form.basic.duration_label='20분';
 assert.deepEqual(mergeAuthorDraft(original,mine,latest).conflicts.map(x=>x.key),['basic.title']);const chosen=mergeAuthorDraft(original,mine,latest,{'basic.title':'latest'});assert.equal(chosen.payload.form.basic.title,'다른 제목');assert.equal(chosen.payload.form.basic.duration_label,'20분');
});
test('deleting a concurrently edited item requires a choice and either choice retains other items',()=>{
 const original=base(),mine=structuredClone(original),latest=structuredClone(original);mine.blocks.document.blocks.shift();latest.blocks.document.blocks[0].content='새 첫째';
 const result=mergeAuthorDraft(original,mine,latest);assert.equal(result.conflicts[0].key,'blocks.one');assert.equal(result.conflicts[0].mine,'삭제한 항목');assert.deepEqual(result.payload.blocks.document.blocks.map(x=>x.id),['two']);const chosen=mergeAuthorDraft(original,mine,latest,{'blocks.one':'latest'});assert.deepEqual(new Set(chosen.payload.blocks.document.blocks.map(x=>x.id)),new Set(['one','two']));
});
test('ambiguous ordering is reviewed and independently inserted items are never dropped',()=>{
 const original=base(),mine=structuredClone(original),latest=structuredClone(original);mine.blocks.document.blocks.push({id:'local',type:'question',question:{label:'',kind:'text',required:true}});latest.blocks.document.blocks.unshift({id:'remote',type:'quiz',quiz:{passPercent:100,questions:[{id:'q',prompt:'',options:['',''],correctIndex:-1}]}});
 const result=mergeAuthorDraft(original,mine,latest);assert.ok(result.conflicts.some(x=>x.key==='blocks.order'));assert.deepEqual(new Set(result.payload.blocks.document.blocks.map(x=>x.id)),new Set(['one','two','local','remote']));assert.equal(result.payload.blocks.document.blocks.find(x=>x.id==='remote').quiz.questions[0].correctIndex,-1);
});
test('one writer can reorder while another edits a body, and optional settings can be removed safely',()=>{
 const original=base();original.blocks.document.presentation={tag:'work',tagLabel:'실습'};const mine=structuredClone(original),latest=structuredClone(original);mine.blocks.document.blocks.reverse();delete mine.blocks.document.presentation;latest.blocks.document.blocks[0].content='새 첫째';
 const result=mergeAuthorDraft(original,mine,latest);assert.equal(result.conflicts.length,0);assert.deepEqual(result.payload.blocks.document.blocks.map(x=>x.id),['two','one']);assert.equal(result.payload.blocks.document.blocks[1].content,'새 첫째');assert.equal(result.payload.blocks.document.presentation,undefined);
});
test('turning off the block lesson while another editor changes it requires an explicit choice',()=>{
 const original=base(),mine=structuredClone(original),latest=structuredClone(original);mine.blocks.active=false;latest.blocks.document.blocks[0].content='새 본문';
 assert.ok(mergeAuthorDraft(original,mine,latest).conflicts.some(x=>x.key==='blocks.active'));const chosen=mergeAuthorDraft(original,mine,latest,{'blocks.active':'latest'});assert.equal(chosen.payload.blocks.active,true);assert.equal(chosen.payload.blocks.document.blocks[0].content,'새 본문');
});
test('JSONB object key ordering does not create conflicts or invalidate a reviewed choice',()=>{
 const original=base(),mine=structuredClone(original);mine.form.basic.title='내 제목';const latest=JSON.parse(JSON.stringify(original,(_key,value)=>value && !Array.isArray(value) && typeof value==='object' ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>b.localeCompare(a))) : value));
 assert.equal(authorValuesEqual(original,latest),true);assert.equal(authorValuesEqual({...original,unused:undefined},latest),true);assert.equal(authorValuesEqual(original,mine),false);assert.equal(mergeAuthorDraft(original,mine,latest).conflicts.length,0);assert.equal(authorValuesEqual([1,2],[2,1]),false);
});
