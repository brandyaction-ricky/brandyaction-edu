import { expect, test } from '@playwright/test';

const menus = ['overview', 'diagnosis-management', 'learning-care', 'learning', 'products', 'cohorts', 'contents', 'missions', 'members', 'reviews', 'questions', 'customers', 'tags', 'coupons', 'product-reviews', 'banners', 'articles', 'testimonials', 'orders', 'conversion', 'landing', 'analytics', 'campaigns', 'templates', 'automations', 'seo', 'settings', 'staff'];

for (const menu of menus) test(`${menu}: full operator shell stays readable without writes`, async ({ page, viewport }, info) => {
  const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  await page.goto(`/admin-ux-audit-test?menu=${menu}`);
  await expect(page.locator('#admin-content')).toBeVisible();
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('[aria-busy=true]')).toHaveCount(0);
  if (menu === 'analytics') {
    await expect(page.getByRole('heading', { name: '방문 세션', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  if (menu === 'learning-care') {
    await expect(page.locator('.care-student-tile')).toHaveCount(12);
    const cards = await page.locator('.care-student-tile').all();
    for (const card of cards) {
      expect(await card.evaluate(e => e.scrollWidth <= e.clientWidth + 2)).toBe(true);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  // Fields must fit their form even where the surrounding table can scroll.
  const clipped = await page.locator('#admin-content input:not([type=checkbox]):not([type=radio]), #admin-content select, #admin-content textarea').evaluateAll(elements => elements.filter(e => {
    if (!e.getClientRects().length || e.closest('[role=dialog],dialog,.table-scroll,.admin-table-scroll,.care-table-scroll')) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
  }).map(e => e.getAttribute('aria-label') || e.getAttribute('name') || e.tagName));
  expect(clipped).toEqual([]);
  if (viewport!.width <= 720) {
    if (menu === 'missions') expect((await page.locator('.mission-copy').boundingBox())!.width).toBeGreaterThan(200);
    if (menu === 'banners') expect((await page.locator('.catalog-name .title-btn').boundingBox())!.width).toBeGreaterThan(150);
    const opener = page.getByRole('button', { name: '관리자 메뉴 열기' });
    await opener.click();
    await expect(page.getByRole('dialog', { name: '관리자 메뉴' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await page.locator('h1').first().click();
  } else if (viewport!.width > 1024) {
    expect((await page.locator('#admin-sidebar .nav-link').first().boundingBox())!.height).toBeLessThanOrEqual(40);
  }
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath(`${menu}-${viewport!.width}.png`), fullPage: true });
});

test('care filters, complete lists and tabs stay reachable at 320px', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/admin-ux-audit-test?menu=learning-care');
  await expect(page.locator('.care-student-tile')).toHaveCount(12);
  for (const name of ['수강생별', '일차별', '공유용 요약', '한눈에 보기']) {
    await page.getByRole('tab', { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`care-${name}-320.png`), fullPage: true });
  }
});
