import {expect, webkit} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loungeScheduleButton, openLoungeSchedule} from './review-office.mjs';

const url = new URL(process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4529/experience/moonshot');
if (url.pathname === '/') url.pathname = '/experience/moonshot';
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});

const browser = await webkit.launch();
try {
  for (const viewport of [{width:360, height:700}, {width:390, height:844}, {width:430, height:932}]) {
    const page = await browser.newPage({viewport, isMobile:true, hasTouch:true});
    const capture = stage => output && page.screenshot({path:resolve(output, viewport.width + '-' + stage + '.png')});
    const frame = page.frameLocator('iframe[title*="직원 사무실"]');
    const world = frame.locator('#walk');
    const floor = frame.locator('#floor');
    const materials = frame.getByRole('button', {name:/자료 안내/});
    const intro = frame.getByRole('button', {name:/윤익 · 브랜디액션/});
    const guide = page.getByRole('dialog', {name:'무료자료 · 라이브 특전', exact:true});
    const team = page.getByRole('dialog', {name:'윤익 · 브랜디액션 팀', exact:true});
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
      } else await materials.tap();
      await expect(guide).toBeVisible();
      await capture('materials');
      await guide.getByRole('button', {name:'라이브 특전', exact:true}).tap();
      await expect(guide.getByText(/라이브에서 비밀번호를 공개합니다/)).toBeVisible();
      await expect(guide.getByRole('listitem')).toHaveCount(3);
      await guide.getByRole('button', {name:'라운지로 돌아가기', exact:true}).tap();
      await expect(guide).not.toBeVisible();
      await expect(world).toHaveAttribute('data-paused', 'false');

      await intro.tap();
      await expect(team).toBeVisible();
      const video = await team.locator('video').elementHandle();
      await expect(team.locator('video')).toHaveAttribute('src','/campus/arrival/team-at-work.mp4');
      await capture('team');
      videoPlayed = await video.evaluate(async element => {
        element.muted = true;
        try {await element.play(); return !element.paused;}
        catch {return false;}
      });
      if (videoPlayed) await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
      await team.getByRole('button', {name:'라운지로 돌아가기', exact:true}).tap();
      await expect(team).not.toBeVisible();
      await expect(team.locator('video')).toHaveCount(0);
      if (videoPlayed) await expect.poll(() => video.evaluate(element => element.paused || element.ended)).toBe(true);
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
