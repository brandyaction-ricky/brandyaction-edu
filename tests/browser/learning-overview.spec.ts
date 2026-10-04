import { expect, test } from '@playwright/test';

test('mobile member navigation keeps admin entry visible only for operators', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile navigation');
  await page.goto('/learning-overview-test?view=profile&role=admin');
  const adminTab = page.getByRole('navigation', { name: '마이페이지' }).getByRole('link', { name: '운영 관리자' });
  await expect(adminTab).toBeVisible();
  await expect(adminTab).toHaveAttribute('href', '/admin');
  await page.goto('/learning-overview-test?view=profile&role=staff');
  await expect(adminTab).toBeVisible();
  await page.goto('/learning-overview-test?view=profile');
  await expect(adminTab).toHaveCount(0);
});

test('dashboard separates 30-day tracks and offers review while the next week is locked', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/learning-overview-test');
  const overview = page.locator('.member-learning-intro');
  const daily = overview.getByRole('region', { name: '데일리 미션', exact: true }), learning = overview.getByRole('region', { name: '학습 & 시험', exact: true });
  await expect(daily).toContainText('현재 공개된 학습 5 / 30개 완료'); await expect(learning).toContainText('현재 공개된 학습 1 / 30개 완료');
  await expect(daily.getByRole('progressbar', { name: '데일리 미션 현재 공개된 학습 진도', exact: true })).toHaveAttribute('aria-valuenow', '17');
  await expect(daily).toContainText('다음 학습 공개 대기');
  await expect(daily.getByRole('link', { name: '데일리 미션 복습하기' })).toHaveAttribute('href', '/learn/sample-enrollment/daily-5');
  await expect(learning).toContainText('현재 DAY 2 · 학습 2일차');
  await expect(learning.getByRole('link', { name: '학습 & 시험 이어서 학습하기' })).toHaveAttribute('href', '/learn/sample-enrollment/learning-2');
  await daily.getByText('주차별 학습 보기', { exact: true }).click();
  await expect(daily.getByRole('heading', { name: '1주차', exact: true })).toBeVisible();
  await expect(daily.getByRole('progressbar', { name: '데일리 미션 1주차 진도', exact: true })).toHaveAttribute('aria-valuenow', '100');
  await expect(daily.locator('.elo-locked').first()).toContainText('데일리 6일차');
  await expect(daily.locator('a[href$="daily-6"]')).toHaveCount(0);
  await expect(overview.getByRole('region', { name: '지속 챌린지', exact: true }).getByRole('progressbar')).toHaveCount(0);
  await expect(page.locator('.member-stat').filter({ hasText: '학습 완료' }).locator('strong')).toHaveText('6개');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('learning-overview.png'), fullPage: true }); expect(errors).toEqual([]);
});

test('completed and fully locked tracks have accurate actions; ordinary onboarding remains available', async ({ page }) => {
  await page.goto('/learning-overview-test?scenario=complete');
  const overview = page.locator('.member-learning-intro'), daily = overview.getByRole('region', { name: '데일리 미션', exact: true });
  await expect(daily).toContainText('현재 공개된 학습 30 / 30개 완료'); await expect(daily).toContainText('현재 공개된 학습을 완료했습니다.');
  await expect(daily.getByRole('link')).toHaveAttribute('href', '/learn/sample-enrollment/daily-30');
  const ordinary = overview.getByRole('region', { name: '일반 학습', exact: true });
  await ordinary.getByText('주차별 학습 보기', { exact: true }).click();
  await expect(ordinary.getByRole('heading', { name: '온보딩', exact: true })).toBeVisible();
  await expect(ordinary.locator('li a')).toHaveAttribute('href', '/learn/sample-enrollment/intro');
  await page.goto('/learning-overview-test?scenario=locked');
  await expect(daily).toContainText('현재 공개된 학습 0 / 30개 완료'); await expect(daily.getByRole('link')).toHaveCount(0);
});

test('failed or missing gate reads offer retry without opening a fallback lesson', async ({ page }) => {
  for (const scenario of ['error', 'missing']) {
    await page.goto('/learning-overview-test?scenario=' + scenario);
    const overview = page.locator('.member-learning-intro');
    await expect(overview.getByRole('alert')).toContainText('학습 진행 상태를 확인하지 못했습니다.');
    await expect(overview.getByRole('progressbar')).toHaveCount(0); await expect(overview.locator('a[href^="/learn/"]')).toHaveCount(0);
    await expect(page.locator('.member-stat').filter({ hasText: '학습 완료' }).locator('strong')).toHaveText('—');
    await overview.getByRole('button', { name: '학습 상태 다시 불러오기' }).click();
    await expect(overview.getByRole('alert')).toBeVisible();
  }
});

test('class cards keep enrollment progress separate and revoked classes cannot open lessons', async ({ page }) => {
  await page.goto('/learning-overview-test?scenario=multiple&view=classes');
  const cards = page.locator('.class-enrolled');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('현재 공개된 학습 5 / 30개 완료');
  await expect(cards.nth(1)).toContainText('현재 공개된 학습 0 / 1개 완료');
  await expect(cards.nth(1).getByRole('link', { name: '데일리 미션 이어서 학습하기' })).toHaveAttribute('href', '/learn/second/second-lesson');
  await expect(cards.nth(2)).toContainText('수강 기간이 끝났거나 수강 권한이 없습니다.');
  await expect(cards.nth(2).locator('a[href^="/learn/"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('disabled feature preserves the existing member dashboard', async ({ page }) => {
  await page.goto('/learning-overview-test?scenario=legacy');
  await expect(page.locator('.member-continue')).toContainText('현재 공개된 학습 진도');
  await expect(page.getByRole('heading', { name: '나의 실행 레벨' })).toBeVisible();
  await expect(page.locator('.enrollment-learning-overview')).toHaveCount(0);
});
