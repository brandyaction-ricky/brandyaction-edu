import { expect, test } from '@playwright/test';

const wav=Buffer.alloc(44+8000*2*90);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
test.beforeEach(async({page})=>{
  await page.route('https://audio.example.test/**',r=>r.fulfill({contentType:'audio/wav',body:wav}));
  await page.route('**/api/platform/lesson-media**',r=>r.fulfill({contentType:'audio/wav',body:wav}));
});
test('editor audio stays playable above the scrolled document without remounting, and returns inline',async({page},info)=>{
  await page.goto('/floating-audio-test');
  const first=page.locator('audio[aria-label="첫 번째 음성"]');
  await first.evaluate(async (audio:HTMLAudioElement)=>{audio.dataset.identity='same-player';await audio.play();});
  await expect.poll(()=>first.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0.5);
  const beforeScroll=await first.evaluate((a:HTMLAudioElement)=>a.currentTime);
  await page.evaluate(()=>window.scrollTo(0,1300));
  await expect(page.locator('.lesson-audio-player.is-floating')).toHaveCount(1);
  await expect(first).toHaveAttribute('data-identity','same-player');
  expect(await first.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThanOrEqual(beforeScroll);
  expect(await first.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);
  const box=await first.boundingBox(),toolbar=await page.locator('.ldc-sticky-toolbar').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(toolbar!.y+toolbar!.height);
  expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await first.evaluate((a:HTMLAudioElement)=>a.pause());expect(await first.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
  await first.evaluate((a:HTMLAudioElement)=>a.play());
  await page.screenshot({path:info.outputPath('floating-audio.png')});
  await page.getByText('25. 스크롤하면서 편집하는 긴 본문입니다.',{exact:true}).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.insertText(' 편집 중에도 재생 유지');
  await expect(first).toHaveAttribute('data-identity','same-player');
  expect(await first.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(false);
  await page.getByRole('button',{name:'음성 위치로',exact:true}).click();
  await expect(page.locator('.lesson-audio-player.is-floating')).toHaveCount(0);
  expect(await first.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThanOrEqual(beforeScroll);
  await page.evaluate(()=>window.scrollTo(0,1400));
  await page.getByRole('button',{name:'닫고 일시정지'}).click();
  await expect(page.locator('.lesson-audio-player.is-floating')).toHaveCount(0);
  expect(await first.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
});
test('only the latest audio floats, including uploaded media, and changing lesson cleans it up',async({page})=>{
  await page.goto('/floating-audio-test');
  const first=page.locator('audio').first(),second=page.locator('audio').last();
  await first.evaluate((a:HTMLAudioElement)=>a.play());await second.scrollIntoViewIfNeeded();await second.evaluate(async (a:HTMLAudioElement)=>{await a.play();});
  expect(await first.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
  await page.evaluate(()=>window.scrollBy(0,900));
  await expect(page.locator('.is-floating audio')).toHaveAttribute('aria-label','두 번째 음성');
  const playing=await second.elementHandle();
  await page.getByRole('button',{name:'다른 수업 열기'}).click();
  expect(await playing!.evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
  await expect(page.locator('.lesson-audio-player.is-floating')).toHaveCount(0);
  expect(await page.locator('audio').last().evaluate((a:HTMLAudioElement)=>a.paused)).toBe(true);
});
test('student media remains inline unless floating is explicitly enabled',async({page})=>{
  await page.goto('/floating-audio-test?learner');
  await page.locator('audio').first().evaluate((a:HTMLAudioElement)=>a.play());await page.evaluate(()=>window.scrollTo(0,1300));
  await expect(page.locator('.lesson-audio-player.is-floating')).toHaveCount(0);
});
