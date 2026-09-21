import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('**/api/webinar/attendance**',route=>route.fulfill({json:{sessions:[]}}));
 await page.route('**/api/conversion/webinar-attendance**',route=>route.fulfill({json:{sessions:[],unique:0,both:0}}));
});
test('cohortless application requires explicit agreement, displays success and reloads without duplicate submit',async({page})=>{
 let registered=false,writes=0;
 await page.route(/\/api\/webinar(?:\?|$)/,async route=>{
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
 await page.route(/\/api\/conversion\/webinar(?:\?|$)/,async route=>{
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
test('registered member explicitly checks first live once; YouTube open is not attendance and encore stays closed',async({page})=>{
 let checked=false,writes=0;
 await page.route(/\/api\/webinar(?:\?|$)/,route=>route.fulfill({json:{authenticated:true,revision:1,policy:'2026-08-11',registered:true}}));
 await page.route('**/api/webinar/attendance**',async route=>{
  if(route.request().method()==='POST'){expect(route.request().postDataJSON().phase).toBe('first');checked=true;writes++;}
  return route.fulfill({json:{sessions:[{phase:'first',url:'https://www.youtube.com/watch?v=abcdefghijk',open:true,revision:2,checked},{phase:'encore',url:null,open:false,revision:1,checked:false}]}});
 });
 await page.goto('/webinar-test');await expect(page.getByRole('button',{name:'첫 웨비나 출석 확인',exact:true})).toBeVisible();expect(writes).toBe(0);
 await expect(page.getByRole('link',{name:'첫 웨비나 YouTube 열기'})).toHaveAttribute('href','https://www.youtube.com/watch?v=abcdefghijk');
 await expect(page.getByRole('button',{name:'앵콜 라이브 출석 확인',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'첫 웨비나 출석 확인',exact:true}).click();await expect(page.getByText('첫 웨비나 출석 확인 완료',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('첫 웨비나 출석 확인 완료',{exact:true})).toBeVisible();expect(writes).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('admin saves phase settings and closes attendance while retaining counts',async({page})=>{
 const code='33333333-3333-4333-8333-333333333333';let session={phase:'first',url:'https://www.youtube.com/watch?v=abcdefghijk',open:true,revision:1,count:1};let writes=0;
 await page.route(/\/api\/conversion\/webinar(?:\?|$)/,route=>route.fulfill({json:{campaign:{id:code,freeCourse:'22222222-2222-4222-8222-222222222222',paidCohort:null,enabled:true,revision:1},registrations:1,purchases:null,purchase_state:'unmapped'}}));
 await page.route('**/api/conversion/webinar-attendance**',async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();expect(body.phase).toBe('first');expect(body.expected).toBe(1);session={...session,open:body.open,revision:2};writes++;}
  return route.fulfill({json:{sessions:[session],unique:1,both:0}});
 });
 await page.goto('/webinar-admin-test');await expect(page.getByLabel('첫 웨비나 YouTube 주소',{exact:true})).toHaveAttribute('readonly','');
 await page.getByRole('checkbox',{name:'첫 웨비나 출석 접수 열기',exact:true}).uncheck();await page.getByRole('button',{name:'첫 웨비나 설정 저장',exact:true}).click();
 await expect(page.getByText('저장 상태: 접수 닫힘 · 버전 2 · 본인 출석 확인 1명',{exact:true})).toBeVisible();expect(writes).toBe(1);
 await expect(page.getByText('미설정 · 출석 확인 집계 전',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
