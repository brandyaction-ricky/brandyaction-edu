import { test, expect } from '@playwright/test';

test('selected member menu stays visible and resources have a current location', async ({ page }, info) => {
  await page.goto('/learning-overview-test?view=resources');
  const nav = page.getByRole('navigation', { name: '마이페이지', exact: true });
  const active = nav.getByRole('link', { name: '수강 자료·구매 파일' });
  await expect(active).toHaveAttribute('aria-current', 'page');
  const a = (await active.boundingBox())!, n = (await nav.boundingBox())!;
  expect(a.x).toBeGreaterThanOrEqual(n.x - 1);
  expect(a.x + a.width).toBeLessThanOrEqual(n.x + n.width + 1);
  await page.screenshot({ path: info.outputPath('member-resources.png'), fullPage: true });
});

test('empty missions are not presented as zero-percent progress and coupon filters expose selection', async ({ page }) => {
  await page.goto('/learning-overview-test?view=missions&scenario=empty');
  await expect(page.getByText('아직 공개된 미션이 없습니다.')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '현재 공개된 미션 승인' })).toHaveCount(0);
  await page.goto('/learning-overview-test?view=coupons&couponStates');
  const tabs = page.locator('.status-tabs button');
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await tabs.nth(1).click();
  await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('사용한 쿠폰', { exact: true })).toBeVisible();
});

test('long question can be read in full without changing question actions', async ({ page }) => {
  const body = '합성 질문입니다. '.repeat(45) + '끝 문장';
  await page.route('**/api/platform/question-hub**', route => {
    const mode = new URL(route.request().url()).searchParams.get('mode');
    return route.fulfill({ json: mode === 'contexts' ? { contexts: [] } : mode === 'shared' ? { answers: [], hasMore: false } : { questions: [{ id: '11111111-1111-4111-8111-000000000009', title: '긴 합성 질문', content: body, status: 'open', mine: false, visibility: 'cohort' }], hasMore: false } });
  });
  await page.goto('/question-hub-test');
  const card = page.locator('.question-card').filter({ hasText: '긴 합성 질문' });
  const more = card.getByRole('button', { name: '질문 내용 더 보기' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(card.getByText('끝 문장')).toHaveCount(0);
  await more.click();
  await expect(card.getByText(/끝 문장/)).toBeVisible();
  await expect(card.getByRole('button', { name: '질문 내용 접기' })).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('button', { name: '답변 전체 보기' })).toBeVisible();
});

test('article shortcut distinguishes empty, published and failed reads', async ({ page }) => {
  let mode: 'empty' | 'published' | 'video' | 'error' = 'empty';
  await page.route('**/api/platform?view=articles', route => mode === 'error'
    ? route.fulfill({ status: 503, json: { error: '합성 조회 실패' } })
    : route.fulfill({ json: { data: { article_banner: [{ value: { articleCount: mode === 'published' ? 1 : 0, videos: mode === 'video' ? [{ available: true }] : [] } }] } } }));
  await page.goto('/learning-overview-test?view=dashboard');
  await expect(page.getByRole('link', { name: /무료 클래스 둘러보기/ })).toHaveAttribute('href', '/classes?type=free');
  mode = 'published';
  await page.reload();
  await expect(page.getByRole('link', { name: /아티클/ })).toHaveAttribute('href', '/articles');
  mode = 'video';
  await page.reload();
  await expect(page.getByRole('link', { name: /무료강의/ })).toHaveAttribute('href', '/articles');
  mode = 'error';
  await page.reload();
  await expect(page.getByText('콘텐츠 현황을 확인하지 못했습니다.')).toBeVisible();
  await expect(page.getByRole('link', { name: /아티클/ })).toHaveAttribute('href', '/articles');
  mode = 'empty';
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('link', { name: /무료 클래스 둘러보기/ })).toHaveAttribute('href', '/classes?type=free');
});
