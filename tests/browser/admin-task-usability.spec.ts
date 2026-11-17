import {test,expect} from '@playwright/test';
test('mobile order filters show their values and every record action is reachable without horizontal scrolling',async({page})=>{
 await page.setViewportSize({width:320,height:844});await page.goto('/admin-ux-audit-test?menu=orders');
 const state=page.getByRole('combobox',{name:'결제 상태',exact:true});expect((await state.boundingBox())!.width).toBeGreaterThan(120);
 const action=page.getByRole('table').getByRole('button',{name:'상세',exact:true});await action.scrollIntoViewIfNeeded();const rect=(await action.boundingBox())!;expect(rect.x+rect.width).toBeLessThanOrEqual(320);
});
test('mobile question selection focuses the detail and returns to the selected list item without writes',async({page})=>{
 await page.setViewportSize({width:390,height:844});const writes:string[]=[];page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});await page.goto('/admin-ux-audit-test?menu=questions');
 const selected=page.locator('.question-inbox-item').nth(1);await selected.click();const detail=page.getByRole('article',{name:'선택한 질문 상세'});await expect(detail).toBeFocused();expect((await detail.boundingBox())!.y).toBeGreaterThanOrEqual(60);expect((await detail.boundingBox())!.y).toBeLessThan(180);
 await page.getByRole('button',{name:'← 질문 목록으로'}).click();await expect(selected).toBeFocused();await expect(selected).toHaveAttribute('aria-pressed','true');expect(writes).toEqual([]);
});
test('related navigation expands all existing routes and keeps the current group available',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/admin-ux-audit-test?menu=seo');const nav=page.getByRole('navigation',{name:'마케팅 작업 빠른 이동'});await expect(nav.getByRole('link',{name:'검색코드 설정'})).toBeVisible();await expect(nav.getByRole('link',{name:'캠페인 발송'})).toBeHidden();await page.getByRole('button',{name:'관련 메뉴 펼치기'}).click();await expect(nav.getByRole('link')).toHaveCount(9);await expect(nav.getByRole('link',{name:'캠페인 발송'})).toHaveAttribute('href','/admin/campaigns');await page.getByRole('button',{name:'관련 메뉴 접기'}).click();await expect(nav.locator('[aria-current=page]')).toBeVisible();
});
test('diagnosis search precedes metrics; staff save context and catalogue search scope remain visible',async({page})=>{
 await page.goto('/admin-ux-audit-test?menu=diagnosis-management');expect((await page.getByLabel('수강생 검색').boundingBox())!.y).toBeLessThan((await page.getByRole('region',{name:'진단 대상 범위 요약'}).boundingBox())!.y);
 await page.goto('/admin-ux-audit-test?menu=staff');await expect(page.locator('.admin-permission-save')).toContainText('합성 운영자');await expect(page.locator('.admin-permission-save')).toContainText('일반 회원');
 await page.goto('/admin-ux-audit-test?menu=coupons');await expect(page.locator('.admin-search-scope')).toContainText('현재 페이지에 불러온 항목');
});

test('mobile record cards contain their content and do not overlap pagination',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const menu of ['members','orders','templates']){
  await page.goto('/admin-ux-audit-test?menu='+menu);
  const table=page.locator('table.admin-mobile-cards');await expect(table).toBeVisible();
  const bounds=await table.evaluate(el=>{const t=el.getBoundingClientRect();return {bottom:t.bottom,cells:[...el.querySelectorAll('tbody td')].map(c=>{const r=c.getBoundingClientRect();return {top:r.top,bottom:r.bottom,children:[...c.children].map(x=>x.getBoundingClientRect().bottom)}})}});
  for(const cell of bounds.cells){expect(cell.bottom).toBeLessThanOrEqual(bounds.bottom+1);for(const childBottom of cell.children)expect(childBottom).toBeLessThanOrEqual(cell.bottom+1);}
  if(menu==='members'){for(const button of await table.locator('thead button').all()){const box=(await button.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}expect((await page.locator('.participant-pagination').boundingBox())!.y).toBeGreaterThanOrEqual(bounds.bottom);await expect(table.locator('[data-label="관리"]')).toContainText('재제출 확인');}
 }
});
