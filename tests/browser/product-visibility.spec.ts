import { expect, test } from '@playwright/test';

test('listing starts on, saves off, shows badge, and can be restored after reopening', async ({ page }) => {
  await page.goto('/product-visibility-test');
  await page.getByRole('tab', { name: '공개·검색', exact: true }).click();
  const toggle = page.getByRole('checkbox', { name: '클래스 목록·홈·검색에 노출', exact: true });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.getByRole('status').filter({ hasText: '목록 비노출' })).toBeVisible();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('목록 노출 저장값')).toHaveText('false');
  await page.getByRole('button', { name: '목록으로', exact: true }).click();
  await expect(page.getByText('비노출', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '합성 링크 전용 상품', exact: true }).click();
  await page.getByRole('tab', { name: '공개·검색', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await toggle.check();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('목록 노출 저장값')).toHaveText('true');
  await page.getByRole('button', { name: '목록으로', exact: true }).click();
  await expect(page.getByText('비노출', { exact: true })).toHaveCount(0);
});

test('home, classes and search hide unlisted products while direct details keep their CTA', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/visibility-home-test');
  await expect(page.getByText('합성 공개 상품', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('합성 링크 전용 상품', { exact: true })).toHaveCount(0);
  await page.goto('/classes');
  await expect(page.getByRole('heading', { name: '합성 공개 상품', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: '클래스 검색' }).fill('링크 전용');
  await expect(page.getByText('합성 링크 전용 상품', { exact: true })).toHaveCount(0);
  await page.goto('/classes/visibility-hidden?src=organic');
  await expect(page.getByRole('heading', { name: '합성 링크 전용 상품', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '링크로 신청', exact: true }).first()).toHaveAttribute('href', '/webinar/11111111-1111-4111-8111-111111111111/organic');
  await page.goto('/classes/visibility-paid');
  await expect(page.getByRole('heading', { name: '합성 비노출 유료 상품', level: 1, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '수강 신청하기', exact: true }).first()).toHaveAttribute('href', '/checkout?cohort=paid-cohort');
  expect(errors).toEqual([]);
});
