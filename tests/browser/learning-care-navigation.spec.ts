import { test, expect } from '@playwright/test';

test('care read runs beside menu authorization, then reuses the recent snapshot on return and refreshes explicitly', async ({ page }) => {
  const user = { id: 'care-test-admin', full_name: '테스트 관리자', role: 'admin', permissions: { members: true } };
  let releaseMenu!: () => void;
  const menuGate = new Promise<void>(resolve => { releaseMenu = resolve; });
  let menuRequested = false, careReads = 0;
  await page.route('**/api/platform?**', async route => {
    const section = new URL(route.request().url()).searchParams.get('section');
    if (section === 'learning-care') { menuRequested = true; await menuGate; }
    await route.fulfill({ json: { user, data: {}, pagination: null } });
  });
  await page.route('**/api/admin/learning-care**', async route => {
    careReads++;
    await route.fulfill({ json: { actorId: user.id, asOf: new Date().toISOString(), cohorts: [{ id: 'test', name: '테스트 기수', courseTitle: '예시 과정' }], cohortId: 'test', rows: [] } });
  });
  await page.goto('/admin?navigationFixture=1&careNavigationFixture=1');
  await expect(page.getByRole('heading', { name: '오늘의 운영' })).toBeVisible();
  const menuToggle = page.getByRole('button', { name: '관리자 메뉴 열기', exact: true });
  if (await menuToggle.isVisible()) await menuToggle.click();
  await page.getByRole('link', { name: '수강생 현황', exact: true }).click();
  // Deliberately keep menu authorization pending: the old implementation never
  // started the care request until this gate was released.
  await expect.poll(() => menuRequested && careReads === 1).toBe(true);
  await expect(page.getByRole('tab', { name: '한눈에 보기' })).toHaveCount(0);
  releaseMenu();
  await expect(page.getByRole('tab', { name: '한눈에 보기' })).toBeVisible();
  if (await menuToggle.isVisible()) await menuToggle.click();
  await page.getByRole('link', { name: '운영 홈', exact: true }).click();
  await expect(page.getByRole('heading', { name: '오늘의 운영' })).toBeVisible();
  if (await menuToggle.isVisible()) await menuToggle.click();
  await page.getByRole('link', { name: '수강생 현황', exact: true }).click();
  await expect(page.getByRole('tab', { name: '한눈에 보기' })).toBeVisible();
  expect(careReads).toBe(1);
  await page.locator('.learning-care').getByRole('button', { name: '새로고침', exact: true }).click();
  await expect.poll(() => careReads).toBe(2);
  await expect(page.getByRole('tab', { name: '한눈에 보기' })).toBeVisible();
});
