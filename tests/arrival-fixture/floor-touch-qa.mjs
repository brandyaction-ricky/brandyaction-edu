import {chromium, webkit, expect} from '@playwright/test';

const url = new URL('/experience/moonshot', process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4533');

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({viewport: {width: 393, height: 852}, isMobile: true, hasTouch: true});
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const visit = JSON.stringify({version: 1, step: 0, station: 2, audience: 'business'});
      localStorage.setItem('moonshot:arrival:synthetic-local-qa:v1', visit);
      localStorage.setItem('moonshot:arrival:2026-12-07:v1', visit);
    });
    await page.goto(url.href);
    const frame = page.frameLocator('iframe[title*="직원 사무실"]');
    const walk = frame.locator('#walk');
    const marker = frame.locator('#destination');
    const dialog = page.getByRole('dialog');
    await expect(walk).toHaveAttribute('data-ready', 'true', {timeout: 20000});
    await expect(walk).toHaveAttribute('data-station', '2');
    await expect(walk).toHaveAttribute('data-player-x', /^-?\d+\.\d+$/);
    await expect(dialog).not.toBeVisible();

    // Ordinary touches on the visible aisle move the visitor without opening a panel.
    for (let step = 0; step < 5 && await walk.getAttribute('data-near-desk') !== 'true'; step++) {
      const x = await walk.getAttribute('data-player-x');
      await page.touchscreen.tap(347, 544);
      await expect(walk).not.toHaveAttribute('data-player-x', x);
      await expect(walk).toHaveAttribute('data-moving', 'false');
    }
    await expect(walk).toHaveAttribute('data-near-desk', 'true');
    await expect(dialog).not.toBeVisible();
    await marker.tap();
    await expect(page.getByRole('region', {name:'경쟁사 스파이와 나눈 대화'})).toBeVisible();
    await expect(walk).toHaveAttribute('data-arrivals', '1');
    await page.getByRole('button', {name:'복도로 돌아가기', exact:true}).tap();
    await expect(walk).toHaveAttribute('data-paused', 'false');
    await expect(dialog).not.toBeVisible();
    const deskX = await walk.getAttribute('data-player-x');
    await page.touchscreen.tap(35, 575);
    await expect(walk).not.toHaveAttribute('data-player-x', deskX);
    await expect(walk).toHaveAttribute('data-near-desk', 'false');
    await expect(dialog).not.toBeVisible();
    const arrivals = Number(await walk.getAttribute('data-arrivals'));
    await marker.tap();
    await expect(page.getByRole('region', {name:'경쟁사 스파이와 나눈 대화'})).toBeVisible();
    await expect(walk).toHaveAttribute('data-arrivals', String(arrivals + 1));
    console.log(engine.name() + ' manual mobile floor taps and one-tap desk opening worked.');
  } finally {
    await browser.close();
  }
}
