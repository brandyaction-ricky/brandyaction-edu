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

test('notification disclosure stays keyboard accessible and never opts in on opening', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.route('**/api/member/push', route => route.fulfill({ json: { enabled: false } }));
  await page.goto('/learning-overview-test?view=questions');
  const disclosure = page.locator('.member-notification-settings');
  await expect(disclosure).not.toHaveAttribute('open');
  await disclosure.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('open', '');
  await expect(disclosure.getByRole('heading', { name: '앱 알림', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath('notification-settings.png'), fullPage: true });
});

test('email confirmation action follows password help on a separate line without sending', async ({ page, viewport }, info) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await page.goto('/learning-overview-test?view=profile');
  const area = page.getByRole('region', { name: '로그인 이메일 변경', exact: true });
  const help = area.locator('form > small');
  const action = area.getByRole('button', { name: '비밀번호 설정하고 확인 메일 받기', exact: true });
  await expect(action).toBeDisabled();
  const helpBox = (await help.boundingBox())!, actionBox = (await action.boundingBox())!;
  expect(actionBox.y - (helpBox.y + helpBox.height)).toBeGreaterThanOrEqual(23);
  if (viewport!.width <= 680) expect(Math.abs(actionBox.width - helpBox.width)).toBeLessThan(2);
  else expect(Math.abs(actionBox.x + actionBox.width - helpBox.x - helpBox.width)).toBeLessThan(2);
  expect(writes).toEqual([]);
  await page.screenshot({ path: info.outputPath('profile-email-action.png'), fullPage: true });
});

for (const googleId of [false, true]) {
  test(`login methods align without overlapping (${googleId ? 'personalized Google' : 'OAuth fallback'})`, async ({ page }, info) => {
    if (googleId) await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
      contentType: 'application/javascript',
      body: `window.google = { accounts: { id: {
        initialize: function() {},
        renderButton: function(element, options) {
          var button = document.createElement('button');
          button.textContent = '합성 계정으로 Google 계속하기';
          button.style.cssText = 'box-sizing:border-box;height:40px;background:white;border:1px solid #cfd3d8;border-radius:4px';
          button.style.width = options.width + 'px';
          element.appendChild(button);
        }
      } } };`,
    }));
    await page.goto('/public-data-test?publicScreen=login&error=auth_callback' + (googleId ? '&google_preview=1' : ''));
    const kakao = page.getByRole('button', { name: '카카오로 계속하기', exact: true });
    const google = page.getByRole('button', { name: googleId ? '합성 계정으로 Google 계속하기' : 'G Google로 계속하기', exact: true });
    const email = page.getByRole('button', { name: '이메일로 로그인', exact: true });
    await expect(google).toBeVisible();
    const boxes = await Promise.all([kakao, google, email].map(button => button.boundingBox()));
    for (const box of boxes) {
      expect(Math.abs(box!.x - boxes[0]!.x)).toBeLessThan(2);
      expect(Math.abs(box!.width - boxes[0]!.width)).toBeLessThan(2);
    }
    expect(boxes[1]!.y - boxes[0]!.y - boxes[0]!.height).toBeGreaterThanOrEqual(11);
    expect(boxes[2]!.y - boxes[1]!.y - boxes[1]!.height).toBeGreaterThanOrEqual(23);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(googleId ? 'login-google-personalized.png' : 'login-oauth.png'), fullPage: true });
  });
}
