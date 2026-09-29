import { expect, test } from '@playwright/test';

test('CRM templates use one table with status and keep edit behavior', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin-full-crm-test');
  const table = page.getByRole('table', { name: '메시지 템플릿 목록' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByText('모집 안내 초안')).toBeVisible();
  await expect(table.getByText('사용 중', { exact: true })).toBeVisible();
  await table.getByRole('row', { name: /모집 안내 초안/ }).getByRole('button', { name: '수정' }).click();
  await expect(page.getByRole('textbox', { name: '템플릿 이름' })).toHaveValue('모집 안내 초안');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('settings measurement-code detail uses the shared drawer and restores focus', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin-full-settings-test');
  await page.getByRole('button', { name: '측정·추가 코드' }).click();
  const open = page.getByRole('button', { name: '+ 추가 코드' });
  await open.click();
  const drawer = page.getByRole('dialog', { name: '추가 코드 초안' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('textbox', { name: '코드 이름 *' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('article category table and banner form retain category edit and saved exposure controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin-full-articles-test');
  const table = page.getByRole('table', { name: '아티클 카테고리' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByText('비활성')).toBeVisible();
  await page.getByRole('button', { name: '기획 수정' }).click();
  await expect(page.getByRole('textbox', { name: '카테고리명 *' })).toHaveValue('기획');
  await page.getByRole('button', { name: '닫기' }).click();
  await page.getByRole('checkbox', { name: '노출' }).uncheck();
  await page.getByRole('button', { name: '상단 무료강의 설정 저장' }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
