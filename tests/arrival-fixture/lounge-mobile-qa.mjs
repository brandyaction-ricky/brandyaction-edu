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
          const visit = JSON.stringify({version:1, step:7, station:7, officeStation:7, entryStarted:true, spyPhase:'handed-off', canonPhase:3});
          localStorage.setItem('moonshot:arrival:synthetic-local-qa:v1', visit);
          localStorage.setItem('moonshot:arrival:2026-12-07:v1', visit);
        }
      });
      await page.goto(url.href);
      await expect(world).toHaveAttribute('data-ready', 'true', {timeout:30_000});
      await expect(world).toHaveAttribute('data-free-roam', 'true');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const calendar = await hitTarget(loungeScheduleButton(page));
      const reminder = await hitTarget(page.getByRole('region', {name:'웰컴 라운지에서 할 수 있는 일'})
        .getByRole('button', {name:'강의 알림 받기', exact:true}));
      expect(reminder.x).toBeGreaterThanOrEqual(calendar.x + calendar.width);
      expect(reminder.y).toBe(calendar.y);
      await expect(intro).toContainText('광고만 13년 했어요. 요즘은 AI 직원들이랑 일해요.');
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
      await expect(team.getByRole('heading', {name:'퇴사선배 윤익 · 브랜디액션 팀', exact:true})).toBeVisible();
      await expect(team.getByText('13년차 퍼포먼스 마케터 · 브랜디액션 CMO', {exact:true})).toBeVisible();
      await expect(team.getByText(/^13년 동안 250억의 광고비를 직접 집행했고/)).toBeVisible();
      for (const metric of ['13년', '250억', '1,000명+', '3.6만']) {
        await expect(team.getByText(metric, {exact:true})).toBeVisible();
      }
      await expect(team.getByRole('heading', {name:'브랜디액션이 일하는 방식', exact:true})).toBeVisible();
      await expect(team.getByText(/^지난 4년 동안 브랜디액션은 5,000명이 넘는/)).toBeVisible();
      await expect(team.getByRole('heading', {name:'12월 7일 (월) 오후 9시 무료 라이브에서 알려드려요', exact:true})).toBeVisible();
      const agenda = [
        'AI 마케팅 팀 만드는 법',
        '흩어진 데이터를 한 곳에 모으는 법',
        '반복 업무를 AI 직원에게 나눠 맡기는 법',
        '광고비 250억을 쓰며 쌓은 판단 기준을 AI에 적용하는 법',
      ];
      await expect(team.getByRole('listitem')).toHaveText(agenda);
      const freeMaterials = team.getByRole('button', {name:'무료자료 확인하러 가기', exact:true});
      await hitTarget(freeMaterials);
      await capture('team');

      const meetupPhoto = team.getByRole('img', {name:'브랜디액션 오프라인 모임에 함께한 참가자들의 단체 사진', exact:true});
      const meetupCaption = team.locator('figcaption').filter({hasText:'브랜디액션 오프라인 모임'});
      await expect(meetupPhoto).toHaveAttribute('src', '/campus/arrival/brandyaction-meetup.webp');
      await expect(meetupCaption).toHaveText('브랜디액션 오프라인 모임');
      await meetupCaption.scrollIntoViewIfNeeded();
      await expect(meetupPhoto).toBeInViewport({ratio:.95});
      await expect.poll(() => meetupPhoto.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await hitTarget(freeMaterials);
      if ([390, 1440].includes(viewport.width)) await capture('team-meetup-photo');

      const meetupToggle = team.getByText('오프라인 모임 영상 보기', {exact:true});
      const meetupVideo = team.locator('video[aria-label="브랜디액션 오프라인 모임과 참가자 후기 영상"]');
      await expect(meetupVideo).toBeHidden();
      await press(meetupToggle);
      await expect(meetupVideo).toBeVisible();
      await expect(meetupVideo).toHaveAttribute('src', '/campus/arrival/brandyaction-meetup.mp4');
      await expect(meetupVideo).toHaveAttribute('poster', '/campus/arrival/brandyaction-meetup-poster.webp');
      await expect(meetupVideo).toHaveAttribute('preload', 'none');
      expect(await meetupVideo.evaluate(({controls, muted, loop, playsInline}) => ({controls, muted, loop, playsInline})))
        .toEqual({controls:true, muted:true, loop:true, playsInline:true});
      await expect.poll(() => meetupVideo.evaluate(video => video.duration)).toBeCloseTo(5, 0);
      await expect.poll(() => meetupVideo.evaluate(video => video.currentTime)).toBeGreaterThan(0);
      await press(meetupToggle);
      await expect(meetupVideo).toBeHidden();
      await expect.poll(() => meetupVideo.evaluate(video => video.paused)).toBe(true);
      if (viewport.width === 390) {
        await page.emulateMedia({reducedMotion:'reduce'});
        await press(meetupToggle);
        await expect(meetupVideo).toBeVisible();
        expect(await meetupVideo.evaluate(video => video.paused)).toBe(true);
        await meetupVideo.evaluate(video => video.play());
        expect(await meetupVideo.evaluate(video => video.paused)).toBe(false);
        await press(meetupToggle);
        await expect.poll(() => meetupVideo.evaluate(video => video.paused)).toBe(true);
        await page.emulateMedia({reducedMotion:'no-preference'});
      }

      await expect(team.getByRole('heading', {name:'브랜디액션 팀의 실제 AI 사무실', exact:true})).toBeVisible();
      const photo = team.locator('img[src="/campus/showcase/ai-office-real-enhanced-v3.webp"]');
      const caption = team.locator('figcaption').filter({hasText:'직원마다 맡은 일이 있어요.'});
      await expect(caption).toHaveText('직원마다 맡은 일이 있어요. 사람은 확인하고 승인만 해요.');
      await caption.scrollIntoViewIfNeeded();
      await expect(photo).toBeInViewport({ratio:.95});
      await expect.poll(() => photo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await hitTarget(freeMaterials);
      await capture('team-office-photo');

      const officeVideo = team.locator('video[aria-label="브랜디액션 팀의 AI 사무실 업무 화면"]');
      await expect(officeVideo).toBeHidden();
      await press(team.getByText('AI 사무실 영상 보기', {exact:true}));
      await expect(officeVideo).toBeVisible();
      const video = await officeVideo.elementHandle();
      await expect(officeVideo).toHaveAttribute('src','/campus/arrival/team-at-work.mp4');
      expect(await video.evaluate(element => element.clientHeight > element.clientWidth)).toBe(true);
      videoPlayed = await video.evaluate(async element => {
        element.muted = true;
        try {await element.play(); return !element.paused;}
        catch {return false;}
      });
      if (videoPlayed) await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
      await press(freeMaterials);
      await expect(team).not.toBeVisible();
      await expect(guide.getByRole('heading', {name:'무료자료 · 라이브 특전', exact:true})).toBeFocused();
      await expect(guide.getByRole('button', {name:'무료자료', exact:true})).toHaveAttribute('aria-pressed', 'true');
      await expect(guide.getByRole('heading', {name:'라이브 전에 볼 자료', exact:true})).toBeVisible();
      await expect(officeVideo).toHaveCount(0);
      await expect(meetupVideo).toHaveCount(0);
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
