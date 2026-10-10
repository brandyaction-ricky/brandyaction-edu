import { expect, test } from '@playwright/test';

test('message workspace starts with work, keeps help available and uses the same navigation names', async ({ page }) => {
  await page.goto('/admin-ux-audit-test');
  const title = page.getByRole('heading', { name: '메시지 템플릿', exact: true });
  await expect(title).toBeVisible();
  expect((await title.boundingBox())!.y).toBeLessThan(310);
  const list = page.getByRole('table', { name: '메시지 템플릿 목록' });
  const settings = page.locator('.admin-crm-settings');
  expect((await list.boundingBox())!.y).toBeLessThan((await settings.boundingBox())!.y);
  await expect(settings.getByRole('combobox', { name: '문자 발신번호' })).toBeHidden();
  await page.locator('.marketing-workspace-menus > summary').click();
  const nav = page.getByRole('navigation', { name: '마케팅·전환 메뉴' });
  await expect(nav.getByRole('link', { name: '메시지 템플릿', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: '캠페인 발송', exact: true })).toBeVisible();
  await page.locator('.marketing-workspace-help > summary').click();
  await expect(page.getByRole('heading', { name: '반복해서 쓸 안내 문구를 만들어요' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('menu search understands the task and never reveals inaccessible navigation', async ({ page, viewport }) => {
  await page.goto('/admin-ux-audit-test?restricted=1');
  if (viewport!.width <= 1024) await page.getByRole('button', { name: '관리자 메뉴 열기' }).click();
  const sidebar = page.locator('#admin-sidebar');
  const search = sidebar.getByRole('searchbox', { name: '관리자 메뉴 찾기' });
  expect(await search.evaluate(element => parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThanOrEqual(32);
  await search.fill('문자');
  await expect(sidebar.getByRole('link', { name: '메시지 템플릿', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: '캠페인 발송', exact: true })).toHaveCount(0);
  await search.fill('없는메뉴');
  await expect(sidebar.getByRole('status')).toContainText('0개 메뉴');
  await sidebar.getByRole('button', { name: '메뉴 검색 지우기' }).click();
  await expect(search).toBeFocused(); await expect(search).toHaveValue('');
  await expect(sidebar.getByRole('link', { name: '스태프 권한' })).toHaveCount(0);
});

test('editing a distant row reveals and focuses the form without losing changes on accidental switches', async ({ page }) => {
  await page.goto('/admin-ux-audit-test');
  const table = page.getByRole('table', { name: '메시지 템플릿 목록' });
  await table.getByRole('row').filter({ hasText: '마지막 학습 안내' }).getByRole('button', { name: '수정' }).click();
  const name = page.getByRole('textbox', { name: '템플릿 이름' });
  await expect(name).toBeFocused(); await expect(name).toBeInViewport();
  await name.fill('보존할 작성 중 문구');
  page.once('dialog', dialog => dialog.dismiss());
  await table.getByRole('button', { name: '수정', exact: true }).first().click();
  await expect(name).toHaveValue('보존할 작성 중 문구');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '새로 등록', exact: true }).click();
  await expect(name).toHaveValue('보존할 작성 중 문구');
  await expect(page.getByLabel('시험 저장 횟수')).toHaveText('0');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '새로 등록', exact: true }).click();
  await expect(name).toHaveValue(''); await expect(name).toBeFocused();
});
