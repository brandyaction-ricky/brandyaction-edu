import { test, expect, type Page } from '@playwright/test';

async function interceptMeta(page: Page) {
  const requests: string[] = [];
  await page.route('https://connect.facebook.net/**', route => { requests.push(route.request().url()); return route.fulfill({ contentType: 'application/javascript', body: '' }); });
  await page.route('https://www.facebook.com/**', route => { requests.push(route.request().url()); return route.abort(); });
  return requests;
}
test('saved refusal blocks Meta before loading and survives reload on desktop and mobile', async ({ page, context, baseURL }) => {
  const requests = await interceptMeta(page);
  await context.addCookies([{ name: 'edu_noads', value: '1', url: baseURL! }]);
  await page.goto('/privacy-settings-test');
  await expect(page.getByRole('status')).toContainText('맞춤형 광고를 거부했어요');
  await page.getByRole('button', { name: '합성 클릭 이벤트' }).click();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('맞춤형 광고를 거부했어요');
  expect(requests).toHaveLength(0);
});
test('reject clears pre-load events, saves one year and prevents events after reload', async ({ page, context }) => {
  const requests = await interceptMeta(page);
  await page.goto('/privacy-settings-test');
  await page.getByRole('button', { name: '맞춤형 광고 거부', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('이 브라우저에서는 Meta로 방문·클릭 기록을 보내지 않습니다');
  const queue = () => page.evaluate(() => (window as typeof window & { fbq?: { queue?: unknown[][] } }).fbq?.queue);
  expect(await queue()).toEqual([['consent', 'revoke']]);
  await page.getByRole('button', { name: '합성 클릭 이벤트' }).click();
  expect(await queue()).toEqual([['consent', 'revoke']]);
  const cookie = (await context.cookies()).find(x => x.name === 'edu_noads')!;
  expect(cookie.path).toBe('/'); expect(cookie.sameSite).toBe('Lax');
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 364 * 86400);
  const before = requests.length; await page.reload();
  await expect(page.getByRole('status')).toContainText('맞춤형 광고를 거부했어요');
  expect(requests.length).toBe(before);
});
test('blocked storage explains persistence failure accurately even after focus returns', async ({ page }) => {
  await interceptMeta(page);
  await page.addInitScript(() => Object.defineProperty(document, 'cookie', { get: () => '', set: () => {}, configurable: true }));
  await page.goto('/privacy-settings-test');
  await page.getByRole('button', { name: '맞춤형 광고 거부', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('설정을 저장하지 못했어요');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('다음에 방문하면 다시 눌러 주세요');
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: '합성 클릭 이벤트' }).click();
  expect(await page.evaluate(() => (window as typeof window & { fbq?: { queue?: unknown[][] } }).fbq?.queue)).toEqual([['consent', 'revoke']]);
});
test('public mobile footer leads directly to usable ad settings, without horizontal overflow', async ({ page }) => {
  await interceptMeta(page);
  await page.goto('/visibility-home-test');
  const footer = page.locator('.site-footer');
  const settings = footer.getByRole('link', { name: '맞춤형 광고 설정', exact: true });
  await settings.scrollIntoViewIfNeeded(); await expect(settings).toBeVisible();
  const bounds = await settings.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await settings.click(); await expect(page).toHaveURL(/\/policies\/privacy#advertising$/);
  await expect(page.getByRole('heading', { name: '맞춤형 광고 설정', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: '맞춤형 광고 거부', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('맞춤형 광고를 거부했어요');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('current, archived and upcoming privacy pages stay distinct and retain N6 disclosures', async ({ page }) => {
  await interceptMeta(page);
  await page.goto('/policies/privacy');
  await expect(page.locator('.privacy-policy-copy')).toContainText('시행일: 2026년 8월 11일');
  await page.getByRole('link', { name: /바뀌는 처리방침 보기/ }).click();
  await expect(page).toHaveURL(/\/policies\/privacy\/2026-10-20$/);
  await expect(page.getByLabel('시행 예정 개정안')).toBeVisible();
  await expect(page.locator('.privacy-policy-copy')).toContainText('privacy@anthropic.com');
  await expect(page.locator('.privacy-policy-copy')).toContainText('7. 행태정보의 수집·이용 및 거부');
  await page.getByRole('link', { name: '2026년 8월 11일 버전 · N6 추가 안내 포함' }).click();
  await expect(page).toHaveURL(/\/policies\/privacy\/2026-08-11$/);
  await expect(page.locator('.privacy-policy-copy')).toContainText('N6 진단 관련 추가 안내');
  await expect(page.locator('.privacy-policy-copy')).toContainText('시행일: 2026년 8월 11일');
});
