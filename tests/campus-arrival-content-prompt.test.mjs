import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const entry = fileURLToPath(new URL('../features/campus/arrival/content-station-prompt.ts', import.meta.url));
const {outputFiles} = await build({entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false});
const {buildContentStationPrompt, CONTENT_STATION_EXAMPLE} = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

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
