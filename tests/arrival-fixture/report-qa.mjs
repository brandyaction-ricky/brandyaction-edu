import {chromium, expect, webkit} from '@playwright/test';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {finishOfficeReview, openLoungeSchedule, teamLeaderNext} from './review-office.mjs';

const linkFile = process.env.ARRIVAL_QA_LINK_FILE;
const url = new URL(linkFile ? (await readFile(linkFile, 'utf8')).trim() : process.env.ARRIVAL_QA_URL ?? 'http://127.0.0.1:4497');
url.pathname = '/experience/moonshot';
const storageKey = process.env.ARRIVAL_QA_STORAGE_KEY ?? 'moonshot:arrival:synthetic-local-qa:v1';
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});
const routes = [
  ['회사 업무에 AI를 써보고 싶어요', {audience:'work', step:1}],
  ['이미 사업을 하고 있어요', null],
  ['창업을 준비하고 있어요', {audience:'preparing', step:2}],
  ['아직 아이템이 없어요', {audience:'exploring', step:7, hallReturnStep:5, experience:'self-reported'}],
];
const devices = [[chromium, {width:1440, height:723}], [webkit, {width:390, height:844}]];

async function verifyPlayback(video, expectedDuration) {
  await expect.poll(() => video.evaluate(element => element.duration), {timeout: 15000}).toBeCloseTo(expectedDuration, 0);
  await video.evaluate(element => element.play());
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0.25);
  expect(await video.evaluate(element => element.error)).toBeNull();
}

for (const [engine, viewport] of devices) {
  const mobile = engine === webkit;
  const browser = await engine.launch();
  const capture = (page, name) => output && page.screenshot({path:resolve(output, engine.name() + '-' + name + '.png')});
  try {
    for (const [label, priorRoute] of routes) {
      const page = await browser.newPage({viewport, hasTouch:mobile, isMobile:mobile});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const tap = locator => mobile ? locator.tap() : locator.click();
      const action = (name, region = page) => region.getByRole('button', {name, exact:true});
      if (priorRoute) await page.addInitScript(({storageKey, priorRoute}) => {
        if (location.pathname !== '/experience/moonshot' || sessionStorage.getItem('entry-regression-seeded')) return;
        sessionStorage.setItem('entry-regression-seeded', 'yes');
        localStorage.setItem(storageKey, JSON.stringify({version:1, entryStarted:true, officeStation:1, ...priorRoute}));
      }, {storageKey, priorRoute});
      const response = await page.goto(url.href);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).origin).toBe(url.origin);
      await expect(action('이 상황으로 시작')).toBeDisabled();
      for (const [choice] of routes) await expect(page.getByText(choice, {exact:true})).toBeInViewport({ratio:1});
      if (priorRoute) {
        await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key))?.step, storageKey)).toBe(0);
      } else {
        await capture(page, 'first-choice');
      }

      const visited = [];
      await finishOfficeReview(page, {audience:label, enterPersonal:false, inspect:async (station, desk) => {
        visited.push(station);
        await expect(page.locator('[data-work-step], #arrival-brief')).toHaveCount(0);
        await expect(action('무료 자료 받기')).toHaveCount(0);
        if (station === 1 && !priorRoute) {
          await tap(action('지금 확인하기', desk));
          await expect(teamLeaderNext(desk)).toBeInViewport({ratio:1});
          await verifyPlayback(desk.locator('video'), 20);
          await capture(page, 'team-leader-video');
        }
        if (station === 2 && !priorRoute) {
          const input = desk.getByLabel('경쟁사 스파이에게 보낼 첫 요청');
          await expect(input).toBeInViewport({ratio:.95});
          const edited = '경쟁사에서 배송에 관한 불편이 자주 나오는지 알려줘.';
          await input.fill(edited);
          await tap(action('첫 요청 보내기', desk));
          await expect(desk.getByText('내 요청: ' + edited, {exact:true})).toBeVisible();
          await page.reload();
          await tap(action('바로 열기'));
          await expect(desk.getByText('내 요청: ' + edited, {exact:true})).toBeVisible();
        }
        if (station === 3 && !priorRoute) await verifyPlayback(desk.locator('video'), 17);
      }});
      expect(visited).toEqual([1, 2, 3, 4]);
      await expect(page.getByText('AI 직원들이 일하는 사례를 봤어요.', {exact:true})).toBeVisible();
      await expect(page.getByText('내 AI 체험을 마쳤어요.', {exact:true})).toHaveCount(0);
      await expect(action('무료 자료 받기')).toBeVisible();
      if (!priorRoute) await capture(page, 'lounge');
      await openLoungeSchedule(page);
      const calendar = new URL(await page.getByRole('link', {name:'Google 캘린더', exact:true}).getAttribute('href'));
      expect(calendar.searchParams.get('dates')).toContain('20261207T120000Z');
      expect(errors).toEqual([]);
      console.log(JSON.stringify({browser:engine.name(), audience:label, priorStep:priorRoute?.step ?? null, visited, lounge:true, videoPlayback:!priorRoute ? {teamLeader:true, content:true} : undefined}));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
