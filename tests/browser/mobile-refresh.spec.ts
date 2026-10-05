import { expect, test } from '@playwright/test';

for (const screen of ['student', 'admin']) {
  test(`${screen} mobile refresh fits the header and reloads the current URL`, async ({ page }, info) => {
    if (screen === 'student') await page.route('**/api/platform?**', route => route.fulfill({ json: { user: { id: 'synthetic', full_name: '검증 회원', role: 'student' }, data: { review_videos: [] }, support: {} } }));
    await page.goto(screen === 'student' ? '/public-data-test?publicScreen=stories' : '/admin-shell-test?refresh=1');
    const refresh = page.getByRole('button', { name: '새로고침', exact: true });
    for (const width of [320, 390, 720, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      if (width > 720) { await expect(refresh).toBeHidden(); continue; }
      await expect(refresh).toBeVisible();
      const box = await refresh.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath(`${screen}-mobile.png`) });
    const originalURL = page.url();
    await Promise.all([page.waitForEvent('load'), refresh.click()]);
    expect(page.url()).toBe(originalURL);
    await expect(refresh).toBeVisible();
    // A real beforeunload listener must still be able to cancel a refresh.
    await page.evaluate(() => {
      window.addEventListener('beforeunload', event => { event.preventDefault(); event.returnValue = ''; });
      (window as Window & { refreshMarker?: boolean }).refreshMarker = true;
    });
    const dialogPromise = page.waitForEvent('dialog').then(async dialog => {
      expect(dialog.type()).toBe('beforeunload');
      await dialog.dismiss();
    });
    await Promise.all([dialogPromise, refresh.click()]);
    expect(await page.evaluate(() => (window as Window & { refreshMarker?: boolean }).refreshMarker)).toBe(true);
    await expect(refresh).toBeEnabled();
  });
}
