import {chromium, expect} from '@playwright/test';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {finishOfficeReview, finishTeamLeaderVideo, loungeScheduleButton, openLoungeSchedule, spyActions, teamLeaderGuide, teamLeaderNext} from './review-office.mjs';

const base = process.env.ARRIVAL_QA_URL ?? 'http://127.0.0.1:4529';
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true});
try {
  for (const [device, viewport] of [['pc', {width: 1440, height: 900}], ['mobile', {width: 390, height: 844}], ['small-mobile', {width: 320, height: 568}]]) {
    const mobile = device !== 'pc';
    const page = await browser.newPage({viewport, isMobile: mobile, hasTouch: mobile, permissions:['clipboard-read','clipboard-write']});
    const errors = [], externalAI = [], maskVideoRequests = [], arrivals = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => {
      if (/^https:\/\/(chatgpt\.com|claude\.ai|api\.openai\.com|api\.anthropic\.com)\//.test(r.url())) externalAI.push(r.url());
      if (new URL(r.url()).pathname === '/campus/arrival/mask-example-silent.mp4') maskVideoRequests.push(r.url());
    });
    const frame = page.frameLocator('iframe[title*="직원 사무실"]');
    const marker = frame.getByRole('button', {name:/쪽으로 걷기/});
    const openDesk = frame.getByRole('button', {name:/열기$|입장하기$/});
    const state = frame.locator('#walk');
    const button = (root, name) => root.getByRole('button',{name, exact:true});
    async function capture(stage) {
      if (output) await page.screenshot({path:resolve(output, device+'-'+stage+'.png'), animations:'disabled'});
    }
    async function walk(station) {
      await expect(state).toHaveAttribute('data-ready','true');
      await expect(state).toHaveAttribute('data-station', String(station));
      const count = Number(await state.getAttribute('data-arrivals'));
      const from = Number(await state.getAttribute('data-player-x'));
      if (await state.getAttribute('data-near-desk') === 'true') {
        if (mobile) await openDesk.tap(); else await openDesk.click();
        await expect(station === 7 ? loungeScheduleButton(page) : page.getByRole('dialog')).toBeVisible();
        await expect(state).toHaveAttribute('data-arrivals', String(count));
        return;
      }
      await expect(marker).toBeVisible({timeout:60000});
      if (mobile) await marker.tap(); else await marker.click();
      await expect(state).toHaveAttribute('data-arrivals', String(count+1), {timeout:20000});
      const to = Number(await state.getAttribute('data-player-x'));
      expect(Math.abs(to-(station === 7 ? 32 : (station-1)*8))).toBeLessThan(.75);
      arrivals.push({station,from,to});
      if (station !== 1) {
        await expect(state).toHaveAttribute('data-near-desk', 'true');
        await expect(openDesk).toBeVisible();
        await expect(page.getByRole('dialog')).not.toBeVisible();
        if (station === 2) await capture('spy-arrived');
        if (mobile) await openDesk.tap(); else await openDesk.click();
        await expect(state).toHaveAttribute('data-arrivals', String(count+1));
      }
    }
    const worldPosition = () => state.evaluate(element => [element.dataset.playerX, element.dataset.playerZ, element.dataset.arrivals]);
    let positionBeforeLeave;
    async function beforeLeave() {
      await expect(state).toHaveAttribute('data-moving', 'false');
      positionBeforeLeave = await worldPosition();
    }
    async function afterLeave(station) {
      await expect(state).toHaveAttribute('data-station', String(station === 4 ? 7 : station+1));
      await expect(state).toHaveAttribute('data-moving', 'false');
      await expect(marker).toBeVisible();
      expect(await worldPosition()).toEqual(positionBeforeLeave);
      await expect(page.getByRole('dialog')).not.toBeVisible();
      if (station === 2) expect(maskVideoRequests).toEqual([]);
    }
    async function inspectLeader(guide) {
      const intro = guide.getByRole('heading', {name:'팀장의 첫 업무 보고', exact:true});
      const start = button(guide,'텔레그램 영상 보기');
      const next = teamLeaderNext(guide);
      const video = guide.locator('video');
      const fullscreen = button(guide,'전체 화면');
      const seek = guide.getByRole('slider', {name:'재생 위치', exact:true});
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(intro).toBeVisible();
      await expect(start).toBeInViewport({ratio:0.95});
      await expect(video).toHaveCount(0);
      await expect(next).toBeInViewport({ratio:0.95});
      await expect(guide.getByText('마스크팩을 붙이고 자도 될까요?', {exact:true})).toBeVisible();
      await capture('leader-intro');
      if (device === 'small-mobile') {
        await page.evaluate(() => {
          const play = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function() {
            HTMLMediaElement.prototype.play = play;
            window.__leaderAutoplayBlocked = true;
            return Promise.reject(new DOMException('Autoplay blocked for this QA run', 'NotAllowedError'));
          };
        });
      }
      await start.click();
      await expect(video).toHaveAttribute('src', '/campus/arrival/team-leader-telegram.mp4');
      await expect(video).toHaveAttribute('aria-label', '텔레그램에서 AI 직원에게 일을 맡기고 보고받는 모습');
      await expect(page.locator('iframe[title*="직원 사무실"]')).toBeVisible();
      await expect(fullscreen).toBeInViewport({ratio:0.95});
      await expect(seek).toBeInViewport({ratio:0.95});
      expect(await guide.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(next).toBeInViewport({ratio:0.95});
      if (device === 'small-mobile') {
        await expect.poll(() => page.evaluate(() => window.__leaderAutoplayBlocked)).toBe(true);
        await button(guide,'재생').click();
      }
      await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
      expect(await video.evaluate(element => ({muted:element.muted, loop:element.loop, width:element.videoWidth, height:element.videoHeight})))
        .toEqual({muted:true, loop:false, width:464, height:848});
      await capture('leader-playing');
      if (!mobile) {
        await button(guide,'일시정지').click();
        await expect.poll(() => video.evaluate(element => element.paused)).toBe(true);
        const startTime = Number(await seek.inputValue());
        await seek.press('ArrowRight');
        await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(startTime);
        await expect(button(guide,'재생')).toBeVisible();
        if (await page.evaluate(() => document.fullscreenEnabled)) {
          await fullscreen.click();
          await expect.poll(() => video.evaluate(element => document.fullscreenElement?.contains(element))).toBe(true);
          await expect.poll(() => video.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain');
          await button(guide,'전체 화면 닫기').click();
          await expect(fullscreen).toBeVisible();
        }
        await button(guide,'재생').click();
        await page.keyboard.press('Escape');
        await expect(guide).toHaveCount(0);
        await expect(video).toHaveCount(0);
        await page.locator('#arrival-desk-button').click();
        await expect(intro).toBeVisible();
        await expect(video).toHaveCount(0);
        await start.click();
      }
      await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
      await video.evaluate(element => {element.pause(); element.currentTime = 4.5;});
      await expect.poll(async () => Number(await seek.inputValue())).toBe(4.5);
      await expect(next).toBeInViewport({ratio:0.95});
      await video.evaluate(element => {element.currentTime = 5;});
      await expect(next).toBeVisible();
      expect(await video.evaluate(element => element.ended)).toBe(false);
      await video.evaluate(element => {element.currentTime = 1;});
      await expect.poll(async () => Number(await seek.inputValue())).toBe(1);
      await expect(next).toBeVisible();
      await expect(next).toBeInViewport({ratio:0.95});
      await capture('leader-next-during-video');
      await button(guide,'재생').click();
      await finishTeamLeaderVideo(guide);
      await expect.poll(() => video.evaluate(element => element.ended)).toBe(true);
      await next.scrollIntoViewIfNeeded();
      await expect(next).toBeInViewport({ratio:0.95});
      await capture('leader-complete');
      if (!mobile) {
        await button(guide,'다시 재생').click();
        await expect(next).toBeVisible();
        await finishTeamLeaderVideo(guide);
      }
    }
    async function inspect(station, dialog) {
      if (station === 1) await inspectLeader(dialog);
      else expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      if (station === 2) {
        const conversation = dialog.getByRole('region', {name:'경쟁사 스파이와 나눈 대화'});
        const reviews = dialog.getByRole('group', {name:'가상 리뷰 재구성'});
        if (!mobile) {
          await button(dialog,'복도로 돌아가기').click();
          const floor = frame.locator('#floor');
          await expect(floor).toBeFocused();
          const deskX = Number(await state.getAttribute('data-player-x'));
          await page.keyboard.down('ArrowLeft');
          try {await expect.poll(async () => Number(await state.getAttribute('data-player-x'))).toBeLessThan(deskX - 1);}
          finally {await page.keyboard.up('ArrowLeft');}
          await expect(state).toHaveAttribute('data-near-desk','false');
          await expect(dialog).not.toBeVisible();
          await walk(2);
        }
        await expect(conversation).toContainText('우리 광고에서 고객에게 더 알려줄 점을 찾아요.');
        await expect(dialog.getByRole('textbox')).toHaveCount(0);
        await expect(reviews).toHaveCount(0);
        // Dispatch a duplicate tap before React commits the next phase.
        await button(dialog, spyActions[0]).evaluate(element => {element.click(); element.click();});
        await expect(dialog.getByRole('status').filter({hasText:'답변을 작성 중이에요.'})).toBeAttached();
        await expect(reviews).toHaveCount(1);
        await expect(reviews.getByRole('article')).toHaveCount(2);
        await expect(reviews.getByText('별점 2점', {exact:true})).toHaveCount(1);
        await expect(reviews.getByText('별점 3점', {exact:true})).toHaveCount(1);
        await expect(reviews.getByRole('heading', {name:'오래 붙이면 더 좋은 줄 알았어요'})).toBeVisible();
        await expect(reviews.getByRole('heading', {name:'붙이고 자도 되나요?'})).toBeVisible();
        await expect(conversation).toContainText('팩을 붙이고 얼마나 기다려야 하죠?');
        await capture('spy-reviews');
        await page.reload({waitUntil:'domcontentloaded'});
        await walk(2);
        await expect(reviews.getByRole('article')).toHaveCount(2);
        await expect(button(dialog, spyActions[0])).toHaveCount(0);
        await button(dialog, spyActions[1]).click();
        await expect(conversation.getByText('10~15분 사용 후 떼어내세요.', {exact:true})).toBeVisible();
        await button(dialog, spyActions[2]).click();
        for (const label of ['고객의 불편', '우리 상품의 기준', '맡긴 일']) {
          await expect(conversation.getByText(label, {exact:true})).toHaveCount(1);
        }
        await capture('spy-handoff');
      }
      if (station === 3) {
        const film = dialog.locator('figure');
        const video = film.locator('video');
        await expect(film.getByText('AI만으로 제작한 영상', {exact:true})).toBeVisible();
        await expect(video).toHaveAttribute('src', '/campus/arrival/mask-example-silent.mp4');
        await expect.poll(() => video.evaluate(element => element.videoWidth)).toBeGreaterThan(0);
        expect(await video.evaluate(element => element.muted && element.playsInline && element.controls)).toBe(true);
        await expect(film.getByText('마스크팩, 붙이고 자도 될까요?', {exact:true})).toBeVisible();
        await video.evaluate(element => element.play());
        await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0);
        await video.evaluate(element => element.pause());
        await video.evaluate(element => {element.currentTime = 5;});
        await expect(film.getByText('우리 제품의 권장 사용 시간 10~15분', {exact:true})).toBeVisible();
        await capture('content-example');
        await video.evaluate(element => {element.currentTime = 9.2;});
        await expect(film.getByText('사용 전, 제품의 사용 가이드를 확인하세요.', {exact:true})).toBeVisible();

        await expect(button(dialog,'소개할 상품이 있어요')).toHaveAttribute('aria-pressed', 'true');
        const create = button(dialog,'AI에 보낼 말 만들기');
        const copy = button(dialog,'보낼 말 복사');
        const ownInputs = [
          [/상품·서비스/, '검수용 반려동물 방문 사진'],
          [/비교할 경쟁사/, '검수용 A 사진팀'],
          [/어떤 고객/, '낯선 스튜디오에서 긴장하는 반려견 보호자'],
          [/고객이 자주 묻는 것과 우리 상품의 특징/, '예약 전 실제 포트폴리오를 보여드립니다.'],
        ];
        await expect(create).toBeDisabled();
        const firstField = dialog.getByRole('textbox', {name:ownInputs[0][0]});
        await firstField.fill(' ');
        await expect(create).toBeDisabled();
        for (const [name, value] of ownInputs) await dialog.getByRole('textbox', {name}).fill(value);
        await create.click();
        await dialog.getByText('보낼 말 보기', {exact:true}).click();
        const prompt = dialog.getByRole('textbox', {name:'AI에 보낼 말'});
        const generated = await prompt.inputValue();
        for (const [, value] of ownInputs) expect(generated).toContain(value);
        for (const requirement of ['실제로 읽은 자료의 URL', '웹이나 일부 자료를 열 수 없으면', '첫 3초', '장면표', '공개 전에 검수']) expect(generated).toContain(requirement);
        await copy.click();
        await expect(dialog.getByRole('status')).toContainText('복사했어요.');
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(generated);
        await expect(dialog.getByRole('link', {name:'ChatGPT 열기'})).toHaveAttribute('href','https://chatgpt.com/');
        await expect(dialog.getByRole('link', {name:'Claude 열기'})).toHaveAttribute('href','https://claude.ai/new');
        await capture('content-prompt');
        await firstField.fill('');
        await expect(create).toBeDisabled();
        await expect(copy).toHaveCount(0);
        await button(dialog,'마스크팩 예시 넣기').click();
        await create.click();
        await dialog.getByText('보낼 말 보기', {exact:true}).click();
        await expect(prompt).toHaveValue(/검색하거나 실제 조사처럼 설명하지 말고/);
        expect(await prompt.inputValue()).not.toContain(ownInputs[0][1]);
      }
      if (station === 4) {
        await dialog.getByText('직원들이 참고한 자료와 대화 보기', {exact:true}).click();
        const map = dialog.getByRole('region',{name:'직원들이 함께 보는 자료'});
        await expect(map.getByRole('listitem')).toHaveCount(12);
        await expect(map.getByRole('status')).toHaveText('아직 직원들에게 알려준 내용이 없어요.');
        await capture('principle');
      }
    }
    try {
      await page.goto(new URL('/experience/moonshot', base).href);
      await expect(marker).toBeVisible({timeout:60000});
      await expect(marker).toContainText('고객이 남긴 질문 하나');
      await expect(teamLeaderGuide(page)).toHaveCount(0);
      await expect(page.locator('video')).toHaveCount(0);
      await page.evaluate(()=>document.fonts.ready);
      await capture('entry');
      await finishOfficeReview(page,{walk,inspect,beforeLeave,afterLeave});
      await expect(page.getByRole('heading',{name:'지금 어떤 상황이신가요?'})).toBeVisible();
      if (mobile) {
        await page.getByRole('button', {name:/이미 사업을 하고 있어요/}).tap();
        await button(page,'입력 없이 예시로 계속하기').tap();
        await expect(page.getByText('체험 예시 확인')).toBeVisible();
        await button(page,'웰컴 라운지로 이동').tap();
      } else {
        await page.getByRole('button',{name:/회사 업무에 AI/}).click();
        await button(page,'예시 업무로 시작').click();
        await button(page,'이 기준으로 첫 업무 맡기기').click();
        await button(page,'예시 메모 넣기').click();
        await button(page,'기준과 자료 함께 복사').click();
        await button(page,'첫 답변을 받았어요').click();
        const note='결정이 필요한 내용을 먼저 보여주세요.';
        await page.getByRole('textbox',{name:'내 말로 수정하기'}).fill(note);
        await button(page,'고쳐 달라는 말 복사').click();
        await button(page,'수정한 답변을 확인했어요').click();
        await button(page,'예시 메모 넣기').click();
        await page.reload();
        await expect(page.locator('[data-work-step]')).toHaveAttribute('data-work-step','3');
        await button(page,'기준과 자료 함께 복사').click();
        const reused=await page.evaluate(()=>navigator.clipboard.readText());
        expect(reused).toContain(note);
        expect(reused).toContain('워크숍');
        expect(reused).not.toContain('신입 동료 안내자료');
        await button(page,'두 번째 답변을 받았어요').click();
        await button(page,'라이브에서 이어서 배우기').click();
      }
      await openLoungeSchedule(page);
      const calendar = page.getByRole('link',{name:'Google 캘린더'});
      await expect(calendar).toBeVisible();
      const google=new URL(await calendar.getAttribute('href'));
      expect(google.hostname).toBe('calendar.google.com');
      expect(google.searchParams.get('dates')).toContain('20261207T120000Z');
      const saved=page.waitForEvent('download');
      await button(page,'아이폰·기타 캘린더').click();
      const download=await saved;
      const file=await readFile(await download.path(),'utf8');
      expect(download.suggestedFilename()).toMatch(/20261207\.ics$/);
      expect(file).toMatch(/DTSTART:20261207T120000Z/);
      await expect(page.getByRole('status').filter({hasText:'받은 파일을 열어'})).toBeInViewport({ratio: 0.95});
      await capture('hall');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      expect(externalAI).toEqual([]);
      console.log(JSON.stringify({device,viewport,arrivals,exceptions:errors,google:google.hostname,ics:download.suggestedFilename()}));
    } catch(error) {await capture('failure'); throw error;}
    finally {await page.close();}
  }
} finally {await browser.close();}
