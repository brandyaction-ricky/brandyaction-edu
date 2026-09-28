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

test('onboarding stays at zero while regular weeks are reordered', async ({ page }) => {
  await page.goto('/admin-week-order-test?onboarding=1');
  await page.getByLabel('주차 상품').selectOption('course-a');
  await expect(page.getByRole('button', { name: '온보딩 위로 이동' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '온보딩 아래로 이동' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '첫 번째 주차 위로 이동' })).toBeDisabled();
  await page.getByRole('button', { name: '둘째 주차 위로 이동' }).click();
  const groups = page.locator('.week-group-heading');
  await expect(groups.nth(0)).toContainText('0주차');
  await expect(groups.nth(0).locator('xpath=following-sibling::tr[1]')).toContainText('온보딩');
  await expect(groups.nth(1)).toContainText('1주차');
  await expect(groups.nth(1).locator('xpath=following-sibling::tr[1]')).toContainText('둘째 주차');
});

test('week editor saves zero, restores it on reopen, and rejects negative numbers', async ({ page }) => {
  await page.goto('/admin-week-order-test');
  await page.locator('tr').filter({ hasText: '첫 번째 주차' }).getByRole('button', { name: '수정', exact: true }).click();
  const number = page.locator('input[name="week_number"]');
  await number.fill('-1');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(number).toBeVisible();
  expect(await number.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
  await number.fill('0');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.week-group-heading').first()).toContainText('0주차');
  await page.locator('tr').filter({ hasText: '첫 번째 주차' }).getByRole('button', { name: '수정', exact: true }).click();
  await expect(number).toHaveValue('0');
});
