import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(name) {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, request => load(request.replace('./', '')));
  return exports;
}
const mod = load('lesson-blocks');
const { validateLessonBlocks, validateBlockAnswers, publicLessonBlocks, fillBlockPrompt, gradeBlockQuiz } = mod;
const field = (id, sensitive = false) => ({ id, label: id, variable: id, placeholder: '', required: false, sensitive });
const sample = () => ({ schemaVersion: 1, blocks: [
  { id: 'text', type: 'text', content: '원문\n\n  그대로' },
  { id: 'q1', type: 'question', question: { label: '질문', kind: 'text', required: true } },
  { id: 'generator', type: 'prompt-generator', content: '{brand} {{ goal }}', fields: [field('brand'), field('goal'), field('key', true)] },
  { id: 'quiz1', type: 'quiz', quiz: { passPercent: 80, questions: [{ id: 'q1', prompt: '시험', options: ['가', '나'], correctIndex: 1 }] } },
  { id: 'quiz2', type: 'quiz', quiz: { passPercent: 100, questions: [{ id: 'q1', prompt: '다른 시험', options: ['1', '2'], correctIndex: 0 }] } },
], checklist: [{ id: 'c1', label: '완료', required: true }] });

test('progression keeps separate tracks and rejects invalid day numbers or incompatible completion rules',()=>{
 const daily={schemaVersion:1,blocks:[],checklist:[],progression:{track:'daily',dayNumber:1},completion:{mode:'mentor',requireAnswers:false,requireQuizPass:false}};
 assert.deepEqual(validateLessonBlocks(daily),daily);assert.deepEqual(publicLessonBlocks(daily).progression,daily.progression);
 for(const value of [0,31,1.2,'1',null])assert.throws(()=>validateLessonBlocks({...daily,progression:{track:'daily',dayNumber:value}}));
 assert.throws(()=>validateLessonBlocks({...daily,completion:{...daily.completion,mode:'self'}}));
 const learning={...sample(),progression:{track:'learning',dayNumber:30},completion:{mode:'self',requireAnswers:false,requireQuizPass:true}};
 assert.throws(()=>validateLessonBlocks(learning));learning.blocks[3].quiz.passPercent=100;assert.deepEqual(validateLessonBlocks(learning),learning);
 assert.throws(()=>validateLessonBlocks({...learning,completion:{...learning.completion,requireQuizPass:false}}));
});

test('keeps block order, stable ids, original text and multiple quizzes; only learners lose answer keys', () => {
  const source = sample(), doc = validateLessonBlocks(source);
  assert.deepEqual(doc, source);
  const publicDoc = publicLessonBlocks(doc);
  assert.doesNotMatch(JSON.stringify(publicDoc), /correctIndex/);
  assert.equal(doc.blocks[3].quiz.questions[0].correctIndex, 1);
  assert.equal(publicDoc.blocks[4].quiz.questions[0].id, 'q1');
});
test('template values are literal, one-pass substitutions with Unicode/whitespace and single/double braces', () => {
  const fields = [field('brand'), field('goal'), { ...field('name'), variable: '나의 이름' }];
  assert.equal(fillBlockPrompt('{brand} {{ goal }} {{나의이름}} {missing}', fields, { brand: '$& {goal}', goal: '첫 목표', name: '홍길동' }), '$& {goal} 첫 목표 홍길동 {missing}');
  assert.equal(fillBlockPrompt('{brand}', fields, { brand: '' }), '{brand}');
  assert.equal(fillBlockPrompt('{constructor}', [field('constructor')], {}), '{constructor}');
});
test('draft is bound to block and quiz identifiers; blank text can be saved before submission', () => {
  const answers = { blocks: { q1: '', generator: { brand: '브랜디', goal: '' }, quiz1: { q1: 1 }, quiz2: { q1: 0 } }, checklist: ['c1'] };
  assert.deepEqual(validateBlockAnswers(answers, sample()), answers);
  assert.equal(gradeBlockQuiz(sample().blocks[3], answers.blocks.quiz1).passed, true);
  assert.equal(gradeBlockQuiz(sample().blocks[3], {}).passed, false);
  assert.doesNotMatch(JSON.stringify(gradeBlockQuiz(sample().blocks[3], { q1: 0 })), /correctIndex|"options"/);
});
test('limits measure UTF-8 bytes, so Korean drafts cannot exceed the database storage limit', () => {
  const doc=sample();doc.blocks=Array.from({length:20},(_,i)=>({id:'q'+i,type:'question',question:{label:'질문',kind:'text',required:false}}));
  const answers={blocks:Object.fromEntries(doc.blocks.map(b=>[b.id,'한'.repeat(10000)])),checklist:[]};
  assert.throws(()=>validateBlockAnswers(answers,doc),/답변이 너무 깁니다/);
});
for (const [name, change] of [
  ['unknown schema', d => d.schemaVersion = 2],
  ['unknown feature', d => d.blocks[0].script = 'danger'],
  ['duplicate blocks', d => d.blocks.push(d.blocks[0])],
  ['duplicate field variables', d => d.blocks[2].fields.push({ ...field('other'), variable: 'b r a n d' })],
  ['missing question label', d => d.blocks[1].question.label = ''],
  ['invalid quiz key', d => d.blocks[3].quiz.questions[0].correctIndex = 99],
  ['unknown block', d => d.blocks[0].type = 'new-tool'],
  ['unsafe media', d => d.blocks[0] = { id: 'image', type: 'image', url: 'javascript:alert(1)' }],
  ['credential-bearing media', d => d.blocks[0] = { id: 'video', type: 'video', url: 'https://user:password@example.test/v' }],
  ['prototype key', d => d.blocks[0].id = '__proto__'],
  ['inherited block key', d => d.blocks[0].id = 'constructor'],
  ['inherited field key', d => d.blocks[2].fields[0].id = 'toString'],
  ['inherited quiz key', d => d.blocks[3].quiz.questions[0].id = 'hasOwnProperty'],
]) test(`rejects ${name}`, () => { const d = sample(); change(d); assert.throws(() => validateLessonBlocks(d)); });
for (const [name, values] of [
  ['unknown question', { other: 'answer' }],
  ['sensitive field', { generator: { key: 'never-store-me' } }],
  ['arbitrary tool field', { generator: { unknown: 'answer' } }],
  ['out of bounds choice', { quiz1: { q1: 2 } }],
  ['injected correctness', { quiz1: { correctIndex: 1 } }],
  ['non-question block', { text: 'answer' }],
]) test(`does not save ${name}`, () => {
  assert.throws(() => validateBlockAnswers({ blocks: values, checklist: [] }, sample()), error => { assert.doesNotMatch(error.message, /never-store-me/); return true; });
});
