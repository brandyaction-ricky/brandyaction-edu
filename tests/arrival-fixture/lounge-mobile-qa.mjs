import {chromium, expect, webkit} from '@playwright/test';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loungeScheduleButton, openLoungeSchedule} from './review-office.mjs';

const url = new URL(process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4529/experience/moonshot');
if (url.pathname === '/') url.pathname = '/experience/moonshot';
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});

const desktop = process.env.ARRIVAL_QA_DESKTOP === '1';
const viewports = desktop ? [{width:1440, height:1000}] : [{width:360, height:700}, {width:390, height:844}, {width:430, height:932}];
const browser = await (desktop ? chromium : webkit).launch();
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({viewport, isMobile:!desktop, hasTouch:!desktop, acceptDownloads:true});
    const press = node => desktop ? node.click() : node.tap();
    const capture = stage => output && page.screenshot({path:resolve(output, viewport.width + '-' + stage + '.png')});
    const frame = page.frameLocator('iframe[title*="직원 사무실"]');
    const world = frame.locator('#walk');
    const floor = frame.locator('#floor');
    const materials = frame.getByRole('button', {name:/자료 안내/});
    const intro = frame.getByRole('button', {name:/퇴사선배 윤익 · 브랜디액션/});
    const guide = page.getByRole('dialog', {name:'무료자료 · 라이브 특전', exact:true});
    const team = page.getByRole('dialog', {name:'퇴사선배 윤익 · 브랜디액션 팀', exact:true});
    const errors = [];
    let videoPlayed = false;
    page.on('pageerror', error => errors.push(error.message));

    async function hitTarget(button) {
      await expect(button).toBeInViewport({ratio:.95});
      expect(await button.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit && node.contains(hit);
      })).toBe(true);
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      return box;
    }

    try {
      await page.addInitScript(() => {
        if (window === window.top) {
          const visit = JSON.stringify({version:1, step:7, station:7});
          localStorage.setItem('moonshot:arrival:synthetic-local-qa:v1', visit);
          localStorage.setItem('moonshot:arrival:2026-12-07:v1', visit);
        }
      });
      await page.goto(url.href);
      await expect(world).toHaveAttribute('data-ready', 'true', {timeout:30_000});
      await expect(world).toHaveAttribute('data-free-roam', 'true');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(loungeScheduleButton(page)).toBeInViewport({ratio:.95});
      const [a, b] = await Promise.all([hitTarget(materials), hitTarget(intro)]);
      const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
        Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      expect(overlap).toBe(0);
      await capture('lounge');

      if (viewport.width === 390) {
        // Touch the 3D materials guide's head through the canvas, below its speech bubble.
        const box = await floor.boundingBox();
        await page.touchscreen.tap(box.x + box.width * .25, box.y + box.height * .48);
      } else await press(materials);
      await expect(guide).toBeVisible();
      await expect.poll(() => guide.locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await capture('materials');
      await expect(guide.getByRole('link', {name:/작업별 AI 활용 가이드/})).toHaveAttribute('href', 'https://edu.brandyaction.com/guide');
      await expect(guide.getByRole('link', {name:/AI팀 설계도/})).toHaveAttribute('href', 'https://edu.brandyaction.com/ai-team-blueprint');
      const pendingWorksheet = page.waitForEvent('download');
      await press(guide.getByRole('link', {name:'회사 업무 기준표 받기', exact:true}));
      const worksheet = await pendingWorksheet;
      expect(await readFile(await worksheet.path(), 'utf8')).toContain('오늘 AI에게 맡길 일 한 가지');
      await press(guide.getByRole('button', {name:'광고 영상 체험 열기'}));
      const replay = page.getByRole('dialog', {name:'콘텐츠 제작 다시 보기', exact:true});
      await expect(replay).toBeVisible();
      await expect.poll(() => replay.locator('video').evaluate(element => element.duration)).toBeGreaterThan(0);
      await press(replay.getByRole('button', {name:'자료 목록으로 돌아가기', exact:true}).first());
      await expect(guide).toBeVisible();
      await press(guide.getByRole('button', {name:'라이브 특전', exact:true}));
      await expect(guide.getByText(/라이브에서 비밀번호를 공개합니다/)).toBeVisible();
      await expect(guide.getByRole('listitem')).toHaveCount(3);
      await press(guide.getByRole('button', {name:'라운지로 돌아가기', exact:true}));
      await expect(guide).not.toBeVisible();
      await expect(world).toHaveAttribute('data-paused', 'false');

      await press(intro);
      await expect(team).toBeVisible();
      await expect(team.getByText(/퇴사선배 윤익과 브랜디액션 팀이 AI 직원에게 일을 맡기고/)).toBeVisible();
      const video = await team.locator('video').elementHandle();
      await expect(team.locator('video')).toHaveAttribute('src','/campus/arrival/team-at-work.mp4');
      expect(await video.evaluate(element => element.clientHeight > element.clientWidth)).toBe(true);
      await capture('team');
      videoPlayed = await video.evaluate(async element => {
        element.muted = true;
        try {await element.play(); return !element.paused;}
        catch {return false;}
      });
      if (videoPlayed) await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
      await press(team.getByRole('button', {name:'무료자료 확인하러 가기', exact:true}));
      await expect(team).not.toBeVisible();
      await expect(guide.getByRole('heading', {name:'무료자료 · 라이브 특전', exact:true})).toBeFocused();
      await expect(guide.getByRole('button', {name:'무료자료', exact:true})).toHaveAttribute('aria-pressed', 'true');
      await expect(guide.getByRole('heading', {name:'라이브 전에 볼 자료', exact:true})).toBeVisible();
      await expect(team.locator('video')).toHaveCount(0);
      if (videoPlayed) await expect.poll(() => video.evaluate(element => element.paused || element.ended)).toBe(true);
      await expect.poll(() => guide.locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await capture('materials-from-team');
      await press(guide.getByRole('button', {name:'라운지로 돌아가기', exact:true}));
      await expect(world).toHaveAttribute('data-paused', 'false');
      await openLoungeSchedule(page);
      expect(errors).toEqual([]);
      console.log(JSON.stringify({viewport, overlap, pick3d:viewport.width===390, videoPlayed, errors}));
    } catch (error) {
      await capture('failure');
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
