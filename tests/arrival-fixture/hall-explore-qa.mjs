import {chromium, expect, webkit} from '@playwright/test';
import {loungeScheduleButton, openLoungeSchedule} from './review-office.mjs';

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
    const floor = frame.locator('#floor');
    const position = () => world.evaluate(el => [Number(el.dataset.playerX), Number(el.dataset.playerZ)]);
    const distance = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
    await expect(world).toHaveAttribute('data-ready','true', {timeout:20000});
    await expect(world).toHaveAttribute('data-free-roam','true');
    await expect.poll(async () => Number(await world.getAttribute('data-first-player-x'))).toBeGreaterThan(31);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('link',{name:'Google 캘린더'})).toHaveCount(0);
    const schedule = loungeScheduleButton(page);
    const personalTrial = page.getByRole('button',{name:'내 AI 체험으로 가기',exact:true});
    await expect(schedule).toBeVisible();
    await expect(personalTrial).toBeVisible();
    await expect(frame.getByRole('button',{name:/자료 안내/})).toBeVisible();
    await expect(frame.getByRole('button',{name:/윤익 · 브랜디액션/})).toBeVisible();
    await floor.focus();
    const initial = await position();
    await page.keyboard.down('ArrowUp');
    try { await expect.poll(async()=>distance(await position(), initial)).toBeGreaterThan(1.5); }
    finally { await page.keyboard.up('ArrowUp'); }
    await expect(world).toHaveAttribute('data-moving','false');
    const afterKeys = await position();
    const beforeArrivals = await world.getAttribute('data-arrivals');
    const floorBox = await floor.boundingBox();
    const x = floorBox.x + floorBox.width * .72, y = floorBox.y + floorBox.height * .70;
    if (mobile) await page.touchscreen.tap(x,y);
    else await page.mouse.click(x,y);
    await expect.poll(async()=>distance(await position(), afterKeys)).toBeGreaterThan(.45);
    await expect(world).toHaveAttribute('data-arrivals', beforeArrivals);
    await expect(world).toHaveAttribute('data-avatar', 'male-d');
    const afterPointer = await position();
    await openLoungeSchedule(page);
    await expect(world).toHaveAttribute('data-paused','true');
    await expect(world).toHaveAttribute('data-free-roam','false');
    await page.getByRole('button',{name:/공간 둘러보기|웰컴 라운지로 돌아가기/}).click();
    await expect(world).toHaveAttribute('data-free-roam','true');
    await personalTrial.click();
    await expect(world).toHaveAttribute('data-station','6');
    console.log(engine.name(), {initial,afterKeys,afterPointer,arrivals:beforeArrivals});
  } finally { await browser.close(); }
}
