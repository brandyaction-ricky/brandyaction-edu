import { test, expect } from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.route('**/api/conversion/marketing**',r=>r.fulfill({json:{revision:0,candidates:[],selected:[]}}));
  await page.route('**/api/conversion/readiness**',r=>r.fulfill({json:{state:'ready',steps:[]}}));
  await page.route('**/api/conversion/followup**',r=>r.fulfill({json:{drafts:[],audienceState:'unmapped',counts:null}}));
  await page.route('**/api/conversion/broadcast**',r=>r.fulfill({json:{sessions:[],offerReady:false,counts:[]}}));
});
test('cohort totals and applicant purchases are separate; catalog filters preserve eligible choices',async({page})=>{
  const totals={orders:110,buyers:108,gross:165000000,refunds:1800000,net:163200000,needs_review:2,as_of:'2026-10-12T03:00:00Z'};
  await page.route(/\/api\/conversion\/webinar(?:\?|$)/,r=>r.fulfill({json:{campaign:{id:'33333333-3333-4333-8333-333333333333',freeCourse:'22222222-2222-4222-8222-222222222222',paidCohort:'cohort',enabled:true,revision:1},registrations:0,purchase_state:'ready',cohortPurchases:totals,purchases:{...totals,orders:0,buyers:0,gross:0,refunds:0,net:0,needs_review:0}}}));
  await page.goto('/marketing-qa-test');
  const free=page.getByRole('combobox',{name:'웨비나 무료 상품',exact:true});
  await expect(free.locator('option')).toHaveText(['공개된 무료 상품 선택','합성 무료 교육']);
  await expect(page.getByRole('combobox',{name:'구매를 확인할 유료 기수',exact:true}).locator('option')).toHaveText(['미연결 · 확정 후 연결','합성 유료 교육 · 4기']);
  await page.getByLabel('시험용 이름의 상품도 표시').check(); await expect(free.locator('option')).toContainText(['공개된 무료 상품 선택','합성 무료 교육','QA 테스트 무료 교육']);
  await page.getByRole('button',{name:'2. 신청·구매 현황',exact:true}).click();
  await expect(page.getByRole('region',{name:'연결 기수 전체 결제',exact:true})).toContainText('110건 · 108명');
  await expect(page.getByRole('region',{name:'신청자 중 결제',exact:true})).toContainText('결제 주문 0건');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('automations show overlaps and scoped delivery evidence; cancel prevents duplicate activation save',async({page})=>{
  let writes=0;await page.route('**/api/platform/workflows',r=>{writes++;return r.fulfill({json:{ok:true}});});
  await page.goto('/marketing-qa-test?section=automations');
  await expect(page.getByRole('alert')).toContainText('중복 발송 가능성');
  await expect(page.getByText('처리 완료 1 · 접수 1 · 실패 1',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'문자 발송 설정 관리 →'})).toHaveAttribute('href','/admin/campaigns#sms-settings');
  await expect(page.getByRole('button',{name:'문자 설정 저장'})).toHaveCount(0);
  await page.getByRole('row').filter({hasText:'합성 결제 안내'}).getByRole('button',{name:'수정',exact:true}).click();
  page.once('dialog',async d=>{expect(d.message()).toContain('중복 발송');await d.dismiss();});
  await page.getByRole('button',{name:'저장하기',exact:true}).click();expect(writes).toBe(0);
});
test('campaign scheduling uses KST on a non-Korean device and exposes the single SMS editor',async({page})=>{
  const writes:Record<string,unknown>[]=[];await page.route('**/api/platform/workflows',r=>{writes.push(r.request().postDataJSON());return r.fulfill({json:{ok:true}});});
  await page.goto('/marketing-qa-test?section=campaigns#sms-settings');
  await expect(page.getByRole('heading',{name:'문자 발송 설정',exact:true})).toBeVisible();
  await page.getByLabel('캠페인 이름',{exact:true}).fill('합성 예약');await page.getByRole('combobox',{name:'템플릿',exact:true}).selectOption('template');
  await page.getByLabel('예약 시각 (한국시간 KST)',{exact:true}).fill('2030-01-01T12:00');
  await page.getByRole('button',{name:'캠페인 예약',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);expect(writes[0].scheduledAt).toBe('2030-01-01T03:00:00.000Z');
});
