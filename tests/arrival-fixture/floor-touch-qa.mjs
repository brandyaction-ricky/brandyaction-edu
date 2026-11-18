import {chromium, webkit, expect} from '@playwright/test';

const url = new URL('/experience/moonshot', process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4533');

for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({viewport: {width: 393, height: 852}, isMobile: true, hasTouch: true});
    await page.goto(url.href);
    const walk = page.frameLocator('iframe[title*="직원 사무실"]').locator('#walk');
    await expect(walk).toHaveAttribute('data-ready', 'true', {timeout: 20000});
    const start = await walk.getAttribute('data-player-x');

    // Touch the visible light threshold between the carpet and the red floor stripe.
    // A tap on the floating destination button would miss the original regression.
    await page.touchscreen.tap(354, 515);
    await expect(walk).not.toHaveAttribute('data-player-x', start);
    const visitResearcher = page.getByRole('button', {name: '조사 담당자 만나기', exact: true});
    await expect(visitResearcher).toBeVisible();
    await expect(walk).toHaveAttribute('data-arrivals', '1');
    await visitResearcher.click();
    await expect(walk).toHaveAttribute('data-station', '2');

    // Follow the corridor ahead of the avatar. Retry only after the previous walk settles.
    for (let step = 0; step < 5 && await walk.getAttribute('data-paused') !== 'true'; step++) {
      const x = await walk.getAttribute('data-player-x');
      await page.touchscreen.tap(347, 544);
      await expect(walk).not.toHaveAttribute('data-player-x', x);
      await expect(walk).toHaveAttribute('data-moving', 'false');
    }
    await expect(page.getByRole('heading', {name:'어떤 말을 광고에 담을까요?'})).toBeVisible();
    await expect(walk).toHaveAttribute('data-arrivals', '2');
    console.log(engine.name() + ' mobile floor taps reached the first and second desks once.');
  } finally {
    await browser.close();
  }
}
