import { expect, test } from '@playwright/test';
const cohort='00000000-0000-4000-8000-000000000001';
test('coupon drawer preserves admin defaults, multiple products and KST after save/reopen',async({page})=>{
  await page.route('**/api/coupons?history=*',route=>route.fulfill({json:{rows:[],count:0}}));
  await page.goto('/coupons-test');await page.getByRole('button',{name:'쿠폰 만들기'}).click();
  await page.getByLabel('쿠폰명 *',{exact:true}).fill('QA 전체 무료');await page.getByLabel('쿠폰 코드 *',{exact:true}).fill('ADMIN_QA');
  await page.getByLabel('할인 방식').selectOption('ADMIN_FREE');
  await expect(page.getByLabel('할인 수치 *')).toHaveValue('100');
  await expect(page.getByLabel('총 발급 수량')).toHaveValue('');await expect(page.getByLabel('회원별 사용 횟수')).toHaveValue('');
  await page.getByRole('combobox',{name:'적용 상품',exact:true}).selectOption('specific');
  await page.getByLabel('합성 유료 상품',{exact:true}).check();await page.getByLabel('두 번째 합성 상품',{exact:true}).check();
  await page.getByLabel('발급 시작 · KST').fill('2026-09-27T20:00');
  await page.getByRole('button',{name:'저장하기',exact:true}).click();
  const saved=JSON.parse(await page.getByLabel('저장된 쿠폰').innerText());
  expect(saved.issue_start_at).toBe('2026-09-27T11:00:00.000Z');expect(saved.applicable_course_ids).toHaveLength(2);expect(saved.per_user_limit).toBeNull();expect(saved.exclude_free).toBe(true);
  await page.getByRole('button',{name:'쿠폰 만들기'}).click();await expect(page.getByLabel('발급 시작 · KST')).toHaveValue('2026-09-27T20:00');
  await expect(page.getByLabel('합성 유료 상품',{exact:true})).toBeChecked();
  await expect(page.getByLabel('두 번째 합성 상품',{exact:true})).toBeChecked();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

for (const discounted of [false,true]) test(`positive checkout ${discounted?'with coupon':'without coupon'} sends authoritative amount to mocked Toss`,async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const finalAmount=discounted?71000:80000;
  await page.route('**/api/coupons**',route=>route.fulfill({json:route.request().method()==='GET'?{coupons:[]}:{couponCode:'NORMAL_QA',couponDiscount:8000,totalAmount:72000}}));
  await page.route('**/fixture/order',route=>route.fulfill({json:{orderId:'positive-order',orderNumber:'EDU-COUPON-QA',totalAmount:finalAmount}}));
  await page.route('**/fixture/toss',route=>route.fulfill({json:{ok:true}}));
  await page.goto('/coupon-checkout-test?cohort='+cohort);
  if(discounted){await page.getByLabel('쿠폰 코드',{exact:true}).fill('NORMAL_QA');await page.getByRole('button',{name:'쿠폰 적용',exact:true}).click();await expect(page.locator('.checkout-payment-summary .checkout-discount-amount')).toHaveText('−8,000원');await expect(page.locator('.checkout-payment-summary .cost-total strong')).toHaveText('72,000원');}
  else await expect(page.locator('.checkout-payment-summary .cost-total strong')).toHaveText('80,000원');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  if(discounted) await page.locator('.checkout-payment-summary').screenshot({path:`/private/tmp/edu-coupon-summary-${testInfo.project.name}.png`});
  await page.locator('input[name="agreement"]').check();
  const payment=page.waitForRequest('**/fixture/toss');
  await page.getByRole('button',{name:/결제하기/}).click();
  const body=(await payment).postDataJSON();expect(body.amount.value).toBe(finalAmount);expect(body.method).toBe('CARD');expect(body.orderId).toBe('EDU-COUPON-QA');
  expect(errors).toEqual([]);
});
test('zero coupon checkout previews server amount, removes coupon and never loads Toss',async({page})=>{
  let orderCalls=0,tossCalls=0;
  page.on('request',r=>{if(/tosspayments\.com/.test(r.url()))tossCalls++;});
  await page.route('**/api/coupons**',async route=>route.fulfill({json:route.request().method()==='GET'?{coupons:[{couponCode:'ADMIN_QA',couponName:'QA 전체 무료'}]}:{couponCode:'ADMIN_QA',couponDiscount:80000,totalAmount:0}}));
  await page.route('**/fixture/order',async route=>{orderCalls++;expect(route.request().postDataJSON().coupon).toBe('ADMIN_QA');await route.fulfill({json:{orderId:'qa-order',totalAmount:0,free:true}});});
  await page.goto('/coupon-checkout-test?cohort='+cohort);
  await page.getByLabel('사용할 쿠폰').selectOption('ADMIN_QA');await page.getByRole('button',{name:'쿠폰 적용',exact:true}).click();
  await expect(page.getByText('최종 금액 0원 · 결제창 없이 신청을 완료합니다.')).toBeVisible();
  await page.getByRole('button',{name:'적용 취소',exact:true}).click();await expect(page.getByRole('heading',{name:'결제 수단',exact:true})).toBeVisible();
  await page.getByLabel('쿠폰 코드',{exact:true}).fill('ADMIN_QA');await page.getByRole('button',{name:'쿠폰 적용',exact:true}).click();
  await page.locator('input[name="agreement"]').check();await page.getByRole('button',{name:'무료로 신청 완료하기'}).click();
  await expect(page).toHaveURL(/\/applied\?order=qa-order/);expect(orderCalls).toBe(1);expect(tossCalls).toBe(0);
});
