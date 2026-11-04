import { test, expect } from '@playwright/test';

const empty = {visitors:0,events:0,stages:{},paths:[],paidOrders:0,revenue:0};
test('analytics distinguishes loading, an empty period and a failed query; retry recovers', async ({page}) => {
  let mode = 'loading';
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release=resolve; });
  await page.route('**/api/platform/workflows?**', async route => {
    if(mode==='loading') await pending;
    await route.fulfill({status:mode==='error'?503:200,json:mode==='error'?{error:'합성 집계 조회 오류'}:empty});
  });
  await page.goto('/analytics-test');
  await expect(page.getByRole('status')).toHaveText('선택한 기간의 유입 성과를 조회하고 있습니다.');
  await expect(page.getByText('방문 세션',{exact:true})).toHaveCount(0);
  mode='empty'; release!();
  await expect(page.getByRole('status')).toContainText('기간 내 기록 없음');
  await expect(page.getByRole('alert')).toHaveCount(0);
  mode='error'; await page.getByRole('button',{name:'새로고침'}).click();
  await expect(page.getByRole('alert')).toContainText('합성 집계 조회 오류');
  await expect(page.getByText('방문 세션',{exact:true})).toHaveCount(0);
  await expect(page.getByText('기간 내 기록 없음',{exact:false})).toHaveCount(0);
  mode='empty'; await page.getByRole('button',{name:'새로고침'}).click();
  await expect(page.getByRole('status')).toContainText('기간 내 기록 없음');
});

test('analytics uses KST calendar bounds and does not label payment-only data empty', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-09-25T16:00:00Z'));
  let requested: URL | undefined;
  await page.route('**/api/platform/workflows?**', async route => {
    requested=new URL(route.request().url());
    await route.fulfill({json:{...empty,paidOrders:2,revenue:25000}});
  });
  await page.goto('/analytics-test');
  await expect(page.getByText('기간 내 결제 완료',{exact:true})).toBeVisible();
  await expect(page.getByLabel('시작일 (한국 시간)')).toHaveValue('2026-08-28');
  await expect(page.getByLabel('종료일')).toHaveValue('2026-09-26');
  expect(requested!.searchParams.get('from')).toBe('2026-08-28T00:00:00+09:00');
  expect(requested!.searchParams.get('to')).toBe('2026-09-26T15:00:00.000Z');
  await expect(page.getByText('25,000원',{exact:true})).toBeVisible();
  await expect(page.getByText('기간 내 기록 없음',{exact:false})).toHaveCount(0);
  await expect(page.getByText('기간 내 페이지별 참여 기록이 없습니다.')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('analytics validates dates before querying and offers quick periods and page search', async ({ page }) => {
  let requests=0;
  await page.route('**/api/platform/workflows?**',async route=>{requests++;await route.fulfill({json:{...empty,visitors:5,paths:[{path:'/classes/example',views:5,visitors:3,clicks:2},{path:'/articles/example',views:2,visitors:2,clicks:0}]}});});
  await page.goto('/analytics-test');
  await expect(page.getByRole('table',{name:'페이지별 유입 성과'})).toBeVisible();
  await page.getByRole('button',{name:'7일',exact:true}).click();
  await expect(page.getByRole('button',{name:'7일',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('searchbox',{name:'페이지 주소 검색'}).fill('/articles');
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('시작일 (한국 시간)').fill('2099-01-01');
  await expect(page.getByRole('alert')).toContainText('종료일은 시작일 이후');
  const count=requests;
  await page.getByLabel('종료일').fill('2020-01-01');
  await expect(page.getByRole('alert')).toContainText('종료일은 시작일 이후');
  expect(requests).toBe(count);
});
