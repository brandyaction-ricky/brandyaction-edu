import { expect, test } from '@playwright/test';
const id='00000000-0000-4000-8000-000000000001';
test('partial refund starts blank, checks balance and sends the confirmed amount once',async({page},info)=>{
 let cancelled=100000;const calls:Record<string,unknown>[]=[];
 await page.route('**/api/platform?**',route=>route.fulfill({json:{user:{id,role:'admin'},data:{
  orders:[{id,order_number:'QA-PARTIAL',user_id:id,customer_name:'합성 환불 회원',status:'partially_refunded',total_amount:1000000}],
  payments:[{id,order_id:id,status:'partial_cancelled',method:'카드',approved_amount:1000000,cancelled_amount:cancelled}],edu_refund_requests:[],
 },pagination:{page:1,pageSize:100,total:1}}}));
 await page.route('**/api/platform/workflows',async route=>{const body=route.request().postDataJSON();calls.push(body);cancelled+=body.amount;await route.fulfill({json:{ok:true}});});
 await page.goto('/public-data-test?publicScreen=admin/orders');
 await page.getByRole('button',{name:'상세',exact:true}).click();
 const dialog=page.getByRole('dialog');const amount=dialog.getByLabel('이번에 환불할 금액 · 원');const confirm=dialog.getByRole('button',{name:'환불 내용 확인',exact:true});
 await expect(amount).toHaveValue('');await expect(confirm).toBeDisabled();
 await expect(dialog).toContainText('환불 가능액 900,000원');
 for(const value of ['900001','0','1.5']){await amount.fill(value);await expect(confirm).toBeDisabled();}
 await amount.fill('100000');await dialog.getByLabel('환불 사유',{exact:true}).fill('합성 부분 환불');
 await expect(dialog.getByRole('status').filter({hasText:'부분 환불: 수강권을 유지합니다.'})).toBeVisible();
 await expect(dialog).toContainText('환불 후 잔액 800,000원');
 await dialog.screenshot({path:info.outputPath('partial-refund.png')});
 page.once('dialog',d=>d.dismiss());await confirm.click();expect(calls).toHaveLength(0);
 page.once('dialog',d=>{expect(d.message()).toContain('100,000원');return d.accept();});await confirm.click();
 await expect(amount).toHaveValue('');expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({action:'refund',paymentId:id,amount:100000,reason:'합성 부분 환불'});expect(calls[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
 await expect(dialog).toContainText('환불 가능액 800,000원');
 await dialog.getByRole('button',{name:'남은 금액 전액 입력'}).click();await expect(amount).toHaveValue('800000');
 await expect(dialog.getByRole('status').filter({hasText:'전액 환불: 해당 주문의 수강권을 회수합니다.'})).toBeVisible();expect(calls).toHaveLength(1);
});
test('unresolved refund offers reconciliation only, preserving its request identity',async({page})=>{
 const requests:Record<string,unknown>[]=[];
 await page.route('**/api/platform?**',route=>route.fulfill({json:{user:{id,role:'admin'},data:{orders:[{id,order_number:'QA-PENDING',user_id:id,status:'paid',total_amount:1000000}],payments:[{id,order_id:id,approved_amount:1000000,cancelled_amount:0}],edu_refund_requests:[{id,payment_id:id,status:'processing',amount:123456,reason:'합성 확인중'}]},pagination:{page:1,pageSize:100,total:1}}}));
 await page.route('**/api/platform/workflows',route=>{requests.push(route.request().postDataJSON());return route.fulfill({status:409,json:{error:'환불 결과 확인 중입니다.'}});});
 await page.goto('/public-data-test?publicScreen=admin/orders');await page.getByRole('button',{name:'상세',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('이번에 환불할 금액 · 원')).toHaveCount(0);
 await dialog.getByRole('button',{name:'결과 재확인',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('환불 결과 확인 중입니다.');expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({requestId:id,amount:123456,reason:'합성 확인중'});
});
test('administrator can enable, reopen and disable stacking; admin-free cannot stack',async({page},info)=>{
 await page.route('**/api/coupons?history=*',route=>route.fulfill({json:{rows:[],count:0}}));
 await page.goto('/coupons-test');await page.getByRole('button',{name:'쿠폰 만들기',exact:true}).click();
 const stack=page.getByLabel('다른 쿠폰과 중복 적용 가능',{exact:true});await expect(stack).not.toBeChecked();
 await page.getByLabel('쿠폰명 *',{exact:true}).fill('동반 추가 10만원');await page.getByLabel('쿠폰 코드 *',{exact:true}).fill('WITH_QA');
 await page.getByLabel('할인 방식').selectOption('fixed');await page.getByLabel('할인 수치 *').fill('100000');await stack.check();
 await page.getByLabel('회원별 사용 횟수').fill('');
 await page.locator('.coupon-limit-group').filter({has:page.getByRole('heading',{name:'다른 쿠폰과 함께 쓰기'})}).screenshot({path:info.outputPath('stackable-coupon.png')});
 await page.getByRole('button',{name:'저장하기',exact:true}).click();let saved=JSON.parse(await page.getByLabel('저장된 쿠폰').innerText());expect(saved.is_stackable).toBe(true);expect(saved.per_user_limit).toBeNull();
 await page.getByRole('button',{name:'쿠폰 만들기',exact:true}).click();await expect(stack).toBeChecked();await stack.uncheck();await page.getByRole('button',{name:'저장하기',exact:true}).click();saved=JSON.parse(await page.getByLabel('저장된 쿠폰').innerText());expect(saved.is_stackable).toBe(false);
 await page.getByRole('button',{name:'쿠폰 만들기',exact:true}).click();await stack.check();await page.getByLabel('할인 방식').selectOption('ADMIN_FREE');await expect(stack).not.toBeChecked();await expect(stack).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('checkout accepts three coupon codes and displays each allocation without paying',async({page},info)=>{
 await page.route('**/api/coupons',route=>{if(route.request().postDataJSON().action==='event-benefits')return route.fulfill({json:{quote:null}});expect(route.request().postDataJSON().code).toBe('BASE_QA+EXTRA_QA+RATE_QA');return route.fulfill({json:{couponCode:'BASE_QA+EXTRA_QA+RATE_QA',couponName:'쿠폰 중복 할인',couponDiscount:20000,totalAmount:60000,coupons:[{couponCode:'BASE_QA',couponName:'일반 쿠폰',couponDiscount:10000},{couponCode:'EXTRA_QA',couponName:'추가 쿠폰',couponDiscount:5000},{couponCode:'RATE_QA',couponName:'추가 정률 쿠폰',couponDiscount:5000}]}});});
 await page.route('**/fixture/order',()=>{throw Error('must not create an order');});
 await page.goto('/coupon-checkout-test?cohort='+id);await page.getByRole('button',{name:'쿠폰 등록하기',exact:true}).click();await page.getByLabel('쿠폰 코드',{exact:true}).fill('base_qa+extra_qa+rate_qa');await page.getByRole('button',{name:'등록',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('input[name=coupon]')).toHaveValue('BASE_QA+EXTRA_QA+RATE_QA');await expect(page.locator('.checkout-payment-summary .cost-total strong')).toHaveText('60,000원');
 await expect(page.getByText('추가 정률 쿠폰',{exact:true})).toBeVisible();await page.locator('section.panel').filter({has:page.getByRole('heading',{name:'쿠폰 할인',exact:true})}).screenshot({path:info.outputPath('stacked-checkout.png')});
});
