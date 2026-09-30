import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const cache=new Map();function load(name){if(cache.has(name))return cache.get(name);const exports={};cache.set(name,exports);new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,r=>load(r.replace('./','')));return exports;}
const {parseCurriculumText,applyLessonImport,cloneLessonCards}=load('lesson-editor-import');
const {validateLessonBlocks,publicLessonBlocks,fillBlockPrompt}=load('lesson-blocks');
const {newGuidedBlock}=load('lesson-guided-tools'),{newCalculatorBlock}=load('lesson-calculators');
const empty={schemaVersion:1,blocks:[],checklist:[]};
const sample=['Day 22','슬랙 사무실 만들기','','0. 오늘 할 일','원문 안내','---','Prompt','복사하기','```','  줄 앞 공백\n복사할 프롬프트','```','Q','어떤 고객을 돕나요?','','Q','실행 화면을 올려 주세요','','이미지 업로드','---','맞춤형 프롬프트 생성기','반영','1','고객','예시) 지역 점주','목표','예시 : 매출 개선','Prompt','복사하기','```','{{고객}}을 위한 {목표}','```','favicon','도움말','','https://example.test/help','미션 체크리스트','모든 필수 항목을 체크','실행했습니다 *','추가로 읽었습니다','---','쪽지시험','문항 1','첫 단계는?','1. 고객 이해','2. 광고 시작','3. 제품 출시','4. 수익 계산','정답 : 1','문항 2','다음 단계는?','① 실행','② 대기','③ 포기','④ 삭제','정답 : 1','---','마무리 안내'].join('\n');

test('source text grammar retains ordered content, generator fields, image questions, quiz keys and checklist',()=>{
 const parsed=parseCurriculumText(sample.replaceAll('\n','\r\n'));
 assert.deepEqual(parsed.blocks.map(b=>b.type),['heading','heading','text','divider','prompt','question','question','divider','prompt-generator','link','divider','quiz','divider','text']);
 assert.equal(parsed.blocks[4].content,'  줄 앞 공백\n복사할 프롬프트');assert.equal(parsed.blocks[6].question.kind,'image');assert.equal(parsed.blocks[9].content,'도움말');
 const gen=parsed.blocks[8];assert.equal(gen.fields[1].placeholder,'예시) 매출 개선');assert.equal(fillBlockPrompt(gen.content,gen.fields,{[gen.fields[0].id]:'점주',[gen.fields[1].id]:'매출 개선'}),'점주을 위한 매출 개선');assert.equal(parsed.blocks[5].question.required,false);
 assert.deepEqual(parsed.checklist.map(c=>[c.label,c.required]),[['실행했습니다',true],['추가로 읽었습니다',false]]);
 const document=validateLessonBlocks({...empty,blocks:parsed.blocks,checklist:parsed.checklist});
 assert.deepEqual(document.blocks[11].quiz.questions.map(q=>q.options[0]),['고객 이해','실행']);
 assert.ok(!JSON.stringify(publicLessonBlocks(document)).includes('correctIndex'));
});
test('numbered lists and unknown text remain intact while markdown headings are recognized',()=>{
 const p=parseCurriculumText('\uFEFF# 안내\n일반 문장\n\n1. 설치\n2. 계정 만들기\n3. 실행\n\n### 실습\n정리');
 assert.deepEqual(p.blocks.map(b=>b.type),['heading','text','text','subheading','text']);
 assert.equal(p.blocks[2].content,'1. 설치\n2. 계정 만들기\n3. 실행');assert.equal(p.blocks[4].content,'정리');
});
test('malformed structured content fails without hanging, discarding questions, or exposing quiz keys as body text',()=>{
 for(const bad of ['Prompt\nno fence','Prompt\n복사하기\n```\nno closing','쪽지시험\n문항 1\n질문\nA\nB\n정답 : 1','쪽지시험\n문항 1\n질문\nA\nB\nC\nD\n정답 : 7','맞춤형 프롬프트 생성기\n고객','favicon\n이름\nwrong','Q\n---','Day 1\n---'])assert.throws(()=>parseCurriculumText(bad),/번째 줄/);
 assert.throws(()=>parseCurriculumText('http://example.test'),/HTTPS/);assert.throws(()=>parseCurriculumText('https://name:pass@example.test'),/HTTPS/);
});
test('image placeholders preserve description and remain explicitly unfinished until image upload',()=>{
 const p=parseCurriculumText('[이미지 삽입 : 실행 예시]\ncontent image');assert.equal(p.warnings.length,2);assert.equal(p.blocks[0].content,'[이미지 삽입 : 실행 예시]');assert.equal(p.blocks[0].url,'');
 assert.throws(()=>validateLessonBlocks({...empty,blocks:p.blocks}));
});
test('oversized, binary and corrupted text never enter the editor',()=>{
 for(const bad of ['가'.repeat(400000),'abc\0def','한글\uFFFD','---\n'.repeat(1001)])assert.throws(()=>parseCurriculumText(bad));
 assert.deepEqual(parseCurriculumText('  \n'),{blocks:[],checklist:[],warnings:[]});
});
test('append, insert and replace preserve completion policy, existing IDs and explicit checklist semantics',()=>{
 const current={...empty,presentation:{tag:'basics',tagLabel:'기초 학습'},blocks:[{id:'old',type:'text',content:'기존 본문'}],checklist:[{id:'old-check',label:'기존 체크',required:true}],completion:{mode:'mentor',requireAnswers:false,requireQuizPass:false},progression:{track:'daily',dayNumber:7}};
 const original=JSON.stringify(current),incoming=parseCurriculumText('Q\n새 질문');
 const append=applyLessonImport(current,incoming,'append'),front=applyLessonImport(current,incoming,0),replace=applyLessonImport(current,incoming,'replace');
 assert.equal(append.blocks[0].id,'old');assert.equal(front.blocks[1].id,'old');assert.equal(replace.blocks.length,1);assert.deepEqual(replace.checklist,current.checklist);assert.deepEqual(replace.progression,current.progression);assert.deepEqual(replace.completion,current.completion);
 assert.notEqual(append.blocks[1].id,front.blocks[0].id);assert.equal(JSON.stringify(current),original);
 assert.deepEqual(replace.presentation,current.presentation);
 const checks=applyLessonImport(current,parseCurriculumText('미션 체크리스트\n새 체크 *'),'replace');assert.equal(checks.checklist[0].label,'새 체크');assert.equal(checks.checklist.length,1);
 assert.throws(()=>applyLessonImport(current,incoming,3));assert.throws(()=>applyLessonImport({...empty,blocks:Array.from({length:1000},(_,n)=>({id:`old-${n}`,type:'divider'}))},incoming,'append'));
});
test('all interactive copies are independent and built-in tool contracts, media, quiz answers and variables survive',()=>{
 const source=parseCurriculumText(sample).blocks;
 source.push(newGuidedBlock('persona-generator','persona'),newGuidedBlock('landing-planner','landing'),...['recipe-calculator','margin-calculator','marketing-funnel'].map(type=>newCalculatorBlock(type,type)),{id:'private-image',type:'image',assetId:'aaaaaaaa-1111-4111-8111-111111111111',alt:'private media'});
 const previous=JSON.stringify(source),copies=cloneLessonCards(source);assert.equal(JSON.stringify(source),previous);
 assert.ok(copies.every((b,i)=>b.id!==source[i].id));assert.equal(new Set(copies.map(b=>b.id)).size,copies.length);
 validateLessonBlocks({...empty,blocks:copies});
 const generic=source.findIndex(b=>b.type==='prompt-generator');assert.notEqual(copies[generic].fields[0].id,source[generic].fields[0].id);assert.equal(copies[generic].fields[0].variable,source[generic].fields[0].variable);
 const quiz=source.findIndex(b=>b.quiz);assert.notEqual(copies[quiz].quiz.questions[0].id,source[quiz].quiz.questions[0].id);assert.equal(copies[quiz].quiz.questions[0].correctIndex,0);
 assert.deepEqual(copies.find(b=>b.type==='persona-generator').fields,source.find(b=>b.type==='persona-generator').fields);assert.equal(copies.at(-1).assetId,source.at(-1).assetId);
 copies[generic].fields[0].label='사본 수정';assert.notEqual(copies[generic].fields[0].label,source[generic].fields[0].label);
});
