import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTerms} from '../lib/toss-installments.ts';
const cell=(x,y,s)=>({x,y,s});
const sample=[cell(100,900,'2026. 11. 01 ~ 2026. 11. 30'),cell(100,885,'온라인 PG / 결제 금액 5만원 이상 적용'),cell(20,800,'현대'),cell(100,800,'2~3개월'),cell(20,600,'카드사 부분 무이자 할부'),cell(20,514,'현대'),cell(60,519,'10개월'),cell(110,519,'1~5회차'),cell(180,519,'6~10회차'),cell(60,508,'12개월'),cell(110,508,'1~6회차'),cell(180,508,'7~12회차'),cell(20,300,'유의사항')];
test('전액과 부분 무이자 표를 구분하고 병합 셀의 카드명을 회차에 연결한다',()=>{
 const t=parseTerms(sample,'2026-11-30'); assert.deepEqual(t.full,[{card:'현대',lo:2,hi:3}]); assert.deepEqual(t.partial.at(-1),{card:'현대',lo:12,hi:12,pays:'1~6회차'});
});
test('종료된 행사·판독할 수 없는 고객부담 표는 안내하지 않는다',()=>{
 assert.throws(()=>parseTerms(sample,'2026-12-01'));assert.throws(()=>parseTerms(sample.filter(c=>c.s!=='1~6회차'),'2026-11-13'));
});
