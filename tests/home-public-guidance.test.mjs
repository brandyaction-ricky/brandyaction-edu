import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const {outputFiles} = buildSync({entryPoints:['lib/home-public-guidance.ts'], bundle:true, platform:'node',format:'cjs',write:false});
const bundledModule = {exports:{}};
new Function('module','exports',outputFiles[0].text)(bundledModule,bundledModule.exports);
const {productFacts} = bundledModule.exports;
const course = {id:'course',slug:'moonshot',title:'문샷',status:'published',category:'paid_class',list_price:123000,
  duration_label:'6주',schedule_label:'기수별',metadata:{detail_html:'Q. 윈도우에서 되나요? A. 윈도우도 가능해요. Q. 지인 혜택이 있나요? A. 10% 할인이에요.'}};
const cohort = {id:'old',course_id:'course',name:'5기',price:120000,status:'recruiting',recruitment_end_at:'2026-11-10T12:00:00Z'};
const now = Date.parse('2026-11-12T12:00:00Z');

test('지난 달 가격과 홍보문 할인은 현재 신청 조건에 섞이지 않는다',()=>{
  const facts = productFacts(course,[cohort],now);
  assert.ok(facts.some(f=>f.text.includes('지금 신청 가능한 기수가 없어요')));
  assert.ok(facts.some(f=>f.text.includes('모집 당시') && f.text.includes('120,000원')));
  assert.ok(facts.some(f=>f.text.includes('윈도우도 가능')));
  assert.ok(facts.every(f=>!f.text.includes('10%') && !f.text.includes('123,000') && f.url.endsWith('/classes/moonshot')));
});
test('새 기수의 모집가가 바뀌면 현재 가격도 따라서 바뀐다',()=>{
  const next = {...cohort,id:'new',name:'6기',price:200000,recruitment_end_at:'2026-12-03T00:00:00Z'};
  for(const price of [200000,180000]) {
    assert.ok(productFacts(course,[cohort,{...next,price}],now).some(f=>f.text.includes('6기의 공개 신청 금액은 '+price.toLocaleString('ko-KR')+'원')));
  }
});
test('숨긴 상품과 비공개 상품은 답변 근거에서 빠진다',()=>{
  assert.deepEqual(productFacts({...course,status:'draft'},[cohort],now),[]);
  assert.deepEqual(productFacts({...course,metadata:{is_listed:false}},[cohort],now),[]);
});

test('홈페이지와 상담 API에 적용하는 공개 조건', () => {
  const result = buildSync({entryPoints:['lib/home-consultation-enabled.ts'], bundle:true, platform:'node', format:'cjs', write:false});
  const mod = {exports:{}};
  new Function('module','exports',result.outputFiles[0].text)(mod,mod.exports);
  const enabled = mod.exports.homeConsultationEnabled;
  const production = {VERCEL_ENV:'production', OPENAI_API_KEY:'fixture'};
  assert.equal(enabled(production), false);
  assert.equal(enabled({...production, EDU_HOME_CONSULTATION_ENABLED:'true'}), true);
  assert.equal(enabled({VERCEL_ENV:'preview', OPENAI_API_KEY:'fixture'}), true);
  assert.equal(enabled({VERCEL_ENV:'production', EDU_HOME_CONSULTATION_ENABLED:'true'}), false);
});
