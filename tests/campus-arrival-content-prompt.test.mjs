import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const entry = fileURLToPath(new URL('../features/campus/arrival/content-station-prompt.ts', import.meta.url));
const {outputFiles} = await build({entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false});
const {buildContentExperiencePrompt, buildContentStationPrompt, parseContentStationDraft, reuseContentStationAnswers, CONTENT_EXPERIENCE_LIMIT, CONTENT_STATION_EXAMPLE, CONTENT_STATION_LIMITS} =
  await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

const realInputs = {
  product: '반려동물 출장 사진 촬영', competitor: 'https://example.com/studio',
  customer: '고령 반려견의 보호자', facts: '익숙한 집에서 촬영. 최근 문의: 배경 천을 가져오나요?',
};

test('the content prompt requires the product and competitor but can ask about missing details', () => {
  assert.equal(buildContentStationPrompt({...realInputs, product: ' '}), '');
  assert.equal(buildContentStationPrompt({...realInputs, competitor: ''}), '');
  const prompt = buildContentStationPrompt({...realInputs, customer: '', facts: ' '});
  assert.match(prompt, /고객: 아직 정하지 않았어/);
  assert.match(prompt, /실제 고객 질문과 내 상품 가이드를 물어봐줘/);
});

test('the content prompt keeps submitted facts and requires sources, consent and review', () => {
  const prompt = buildContentStationPrompt(realInputs);
  for (const value of Object.values(realInputs)) assert.ok(prompt.includes(value));
  for (const instruction of ['어느 곳인지 물어보고', 'URL과 확인 날짜', '리뷰 원문', '사실과 해석·가설', '고를 때까지 기다려줘', '장면표', '행동 유도 문구(CTA)', '제작 요청문', '공개 전에 검수']) assert.ok(prompt.includes(instruction));
});

test('fictional materials stay fictional after editing a different field', () => {
  const prompt = buildContentStationPrompt({...CONTENT_STATION_EXAMPLE, customer: '처음 마스크팩을 쓰는 고객'});
  assert.match(prompt, /가상 실습이야/);
  assert.match(prompt, /해당 업체를 검색하거나 실제 조사처럼 설명하지 말고/);
  assert.match(prompt, /가상 리뷰: 오래 붙이면 얼굴이 당겨요/);
  assert.match(prompt, /처음 마스크팩을 쓰는 고객/);
  assert.doesNotMatch(prompt, /공개 광고와 리뷰부터 검토/);
});

test('content draft restores typed data and only resumes a generated request with all required inputs', () => {
  for (const requestReady of [true, false]) {
    assert.deepEqual(parseContentStationDraft({inputs: realInputs, requestReady}), {
      path:'product', inputs:realInputs, requestReady, experience:'', experienceRequestReady:false,
    });
  }
  assert.deepEqual(parseContentStationDraft({
    inputs: {product: '  입력 중 ', competitor: null, customer: '고객'.repeat(240), facts: '두 줄\r\n이어서\u0000'},
    requestReady: true,
  }), {
    inputs: {product: '  입력 중 ', competitor: '', customer: '고객'.repeat(CONTENT_STATION_LIMITS.customer / 2), facts: '두 줄\n이어서'},
    path: 'product', requestReady: false, experience: '', experienceRequestReady: false,
  });
  assert.equal(parseContentStationDraft({inputs: realInputs, requestReady: 'true'}).requestReady, false);
});

test('the first content plan only requires past experience and asks for examples with real sources', () => {
  assert.equal(buildContentExperiencePrompt(' \n\t'), '');
  const prompt = buildContentExperiencePrompt('  신규 입사자에게 업무를 알려줬어요.  ');
  assert.match(prompt, /\[내가 해본 일\]\n신규 입사자에게 업무를 알려줬어요\./);
  for (const instruction of ['2~3명', '직접 확인한 게시물 링크와 제목', '지어내지 말고 검색어', '추정이라고 표시', '제목 하나, 첫 문장 하나, 본문에 담을 내용 세 가지', '경험이나 성과는 만들지 말아줘']) {
    assert.ok(prompt.includes(instruction));
  }
  assert.doesNotMatch(prompt, /반려동물 출장 사진 촬영|마스크팩/);
});

test('both content drafts survive with separate readiness and selection', () => {
  assert.deepEqual(parseContentStationDraft({path:'experience', inputs:realInputs, requestReady:true,
    experience:'했던 일\r\n정리\u0000', experienceRequestReady:true}), {
    path:'experience', inputs:realInputs, requestReady:true, experience:'했던 일\n정리', experienceRequestReady:true,
  });
  assert.equal(parseContentStationDraft({experience:'경'.repeat(CONTENT_EXPERIENCE_LIMIT + 10)}).experience.length, CONTENT_EXPERIENCE_LIMIT);
  assert.equal(parseContentStationDraft({path:'unknown'}).path, 'product');
  for (const state of [{experience:'  \n', experienceRequestReady:true}, {experience:'경험', experienceRequestReady:'true'}]) {
    assert.equal(parseContentStationDraft(state).experienceRequestReady, false);
  }
});

test('business exercise can reuse relevant content fields without changing existing work or using sample research', () => {
  const empty = {a: '', b: ''};
  const both = reuseContentStationAnswers(realInputs, empty);
  assert.deepEqual(both, {a: `${realInputs.product}\n주요 고객: ${realInputs.customer}`, b: realInputs.facts});
  assert.deepEqual(reuseContentStationAnswers(realInputs, {a: '새로 입력한 상품', b: ''}), {a: '새로 입력한 상품', b: realInputs.facts});
  assert.deepEqual(reuseContentStationAnswers(realInputs, {a: ' ', b: '직접 적은 장점'}), {...both, b: '직접 적은 장점'});
  assert.equal(reuseContentStationAnswers(realInputs, both), both);
  assert.equal(reuseContentStationAnswers({...CONTENT_STATION_EXAMPLE, customer: '변경한 고객'}, empty), empty);
  assert.equal(reuseContentStationAnswers({product: '', competitor: realInputs.competitor, customer: '', facts: ''}, empty), empty);
});
