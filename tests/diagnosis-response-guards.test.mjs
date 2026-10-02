import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../lib/diagnosis-response-guards.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exports);
const { diagnosisNeutralResponses: neutral, diagnosisResponseTooFast: fast } = exports;
const questions = Array.from({length:20}, (_, i) => ({id:String(i), pair:{left:'왼쪽',right:'오른쪽'}, options:[1,2,3,4,5].map(n=>({id:String(n)}))}));
const answers = n => questions.map((q,i)=>({questionId:q.id,optionId:i<n?'3':'1'}));

test('one-second boundary is strict; only server-designated admin tests and instructed checks bypass timing', () => {
  for(const ms of [0,1,999,999.99]) assert.equal(fast(questions[0],ms),true);
  for(const ms of [1000,1001,18000]) assert.equal(fast(questions[0],ms),false);
  assert.equal(fast(questions[0],10,true),false);
  assert.equal(fast({...questions[0],requiredOptionId:'1'},10),false);
  assert.equal(fast({...questions[0],pair:null},10),false);
});
test('neutral thresholds use strict 50 and 60 percent boundaries and nudge only after 20 responses', () => {
  assert.equal(neutral(questions,[]).shouldBlock,false);
  assert.equal(neutral(questions,answers(10)).shouldNudge,false);
  assert.equal(neutral(questions,answers(11)).shouldNudge,true);
  assert.equal(neutral(questions,answers(12)).shouldBlock,false);
  assert.equal(neutral(questions,answers(13)).shouldBlock,true);
  assert.equal(neutral(questions,answers(19).slice(0,19)).shouldNudge,false);
});
test('check items, non-pairs, incomplete and foreign answers do not distort the neutral share', () => {
  const extra=[{...questions[0],id:'check',requiredOptionId:'3'},{...questions[0],id:'other',pair:null},{...questions[0],id:'two',options:[{id:'1'},{id:'3'}]}];
  const result=neutral([...questions,...extra], [...answers(12),...extra.map(q=>({questionId:q.id,optionId:'3'})),{questionId:'unknown',optionId:'3'}]);
  assert.equal(result.share,0.6);assert.equal(result.shouldBlock,false);assert.equal(result.questionIds.length,12);
  const revised=answers(13);revised[0].optionId='1';
  assert.equal(neutral(questions,revised).shouldBlock,false);
  assert.equal(neutral(questions,[{questionId:'0',optionId:'foreign'}]).share,0);
});
