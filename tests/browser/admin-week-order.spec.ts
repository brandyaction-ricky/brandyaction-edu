import { expect, test } from '@playwright/test';

test('week list groups by week and moves only inside the selected product', async ({ page }) => {
  await page.goto('/admin-week-order-test');
  await expect(page.locator('.week-group-heading')).toHaveCount(2);
  await expect(page.locator('.week-order-actions button[title="위로 이동"]').first()).toBeDisabled();

  await page.getByLabel('주차 상품').selectOption('course-a');
  await expect(page.locator('.week-group-heading')).toHaveCount(2);
  const secondWeek = page.locator('tr').filter({ hasText: '둘째 주차' });
  await secondWeek.getByRole('button', { name: '둘째 주차 위로 이동' }).click();

  const groups = page.locator('.week-group-heading');
  await expect(groups.nth(0)).toContainText('1주차');
  await expect(groups.nth(0).locator('xpath=following-sibling::tr[1]')).toContainText('둘째 주차');
  await expect(groups.nth(1).locator('xpath=following-sibling::tr[1]')).toContainText('첫 번째 주차');
  await expect(page.getByText('다른 상품 주차')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
