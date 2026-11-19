import {chromium, expect, webkit} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loungeScheduleButton, openLoungeSchedule, teamLeaderGuide, teamLeaderNext} from './review-office.mjs';

const url = new URL('/experience/moonshot', process.env.ARRIVAL_QA_URL ?? 'http://127.0.0.1:4497');
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});
const labels = ['회사 업무에 AI를 써보고 싶어요', '이미 사업을 하고 있어요', '창업을 준비하고 있어요', '아직 아이템이 없어요'];
const devices = [[chromium, {width:1440, height:723}], [webkit, {width:390, height:844}]];

for (const [engine, viewport] of devices) {
  const mobile = engine === webkit;
  const browser = await engine.launch();
  const capture = (page, name) => output && page.screenshot({path:resolve(output, `${engine.name()}-${name}.png`)});
  try {
    for (const [index, label] of labels.entries()) {
      const page = await browser.newPage({viewport, hasTouch:mobile, isMobile:mobile});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const tap = locator => mobile ? locator.tap() : locator.click();
      const action = (name, region = page) => region.getByRole('button', {name, exact:true});
      await page.goto(url.href);
      const start = action('이 상황으로 시작');
      await expect(start).toBeDisabled();
      for (const choice of labels) await expect(page.getByText(choice, {exact:true})).toBeInViewport({ratio:1});
      if (index === 0) await capture(page, 'first-choice');
      if (index === 1) await expect(page.frameLocator('iframe[title*="직원 사무실"]').locator('#walk')).toHaveAttribute('data-ready','true', {timeout:30000});
      await tap(page.getByText(label, {exact:true}));
      await tap(start);
      let clicks = 2;
      if (index === 1) {
        const leader = teamLeaderGuide(page);
        await tap(action('지금 확인하기', leader));
        const next = teamLeaderNext(leader);
        await expect(next).toBeInViewport({ratio:1});
        await capture(page, 'team-leader-video');
        await tap(next);
        clicks += 2;
        const spy = page.getByRole('dialog', {name:'경쟁사 스파이', exact:true});
        const input = spy.getByLabel('경쟁사 스파이에게 보낼 첫 요청');
        await expect(input).toBeInViewport({ratio:.95});
        const edited = '경쟁사에서 배송에 관한 불편이 자주 나오는지 알려줘.';
        await input.fill(edited);
        await tap(action('첫 요청 보내기', spy));
        await expect(spy.getByText(`내 요청: ${edited}`, {exact:true})).toBeVisible();
        await expect(spy.getByText('답변은 마스크팩 예시로 보여드려요.', {exact:true})).toBeVisible();
        await page.reload();
        await tap(action('바로 열기'));
        await expect(spy.getByText(`내 요청: ${edited}`, {exact:true})).toBeVisible();
      } else {
        const inputs = page.locator('#arrival-content textarea:not([readonly])');
        await expect(inputs.first()).toBeVisible();
        if (index === 0) {
          await capture(page, 'work-trial');
          await tap(page.getByLabel('체험 메뉴'));
          await tap(action('웰컴 라운지로 이동'));
          await expect(loungeScheduleButton(page)).toBeVisible();
          await expect(action('무료 자료 받기')).toBeVisible();
          await expect(action('사무실 사례 둘러보기')).toBeVisible();
          const world = page.frameLocator('iframe[title*="직원 사무실"]').locator('#walk');
          await expect(world).toHaveAttribute('data-free-roam', 'true', {timeout:20000});
          await expect.poll(async () => Number(await world.getAttribute('data-player-x'))).toBeGreaterThan(31);
          await capture(page, 'lounge');
          await openLoungeSchedule(page);
          const calendar = new URL(await page.getByRole('link', {name:'Google 캘린더', exact:true}).getAttribute('href'));
          expect(calendar.searchParams.get('dates')).toContain('20261207T120000Z');
        }
      }
      expect(errors).toEqual([]);
      console.log(JSON.stringify({browser:engine.name(), viewport, audience:label, clicksToFirstInput:clicks}));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
