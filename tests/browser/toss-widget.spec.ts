import { test, expect } from '@playwright/test';

test.skip(process.env.FIXTURE_TOSS_WIDGET_ENABLED !== 'true', 'Widget fixture is opt-in.');
const cohort = '00000000-0000-4000-8000-000000000001';
test('manual deposit stays available with the widget and copying the account never submits an order', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  let orders = 0;
  await page.route('**/fixture/order', async route => { orders++; await route.fulfill({json:{error:'No order expected'}}); });
  await page.goto('/coupon-checkout-test?cohort='+cohort);
  await expect(page.getByRole('heading',{name:'계좌이체로 수강하시려면',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'입금 후 카카오톡 채널 문의'})).toHaveAttribute('href','http://pf.kakao.com/_ydxjhxj/chat');
  await page.getByRole('button',{name:'계좌번호 복사',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('계좌번호를 복사했습니다.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('954201-00-094916');
  expect(orders).toBe(0);
});

test('widget uses the quoted amount, and never requests payment if the order amount changes', async ({page}) => {
  const amounts: number[] = [];
  let requested = 0;
  await page.route('**/fixture/toss-amount', async route => { amounts.push(route.request().postDataJSON().value); await route.fulfill({json:{ok:true}}); });
  await page.route('**/fixture/toss', async route => { requested++; await route.fulfill({json:{ok:true}}); });
  await page.route('**/fixture/order', route => route.fulfill({json:{orderId:'order',orderNumber:'EDU-WIDGET-QA',totalAmount:71000}}));
  await page.route('**/api/coupons**', route => route.fulfill({json:{couponCode:'NORMAL_QA',couponName:'등록한 할인 쿠폰',couponDiscount:8000,totalAmount:72000}}));
  await page.goto('/coupon-checkout-test?cohort='+cohort);
  await expect(page.getByText('테스트 결제수단')).toBeVisible();
  await page.getByRole('button',{name:'쿠폰 등록하기',exact:true}).click();
  await page.getByLabel('쿠폰 코드',{exact:true}).fill('NORMAL_QA');
  await page.getByRole('button',{name:'등록',exact:true}).click();
  await expect.poll(() => amounts.at(-1)).toBe(72000);
  await page.locator('input[name="agreement"]').check();
  await page.getByRole('button',{name:'결제하기',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('결제 금액이 변경됐습니다');
  expect(requested).toBe(0);
});

test('widget requests payment only after matching the server amount', async ({page}) => {
  await page.route('**/fixture/toss-amount',route=>route.fulfill({json:{ok:true}}));
  await page.route('**/fixture/order',route=>route.fulfill({json:{orderId:'order',orderNumber:'EDU-WIDGET-QA',totalAmount:80000}}));
  await page.route('**/fixture/toss',route=>route.fulfill({json:{ok:true}}));
  await page.goto('/coupon-checkout-test?cohort='+cohort);
  await page.locator('input[name="agreement"]').check();
  const pending=page.waitForRequest('**/fixture/toss');
  await page.getByRole('button',{name:'결제하기',exact:true}).click();
  const request=(await pending).postDataJSON();
  expect(request.orderId).toBe('EDU-WIDGET-QA');
  expect(request.successUrl).toContain('integration=widget');
  expect(request.method).toBeUndefined();
});

test('changing a coupon while the order is being created cannot start a payment', async ({page}) => {
  let releaseOrder!: () => void;
  const orderHeld = new Promise<void>(resolve => { releaseOrder = resolve; });
  let orderStarted!: () => void;
  const orderRequest = new Promise<void>(resolve => { orderStarted = resolve; });
  let requested = 0;
  await page.route('**/fixture/toss-amount', route => route.fulfill({json:{ok:true}}));
  await page.route('**/fixture/toss', async route => { requested++; await route.fulfill({json:{ok:true}}); });
  await page.route('**/fixture/order', async route => { orderStarted(); await orderHeld; await route.fulfill({json:{orderId:'order',orderNumber:'EDU-WIDGET-QA',totalAmount:80000}}); });
  await page.route('**/api/coupons**', route => route.fulfill({json:{couponCode:'NORMAL_QA',couponName:'등록한 할인 쿠폰',couponDiscount:8000,totalAmount:72000}}));
  await page.goto('/coupon-checkout-test?cohort='+cohort);
  await page.locator('input[name="agreement"]').check();
  await page.getByRole('button',{name:'결제하기',exact:true}).click();
  await orderRequest;
  await page.getByRole('button',{name:'쿠폰 등록하기',exact:true}).click();
  await page.getByLabel('쿠폰 코드',{exact:true}).fill('NORMAL_QA');
  await page.getByRole('button',{name:'등록',exact:true}).click();
  await expect(page.getByText('등록한 할인 쿠폰', {exact:true})).toBeVisible();
  releaseOrder();
  await expect(page.getByRole('alert')).toContainText('결제 금액이 변경됐습니다');
  expect(requested).toBe(0);
});
