import { expect, test } from '@playwright/test';

test('sale hold reason and cohort status agree across editor tabs and preview', async ({ page }) => {
  await page.goto('/product-sale-test');
  for (const tab of ['기본·판매', '수강·권한', '공개·검색']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('판매 보류', { exact: true })).toBeVisible();
    await expect(panel.getByText('공개 커리큘럼', { exact: true })).toBeVisible();
    await expect(panel.getByText(/연결 기수 상태: 합성 4기/)).toBeVisible();
  }
  await expect(page.locator('aside').getByText('판매 보류', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('공개 커리큘럼'); await dialog.dismiss(); });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
});

test('ready upcoming offer remains available and warns without changing cohort status', async ({ page }) => {
  await page.goto('/product-sale-test?ready=1');
  await expect(page.locator('aside').getByText('판매 중', { exact: true }).first()).toBeVisible();
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('기수 상태는 자동 변경되지 않습니다'); await dialog.accept(); });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
});

test('product curriculum tab loads existing scoped lessons without submitting the product form', async ({ page }) => {
  await page.goto('/product-sale-test');
  const tab = page.getByRole('tab', { name: '커리큘럼' });
  await tab.click();
  const panel = page.getByRole('tabpanel', { name: '커리큘럼' });
  await expect(panel.getByRole('heading', { name: /1주차 · 기존 합성 주차/ })).toBeVisible();
  await expect(panel.getByText(/Day 1 · 기존 합성 학습/)).toBeVisible();
  await panel.getByRole('button', { name: '콘텐츠 편집' }).click();
  await expect(panel.getByRole('textbox', { name: '학습 본문' })).toHaveValue('기존 학습 본문');
  await panel.getByRole('textbox', { name: '새 주차 제목' }).fill('새 주차');
  await panel.getByRole('textbox', { name: '새 주차 제목' }).press('Enter');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await expect(page.getByRole('button', { name: '저장하기', exact: true })).toHaveCount(0);
});
