import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/platform/encouragement**', route => route.fulfill({
    json: new URL(route.request().url()).searchParams.has('mine')
      ? { publicName: '', message: '', revision: null }
      : { rows: [], nextCursor: null },
  }));
});

test('member dashboard uses shared neutral cards and red actions without writes', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url());
  });
  await page.goto('/learning-overview-test?scenario=multiple');
  const care = page.getByRole('region', { name: '지금 할 일' });
  await expect(care).toBeVisible();
  await expect(care).toHaveCSS('background-image', 'none');
  await expect(care).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(care).toHaveCSS('border-radius', '8px');
  await expect(care.locator('.care-eyebrow')).toHaveCSS('color', 'rgb(201, 35, 45)');
  await expect(care.getByRole('link', { name: '피드백 확인하기' })).toHaveAttribute('href', /\/learn\/enrollment-2\//);
  await expect(care.getByRole('link', { name: '막혔나요? 질문하기' })).toHaveAttribute('href', '/my/questions');
  await expect(page.locator('.member-stats .member-stat')).toHaveCount(4);
  for (const button of await care.locator('.btn').all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath('member-common-style.png'), fullPage: true });
});

for (const section of ['classes', 'missions', 'orders', 'coupons', 'reviews', 'profile']) {
  test(`member shared shell retains navigation and fits ${section}`, async ({ page }, info) => {
    await page.goto(`/learning-overview-test?view=${section}`);
    const nav = page.getByRole('navigation', { name: '마이페이지', exact: true });
    await expect(nav).toBeVisible();
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', `/my/${section}`);
    await expect(nav.locator('a[aria-current="page"]')).toHaveCSS('color', 'rgb(201, 35, 45)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`member-${section}.png`), fullPage: true });
  });
}
