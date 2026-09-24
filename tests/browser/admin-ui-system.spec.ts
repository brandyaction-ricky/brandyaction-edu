import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/admin-shell-test');
});

test('shared shell keeps permission-scoped navigation and operational states understandable', async ({ page, viewport }) => {
  await expect(page.getByRole('heading', { name: '오늘의 운영' })).toBeVisible();
  await expect(page.getByText('대기 업무를 모두 처리했습니다.')).toBeVisible();
  await expect(page.getByText('조회 결과가 없습니다.')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('화면 정보를 불러오지 못했습니다.');

  if ((viewport?.width || 0) <= 1024) {
    await page.getByRole('button', { name: '관리자 메뉴 열기' }).click();
  }

  await expect(page.getByRole('link', { name: '상품 관리' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: '주차 구성' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: '영상·자료 관리' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: '주문 결제' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: '스태프 권한' })).toHaveCount(0);
});

test('tablet and mobile navigation traps focus, closes with Escape and restores the opener', async ({ page, viewport }) => {
  test.skip((viewport?.width || 0) > 1024, 'desktop keeps the persistent sidebar');
  const opener = page.getByRole('button', { name: '관리자 메뉴 열기' });
  await expect(opener).toBeVisible();
  await opener.click();
  const navigation = page.getByRole('dialog', { name: '관리자 메뉴' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('button', { name: '관리자 메뉴 닫기' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(navigation.getByRole('link', { name: /고객 화면 보기/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');

  await opener.click();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('#admin-sidebar')).toBeVisible();
  await expect(page.locator('.app')).not.toHaveAttribute('inert', '');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('desktop keeps the persistent sidebar and current-page context', async ({ page, viewport }) => {
  test.skip((viewport?.width || 0) <= 1024, 'tablet and mobile use the navigation drawer');
  await expect(page.getByRole('button', { name: '관리자 메뉴 열기' })).toBeHidden();
  await expect(page.locator('#admin-sidebar')).toBeVisible();
  await expect(page.getByRole('link', { name: '운영 홈' })).toHaveAttribute('aria-current', 'page');
});
