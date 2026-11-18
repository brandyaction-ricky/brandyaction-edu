import {chromium, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const base = process.env.ARRIVAL_QA_URL ?? 'http://127.0.0.1:4529';
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true});
try {
  for (const [device, viewport] of [['pc', {width: 1440, height: 900}], ['mobile', {width: 390, height: 844}]]) {
    const page = await browser.newPage({viewport, isMobile: device === 'mobile', hasTouch: device === 'mobile'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    async function capture(step) {
      if (output) await page.screenshot({path: resolve(output, device + '-' + step + '.png')});
    }
    try {
      await page.goto(new URL('/experience/moonshot', base).href);
      const marker = page.frameLocator('iframe').getByRole('button', {name:'광고 초안 열기', exact:true});
      await expect(marker).toBeVisible({timeout:60000});
      await capture('entry');
      if (device === 'mobile') await marker.tap(); else await marker.click();
      const dialog = page.getByRole('dialog', {name:'광고 담당자의 모니터'});
      await expect(dialog.getByRole('heading', {name:'광고 첫 문장을 검토해 주세요.'})).toBeVisible();
      await dialog.getByText('참고한 광고 자료', {exact:true}).click();
      const ad = dialog.getByRole('img');
      await expect(ad).toBeVisible();
      expect(await ad.evaluate(async image => {await image.decode(); return image.naturalWidth;})).toBeGreaterThan(0);
      await dialog.getByText('참고한 광고 자료', {exact:true}).click();
      await capture('draft');
      await dialog.getByRole('button', {name:'퇴근을 늦추는 일로 시작해줘요.'}).click();
      await expect(dialog.getByText(/회의는 끝났는데/)).toBeVisible();
      await dialog.getByRole('button', {name:'다른 피드백으로 비교하기'}).click();
      await dialog.getByRole('button', {name:'AI가 무슨 일을 끝냈는지 먼저 보여줘요.'}).click();
      await expect(dialog.getByText(/광고 첫 문장과 고객 문의 답변/)).toBeVisible();
      await capture('revision');
      await dialog.getByRole('button', {name:'이 문장으로 승인하기'}).click();
      const rule = 'AI 직원을 소개할 때는 그 직원이 만들어 낸 결과물부터 보여준다.';
      await expect(dialog.getByText(rule)).toBeVisible();
      await page.reload();
      await page.locator('#arrival-desk-button').click();
      await expect(dialog.getByText(rule)).toBeVisible();
      await dialog.getByRole('button', {name:'책상으로'}).click();
      await expect(dialog).not.toBeVisible();
      await page.locator('#arrival-desk-button').click();
      await capture('approved');
      await dialog.getByRole('button', {name:'내 업무로 해보기'}).click();
      await expect(page.getByRole('button', {name:/회사 업무에 AI/})).toBeVisible();
      await page.getByRole('button', {name:/회사 업무에 AI/}).click();
      await expect(page.locator('[data-work-step]')).toHaveAttribute('data-work-step','0');
      await page.getByLabel('체험 메뉴').click();
      await page.getByRole('button', {name:'라이브 일정 바로 보기'}).click();
      await expect(page.getByRole('link', {name:'Google 캘린더'})).toHaveAttribute('href', /20261207T120000Z/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      console.log(device + ': 3D marker → both feedback choices → approval → reload → personal AI → calendar passed');
    } catch(error) {await capture('failure'); throw error;}
    finally {await page.close();}
  }
} finally {await browser.close();}
