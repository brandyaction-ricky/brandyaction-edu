import {test,expect} from '@playwright/test';
test('cohortless application requires explicit agreement, displays success and reloads without duplicate submit',async({page})=>{
 let registered=false,writes=0;
 await page.route('**/api/webinar**',async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();expect(body.agreed).toBe(true);expect(body.policy).toBe('2026-08-11');expect(body.user_id).toBeUndefined();registered=true;writes++;}
  return route.fulfill({json:{authenticated:true,revision:1,policy:'2026-08-11',registered}});
 });
 await page.goto('/webinar-test');
 const submit=page.getByRole('button',{name:'무료 웨비나 신청하기',exact:true});await expect(submit).toBeDisabled();expect(writes).toBe(0);
 await page.getByRole('checkbox').check();await submit.click();await expect(page.getByRole('heading',{name:'신청이 완료되었습니다.'})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'신청이 완료되었습니다.'})).toBeVisible();expect(writes).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('missing paid mapping remains unknown while free-only campaign saves and generates links',async({page})=>{
 let campaign:null|Record<string,unknown>=null;
 await page.route('**/api/conversion/webinar**',async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();expect(body.paidCohort).toBeNull();campaign={id:'33333333-3333-4333-8333-333333333333',...body,revision:1};}
  return route.fulfill({json:{campaign,registrations:0,purchases:null,purchase_state:'unmapped'}});
 });
 await page.goto('/webinar-admin-test');
 await page.getByRole('combobox',{name:'웨비나 무료 상품',exact:true}).selectOption('22222222-2222-4222-8222-222222222222');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'웨비나 신청 설정 저장'}).click();
 await expect(page.getByText('유료 기수 연결 전 · 구매 실적 미확인',{exact:true})).toBeVisible();
 await expect(page.getByLabel('광고 방 신청 링크',{exact:true})).toHaveValue(/\/paid$/);
 await expect(page.getByText('신청 0건 · 웨비나 실제 참여: 미확인',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
