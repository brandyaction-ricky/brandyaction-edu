import {chromium, expect} from '@playwright/test';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {finishOfficeReview} from './review-office.mjs';

const base = process.env.ARRIVAL_QA_URL ?? 'http://127.0.0.1:4529';
const output = process.env.ARRIVAL_QA_OUTPUT;
const rules = ['읽는 사람이 오늘 할 일로 시작한다.', '직원이 완성한 결과물을 먼저 보여준다.'];
if (output) await mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true});
try {
  for (const [device, viewport] of [['pc', {width: 1440, height: 900}], ['mobile', {width: 390, height: 844}]]) {
    const mobile = device === 'mobile';
    const page = await browser.newPage({viewport, isMobile: mobile, hasTouch: mobile, permissions:['clipboard-read','clipboard-write']});
    const errors = [], externalAI = [], arrivals = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/^https:\/\/(chatgpt\.com|claude\.ai|api\.openai\.com|api\.anthropic\.com)\//.test(r.url())) externalAI.push(r.url()); });
    const frame = page.frameLocator('iframe[title*="직원 사무실"]');
    const marker = frame.getByRole('button', {name:/쪽으로 걷기/});
    const state = frame.locator('#walk');
    const button = (root, name) => root.getByRole('button',{name, exact:true});
    async function capture(stage) {
      if (output) await page.screenshot({path:resolve(output, device+'-'+stage+'.png')});
    }
    async function walk(station) {
      await expect(marker).toBeVisible({timeout:60000});
      await expect(state).toHaveAttribute('data-ready','true');
      await expect(state).toHaveAttribute('data-station', String(station));
      const count = Number(await state.getAttribute('data-arrivals'));
      const from = Number(await state.getAttribute('data-player-x'));
      if (mobile) await marker.tap(); else await marker.click();
      await expect(state).toHaveAttribute('data-arrivals', String(count+1), {timeout:20000});
      const to = Number(await state.getAttribute('data-player-x'));
      expect(Math.abs(to-(station-1)*8)).toBeLessThan(.75);
      arrivals.push({station,from,to});
    }
    async function inspect(station, dialog) {
      if (station === 1) {
        const image=dialog.getByRole('img');
        expect(await image.evaluate(async el => {await el.decode();return el.naturalWidth;})).toBeGreaterThan(0);
        const video=dialog.locator('video');
        await expect(video).toHaveAttribute('controls','');
        await expect.poll(() => video.evaluate(el=>el.readyState)).toBeGreaterThan(0);
        await video.evaluate(async el=>{el.muted=true; await el.play();});
        await expect.poll(()=>video.evaluate(el=>el.currentTime)).toBeGreaterThan(0);
        await video.evaluate(el=>el.pause());
      }
      if (station === 2) {
        const sources=dialog.getByRole('link', {name:'원문 열기'});
        expect((await sources.evaluateAll(links=>links.map(a=>new URL(a.href).hostname))).sort()).toEqual(['brandyaction-edu.com','grow.google','www.coursera.org']);
        await expect(dialog.getByRole('heading',{name:'조사 담당자의 해석'})).toBeVisible();
      }
      if (station === 3) {
        for (let i=0;i<2;i++) {
          await button(dialog,rules[i]).click();
          await expect(dialog.getByText(i===0?/오늘 보낼 광고와 답장/:/광고 첫 문장과 고객 답변 초안/)).toBeVisible();
          if (!i) await button(dialog,'다른 피드백으로 비교하기').click();
        }
        await button(dialog,'이 문장으로 승인하기').click();
        await button(dialog,'복도로 돌아가기').click();
        await expect(dialog).not.toBeVisible();
        await walk(3);
        await expect(dialog.getByText(/광고 첫 문장과 고객 답변 초안/)).toBeVisible();
        await page.reload({waitUntil:'domcontentloaded'});
        await walk(3);
        await expect(dialog.getByRole('heading',{name:'이 소개글로 승인했어요.'})).toBeVisible();
      }
      if (station === 4) await expect(dialog.getByText('상품 소개 페이지 담당자에게 전할 제안')).toBeVisible();
      if (station === 5) {
        const changes=[];
        for (const rule of rules) {
          await button(dialog,rule).click();
          const revised=dialog.locator('[aria-live="polite"]');
          const copy=await revised.getByText('기준을 적용한 소개글 · 예시',{exact:true}).locator('..').locator('p').last().innerText();
          const reply=await revised.getByText('기준을 적용한 답변 · 예시',{exact:true}).locator('..').locator('p').last().innerText();
          changes.push([copy,reply]);
        }
        expect(changes[0][0]).not.toBe(changes[1][0]);
        expect(changes[0][1]).not.toBe(changes[1][1]);
        await capture('principle');
        await button(dialog,'복도로 돌아가기').click();
        await walk(5);
        await expect(button(dialog,rules[1])).toHaveAttribute('aria-pressed','true');
      }
    }
    try {
      await page.goto(new URL('/experience/moonshot', base).href);
      await expect(marker).toBeVisible({timeout:60000});
      await page.evaluate(()=>document.fonts.ready);
      await capture('entry');
      await finishOfficeReview(page,{walk,inspect});
      await expect(page.getByRole('heading',{name:'지금 어떤 상황이신가요?'})).toBeVisible();
      if (mobile) {
        await page.locator('[aria-label="내 상황에 맞는 체험 선택"] button').first().tap();
        await button(page,'입력 없이 예시로 계속하기').tap();
        await expect(page.getByText('체험 예시 확인')).toBeVisible();
        await button(page,'라이브 홀로 이동').tap();
      } else {
        await page.getByRole('button',{name:/회사 업무에 AI/}).click();
        await button(page,'예시 업무로 시작').click();
        await button(page,'이 기준으로 첫 업무 맡기기').click();
        await button(page,'예시 메모 넣기').click();
        await button(page,'기준과 자료 함께 복사').click();
        await button(page,'첫 답변을 받았어요').click();
        const note='결정이 필요한 내용을 먼저 보여주세요.';
        await page.getByRole('textbox',{name:'내 말로 수정하기'}).fill(note);
        await button(page,'피드백 반영 요청 복사').click();
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
      await walk(7);
      const google=new URL(await page.getByRole('link',{name:'Google 캘린더'}).getAttribute('href'));
      expect(google.hostname).toBe('calendar.google.com');
      expect(google.searchParams.get('dates')).toContain('20261207T120000Z');
      const saved=page.waitForEvent('download');
      await button(page,'아이폰·기타 캘린더').click();
      const download=await saved;
      const file=await readFile(await download.path(),'utf8');
      expect(download.suggestedFilename()).toMatch(/20261207\.ics$/);
      expect(file).toMatch(/DTSTART:20261207T120000Z/);
      await capture('hall');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
      expect(externalAI).toEqual([]);
      console.log(JSON.stringify({device,viewport,arrivals,exceptions:errors,google:google.hostname,ics:download.suggestedFilename()}));
    } catch(error) {await capture('failure'); throw error;}
    finally {await page.close();}
  }
} finally {await browser.close();}
