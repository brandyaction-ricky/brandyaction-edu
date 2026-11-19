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
  await expect(page.getByRole('status').first()).toContainText('선택한 기간의 유입 성과를 조회하고 있습니다.');
  await expect(page.getByText('방문 세션',{exact:true})).toHaveCount(0);
  mode='empty'; release!();
  await expect(page.getByRole('status').filter({hasText:'기간 내 기록 없음'})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  mode='error'; await page.getByRole('button',{name:'새로고침'}).click();
  await expect(page.getByRole('alert')).toContainText('합성 집계 조회 오류');
  await expect(page.getByText('방문 세션',{exact:true})).toHaveCount(0);
  await expect(page.getByText('기간 내 기록 없음',{exact:false})).toHaveCount(0);
  mode='empty'; await page.getByRole('button',{name:'새로고침'}).click();
  await expect(page.getByRole('status').filter({hasText:'기간 내 기록 없음'})).toBeVisible();
});

test('analytics uses KST calendar bounds and does not label payment-only data empty', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-09-25T16:00:00Z'));
  let requested: URL | undefined;
  await page.route('**/api/platform/workflows?**', async route => {
    requested=new URL(route.request().url());
    await route.fulfill({json:{...empty,paidOrders:2,revenue:25000}});
  });
  await page.goto('/analytics-test');
  await expect(page.getByText('결제 승인 주문',{exact:true})).toBeVisible();
  await expect(page.getByLabel('시작일 · KST')).toHaveValue('2026-08-28');
  await expect(page.getByLabel('종료일 · KST')).toHaveValue('2026-09-26');
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
  await page.getByRole('button',{name:'최근 7일',exact:true}).click();
  await expect(page.getByRole('button',{name:'최근 7일',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('searchbox',{name:'페이지 주소 검색'}).fill('/articles');
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('시작일 · KST').fill('2099-01-01');
  await expect(page.getByRole('alert')).toContainText('종료일은 시작일 이후');
  const count=requests;
  await page.getByLabel('종료일 · KST').fill('2020-01-01');
  await expect(page.getByRole('alert')).toContainText('종료일은 시작일 이후');
  expect(requests).toBe(count);
});

test('campus analysis is opened explicitly and does not replace or duplicate site filters',async({page})=>{
 let campusReads=0;
 await page.route('**/api/platform/workflows?**',r=>r.fulfill({json:empty}));
 await page.route('**/api/admin/campus/analytics?**',r=>{campusReads++;return r.fulfill({json:{sessions:3,activeSeconds:90,trackingEnabled:true,rooms:[],actions:[],resources:[],targets:[],scopes:[]}});});
 await page.goto('/analytics-test');await expect(page.getByText('기간 내 기록 없음',{exact:false})).toBeVisible();expect(campusReads).toBe(0);
 await page.getByRole('tab',{name:'문샷 캠퍼스 행동',exact:true}).click();await expect(page.getByRole('heading',{name:'문샷 캠퍼스 분석',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'새로고침',exact:true})).toHaveCount(1);await expect(page.getByLabel('시작일 · KST')).toHaveCount(0);await expect.poll(()=>campusReads).toBeGreaterThan(0);
 await page.getByRole('tab',{name:'사이트 유입·결제',exact:true}).click();await expect(page.getByLabel('시작일 · KST')).toBeVisible();await expect(page.getByRole('heading',{name:'문샷 캠퍼스 분석',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'새로고침',exact:true})).toHaveCount(1);
});

test('analytics states its scope, shares and search range without changing the query', async ({ page }) => {
  const urls: URL[] = [];
  await page.route('**/api/platform/workflows?**', async route => { urls.push(new URL(route.request().url())); await route.fulfill({json:{...empty,visitors:200,events:420,paidOrders:2,revenue:25000,stages:{class_view:80,application_click:20},paths:[{path:'/classes/b',views:10,visitors:8,clicks:1},{path:'/classes/a',views:40,visitors:30,clicks:6}]}}); });
  await page.goto('/analytics-test');
  await expect(page.getByRole('tab',{name:'사이트 유입·결제'})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText(/집계 기간 \d{4}-\d{2}-\d{2} ~ \d{4}-\d{2}-\d{2} · 30일/)).toBeVisible();
  await expect(page.getByText('방문 세션의 10%')).toBeVisible();
  await expect(page.getByText('40%',{exact:true})).toBeVisible();
  await expect(page.getByText('결제액 (환불 차감)',{exact:true})).toBeVisible();
  await expect(page.getByText(/조회 수 상위 2개 페이지 · 검색과 정렬은 이 목록 안에서 · 2개 표시/)).toBeVisible();
  const header = page.getByRole('columnheader',{name:/조회 수/});
  expect(await header.evaluate(e => getComputedStyle(e).textAlign)).toBe('right');
  await page.getByRole('searchbox',{name:'페이지 주소 검색'}).fill('/zzz');
  await expect(page.getByText('검색과 맞는 페이지가 없습니다.')).toBeVisible();
  await page.getByRole('button',{name:'검색 지우기'}).click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(2);
  expect(urls.every(url => [...url.searchParams.keys()].join(',') === 'kind,from,to' && url.searchParams.get('kind') === 'analytics')).toBe(true);
  await page.getByRole('tab',{name:'문샷 캠퍼스 행동'}).click();
  await expect(page.getByRole('searchbox',{name:'페이지 주소 검색'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
