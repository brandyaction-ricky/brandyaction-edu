import {test,expect} from '@playwright/test';
test('designated alumni coupon survives save and reopen',async({page})=>{
 await page.route('**/api/coupons?history=*',route=>route.fulfill({json:{rows:[],count:0}}));
 await page.goto('/coupons-test');await page.getByRole('button',{name:'쿠폰 만들기'}).click();
 await page.getByLabel('쿠폰명 *',{exact:true}).fill('기존 수강생 할인');await page.getByLabel('쿠폰 코드 *',{exact:true}).fill('ALUMNI_QA');
 const check=page.getByRole('checkbox',{name:/기존 수강생 전용 쿠폰/});await expect(check).not.toBeChecked();await check.check();
 await page.getByRole('button',{name:'저장하기',exact:true}).click();
 expect(JSON.parse(await page.getByLabel('저장된 쿠폰').innerText()).is_alumni).toBe(true);
 await page.getByRole('button',{name:'쿠폰 만들기'}).click();await expect(check).toBeChecked();
 expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});
test('missing-source coverage shows threshold and configuration/errors without a false success',async({page},info)=>{
 let coverage:Record<string,unknown>={state:'ready',total:20,unknown:6,rate:30,overTarget:true};
 await page.route('**/api/conversion/webinar?*',route=>route.fulfill({json:{campaign:{id:'11111111-1111-4111-8111-111111111111',freeCourse:'22222222-2222-4222-8222-222222222222',paidCohort:'33333333-3333-4333-8333-333333333333',enabled:true,revision:1},registrations:10,purchases:null,purchase_state:'ready',sourceCoverage:coverage}}));
 await page.goto('/webinar-admin-test');await expect(page.getByText('전체 20건 중 미기록 6건 · 30%')).toBeVisible();
 await expect(page.getByText('목표 10%를 넘었습니다. 상품·문자의 결제 링크를 확인해 주세요.')).toBeVisible();
 await page.getByText('모집 기간 결제 유입',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:info.outputPath('entry-source-coverage.png')});
 coverage={state:'ready',total:0,unknown:0,rate:null,overTarget:null};await page.getByRole('button',{name:'신청·구매 기록 새로고침'}).click();
 await expect(page.getByText('결제가 생기면 비율을 확인할 수 있습니다.')).toBeVisible();await expect(page.getByText('목표 10% 이하입니다.')).toHaveCount(0);
 coverage={state:'unconfigured'};await page.getByRole('button',{name:'신청·구매 기록 새로고침'}).click();await expect(page.getByText('상품 설정에서 모집 시작과 마감을 먼저 지정해 주세요.')).toBeVisible();
 coverage={state:'unavailable'};await page.getByRole('button',{name:'신청·구매 기록 새로고침'}).click();await expect(page.getByText('유입 비율을 확인하지 못했습니다. 새로고침해 주세요.')).toBeVisible();
});
