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
    await page.route('**/welcome-walk.mjs', async route => {
      const response = await route.fetch();
      const script = await response.text();
      const frameSample = 'root.dataset.playerX = state.x.toFixed(2);';
      expect(script).toContain(frameSample);
      await route.fulfill({response, body: script.replace(frameSample, 'root.dataset.firstPlayerX ??= state.x.toFixed(2); ' + frameSample)});
    });
    await page.goto(url.href);
    const frame = page.frameLocator('iframe[title*="직원 사무실"]');
    const world = frame.locator('#walk');
    const position = () => world.evaluate(el => [Number(el.dataset.playerX), Number(el.dataset.playerZ)]);
    const distance = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
    await expect(world).toHaveAttribute('data-ready','true', {timeout:20000});
    await expect(world).toHaveAttribute('data-paused','true');
    await expect.poll(async () => Number(await world.getAttribute('data-first-player-x'))).toBeGreaterThan(31);
    await page.getByRole('button',{name:'공간 둘러보기', exact:true}).click();
    await expect(world).toHaveAttribute('data-free-roam','true');
    await expect(frame.locator('#floor')).toBeFocused();
    const reopenSchedule = page.getByRole('button',{name:'라이브 일정 보기',exact:true});
    const floorSchedule = frame.getByRole('button',{name:'라이브 일정 보기',exact:true});
    await expect(reopenSchedule).toBeVisible();
    const personalTrial = page.getByRole('button',{name:'내 AI 체험으로 가기',exact:true});
    await expect(personalTrial).toBeVisible();
    await expect(floorSchedule).toBeVisible();
    if (mobile) await floorSchedule.tap();
    else await floorSchedule.click();
    await expect(page.getByRole('heading',{level:1})).toBeFocused();
    await expect(page.getByRole('link',{name:'Google 캘린더'})).toBeVisible();
    await page.getByRole('button',{name:'공간 둘러보기',exact:true}).click();
    await expect(world).toHaveAttribute('data-free-roam','true');
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
    await reopenSchedule.click();
    await expect(world).toHaveAttribute('data-paused','true');
    await expect(world).toHaveAttribute('data-free-roam','false');
    await expect(page.getByRole('link',{name:'Google 캘린더'})).toBeVisible();
    await page.getByRole('button',{name:'공간 둘러보기',exact:true}).click();
    await personalTrial.click();
    await expect(world).toHaveAttribute('data-station','6');
    console.log(engine.name(), {initial,afterKeys,afterPointer,arrivals:beforeArrivals});
  } finally { await browser.close(); }
}
