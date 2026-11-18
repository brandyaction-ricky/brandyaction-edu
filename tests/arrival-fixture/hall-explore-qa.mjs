import {chromium, expect, webkit} from '@playwright/test';

const url = new URL('/experience/moonshot', process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4535');
for (const [engine, mobile] of [[chromium, false], [webkit, true]]) {
  const browser = await engine.launch();
  try {
    const size = mobile ? {width: 393, height: 852} : {width: 1280, height: 820};
    const page = await browser.newPage({viewport:size, isMobile:mobile, hasTouch:mobile});
    await page.addInitScript(() => {
      if (window === window.top) localStorage.setItem('moonshot:arrival:synthetic-local-qa:v1', JSON.stringify({version:1, step:7, visitorAvatar:'male-d'}));
    });
    await page.goto(url.href);
    const frame = page.frameLocator('iframe[title*="직원 사무실"]');
    const world = frame.locator('#walk');
    const position = () => world.evaluate(el => [Number(el.dataset.playerX), Number(el.dataset.playerZ)]);
    const distance = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
    await expect(world).toHaveAttribute('data-ready','true', {timeout:20000});
    await expect(world).toHaveAttribute('data-paused','true');
    await page.getByRole('button',{name:'공간 둘러보기', exact:true}).click();
    await expect(world).toHaveAttribute('data-free-roam','true');
    await expect(frame.locator('#floor')).toBeFocused();
    const initial = await position();
    await page.keyboard.down('ArrowUp');
    await expect.poll(async()=>distance(await position(), initial)).toBeGreaterThan(1.5);
    await page.keyboard.up('ArrowUp');
    await expect(world).toHaveAttribute('data-moving','false');
    const afterKeys = await position();
    const beforeArrivals = await world.getAttribute('data-arrivals');
    const floorBox = await frame.locator('#floor').boundingBox();
    const x = floorBox.x + floorBox.width * .72, y = floorBox.y + floorBox.height * .70;
    if (mobile) await page.touchscreen.tap(x,y);
    else await page.mouse.click(x,y);
    await expect.poll(async()=>distance(await position(), afterKeys)).toBeGreaterThan(.45);
    await expect(world).toHaveAttribute('data-arrivals', beforeArrivals);
    await expect(world).toHaveAttribute('data-avatar', 'male-d');
    const afterPointer = await position();
    await page.getByRole('button',{name:'체험 계속하기',exact:true}).click();
    await expect(world).toHaveAttribute('data-paused','true');
    await expect(world).toHaveAttribute('data-free-roam','false');
    await expect(page.getByRole('link',{name:'Google 캘린더'})).toBeVisible();
    console.log(engine.name(), {initial,afterKeys,afterPointer,arrivals:beforeArrivals});
  } finally { await browser.close(); }
}
