import { expect, test } from '@playwright/test';
const source='11111111-1111-4111-8111-111111111111';
async function setup(page: import('@playwright/test').Page) {
 await page.route('**/api/platform?**part=curriculum',route=>route.fulfill({json:{data:{curriculum_weeks:[],curriculum_lessons:[],lesson_contents:[]}}}));
 await page.route('**/api/platform/curriculum-copy?**',route=>route.fulfill({json:new URL(route.request().url()).searchParams.has('source')?{preview:{sourceId:source,title:'이전 상품',revision:'a'.repeat(32),weeks:6,lessons:12,contents:10,missions:6,quizzes:2,resources:1}}:{sources:[{id:source,title:'이전 상품',course_code:'OLD'}],hasMore:false}}));
 await page.goto('/product-sale-test?draft=1');
 await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 await page.locator('summary').filter({hasText:'기존 커리큘럼 불러오기'}).click();
}
test('copy previews scope, retries with same request and stays private without product form submission',async({page})=>{
 await setup(page);
 const bodies: Record<string,unknown>[]=[];
 await page.route('**/api/platform/curriculum-copy',async route=>{
  bodies.push(route.request().postDataJSON());
  if(bodies.length===1)await route.fulfill({status:503,json:{error:'응답 지연 시험'}});
  else await route.fulfill({json:{result:{weeks:6}}});
 });
 await page.getByRole('button',{name:'원본 상품 선택'}).click();
 await page.getByRole('combobox',{name:'불러올 상품',exact:true}).selectOption(source);
 await expect(page.getByText('주차 6개 · 학습 12개 (콘텐츠 10개)')).toBeVisible();
 const copy=page.getByRole('button',{name:'비공개로 불러오기'});
 await copy.click();await expect(page.getByRole('alert')).toContainText('응답 지연 시험');
 await copy.click();await expect(page.getByRole('button',{name:'복사한 내용 새로고침'})).toBeVisible();
 expect(bodies).toHaveLength(2);expect(bodies[0].requestId).toBe(bodies[1].requestId);
 await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
});
test('copy is unavailable for existing curriculum and unsaved product changes',async({page})=>{
 await setup(page);
 await page.getByRole('tab',{name:'기본·판매',exact:true}).click();
 await page.getByRole('textbox',{name:'상품명 *',exact:true}).fill('아직 저장하지 않은 이름');
 await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 await expect(page.getByRole('button',{name:'원본 상품 선택'})).toBeDisabled();
 await page.goto('/product-sale-test');await page.getByRole('tab',{name:'커리큘럼',exact:true}).click();
 await page.locator('summary').filter({hasText:'기존 커리큘럼 불러오기'}).click();
 await expect(page.getByRole('button',{name:'원본 상품 선택'})).toBeDisabled();
});
