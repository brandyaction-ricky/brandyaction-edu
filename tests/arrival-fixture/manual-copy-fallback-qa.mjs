import {finishOfficeReview, resumeExerciseFixture} from './review-office.mjs';
import {chromium, expect} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const base = process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4499';
const path = process.env.ARRIVAL_QA_PATH || '/arrival';
const out = process.env.ARRIVAL_QA_OUTPUT || '/private/tmp/moonshot-manual-copy-fallback-qa';
await mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true});
const results = [];

try {
  for (const [device, viewport] of [['pc', {width: 1440, height: 723}], ['mobile', {width: 390, height: 844}]]) {
    const context = await browser.newContext({viewport, hasTouch: device === 'mobile', isMobile: device === 'mobile', deviceScaleFactor: 1});
    // Deterministic denial in every stage. The exercise still advances only through
    // visible visitor confirmations; this synthetic QA does not call a personal AI.
    await context.addInitScript(() => {
      window.__deniedClipboardWrites = 0;
      Object.defineProperty(navigator.clipboard, 'writeText', {configurable: true, value: async () => {
        window.__deniedClipboardWrites += 1;
        throw new DOMException('Clipboard permission denied for synthetic QA', 'NotAllowedError');
      }});
    });
    const page = await context.newPage();
    const errors = [], apiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());});
    const step = page.locator('[data-work-step]');
    async function copyPromptAndConfirm(copyLabel, responseLabel, answer) {
      await page.getByRole('button', {name: copyLabel, exact: true}).click();
      await expect(page.getByRole('textbox', {name: '직접 복사할 전체 요청문', exact: true})).toBeVisible();
      await page.getByRole('button', {name: '직접 복사했어요', exact: true}).click();
      const proceed = page.getByRole('button', {name: responseLabel, exact: true});
      if (answer) {
        await expect(proceed).toBeDisabled();
        await page.getByRole('textbox', {name:'받은 답변을 여기에 붙여넣기', exact:true}).fill(answer);
      }
      await proceed.click();
    }
    try {
      await page.goto(base + path, {waitUntil: 'domcontentloaded'});
      await finishOfficeReview(page, {inspect: async (station, dialog) => {
        if (station !== 3) return;
        await dialog.getByRole('button', {name:'마스크팩 예시 넣기', exact:true}).click();
        await dialog.getByRole('button', {name:'요청문 만들기', exact:true}).click();
        await dialog.getByRole('button', {name:'요청문 복사', exact:true}).click();
        await expect(dialog.getByRole('status')).toContainText('아래 요청문을 직접 복사해 주세요.');
        const manualPrompt = dialog.getByRole('textbox', {name:'생성한 요청문', exact:true});
        await expect(manualPrompt).toBeVisible();
        await expect(manualPrompt).toBeFocused();
        expect(await manualPrompt.evaluate(element => element.value.length > 0 && element.selectionStart === 0 && element.selectionEnd === element.value.length)).toBe(true);
      }});
      await resumeExerciseFixture(page, 'work');
      await expect(step).toHaveAttribute('data-work-step', '0');
      await page.getByRole('button', {name: '예시 업무로 시작', exact: true}).click();
      await page.getByRole('button', {name: '이 기준으로 첫 업무 맡기기', exact: true}).click();
      await page.getByRole('button', {name: '예시 메모 넣기', exact: true}).click();
      await copyPromptAndConfirm('기준과 자료 함께 복사', '이 답변으로 피드백하기', '복사를 직접 마친 뒤 가져온 첫 답변');
      await expect(step).toHaveAttribute('data-work-step', '2');
      const feedback = '확인된 사실과 제안을 구분하고, 결정할 사항마다 필요한 정보를 함께 보여줘.';
      await page.getByRole('textbox', {name: '내 말로 수정하기', exact: true}).fill(feedback);
      await copyPromptAndConfirm('피드백 반영 요청 복사', '수정한 답변을 확인했어요');
      await expect(step).toHaveAttribute('data-work-step', '3');
      await page.getByRole('button', {name: '예시 메모 넣기', exact: true}).click();
      await copyPromptAndConfirm('기준과 자료 함께 복사', '답변 검토 마치기', '복사를 직접 마친 뒤 가져온 두 번째 답변');
      await expect(step).toHaveAttribute('data-work-step', '4');

      const card = page.locator('article').filter({has: page.getByRole('heading', {name: '내 AI 직원의 업무 매뉴얼', exact: true})});
      const copyButton = card.getByRole('button', {name: '매뉴얼 복사', exact: true});
      await expect(copyButton).toHaveAttribute('data-copied', 'false');
      await copyButton.click();
      const status = card.getByRole('status');
      await expect(status).toContainText('브라우저에서 복사를 허용하지 않았어요');
      await expect(card.getByRole('button', {name: '매뉴얼 복사됨', exact: true})).toHaveCount(0);
      await expect(copyButton).toHaveAttribute('data-copied', 'false');
      const fallback = card.getByRole('textbox', {name: '직접 복사할 업무 매뉴얼', exact: true});
      await expect(fallback).toBeVisible();
      await expect(fallback).toBeFocused();
      const selection = await fallback.evaluate(element => ({start: element.selectionStart, end: element.selectionEnd, length: element.value.length, value: element.value}));
      expect(selection.start).toBe(0);
      expect(selection.end).toBe(selection.length);
      expect(selection.length).toBeGreaterThan(0);
      expect(selection.value).toContain(feedback);
      expect(selection.value).not.toContain('신입 동료 안내자료');
      expect(selection.value).not.toContain('팀 워크숍 준비 상황');
      // The denial message and selectable fallback are in the same manual card,
      // immediately following the action row, rather than a distant page toast.
      expect(await status.evaluate(element => element.nextElementSibling?.querySelector('textarea')?.value.length ?? 0)).toBe(selection.length);
      await page.screenshot({path: resolve(out, `${device}-manual-denied.png`)});
      await card.getByRole('button', {name: '직접 복사했어요', exact: true}).click();
      const confirmed = card.getByRole('button', {name: '매뉴얼 복사됨', exact: true});
      await expect(confirmed).toHaveAttribute('data-copied', 'true');
      await expect(status).toContainText('직접 복사한 매뉴얼을 메모장에 보관해 주세요');
      await expect(fallback).toHaveCount(0);
      expect(await page.evaluate(() => window.__deniedClipboardWrites)).toBe(5);
      await page.screenshot({path: resolve(out, `${device}-manual-confirmed.png`)});
      expect(errors).toEqual([]);
      expect(apiRequests).toEqual([]);
      results.push({device, viewport, passed: true, deniedWrites: 5, selectedContentStationPrompt: true, manualLength: selection.length, selectedEntireManual: true, falseCopiedLabelBeforeConfirmation: false, adjacentDenialStatus: true, explicitConfirmationLabel: '매뉴얼 복사됨', apiRequests: 0, errors});
    } catch (error) {
      await page.screenshot({path: resolve(out, `${device}-failure.png`)});
      throw error;
    } finally {await context.close();}
  }
  await writeFile(resolve(out, 'results.json'), JSON.stringify({base, path, results, scope: 'Synthetic browser UI and clipboard denial; no personal AI execution'}, null, 2));
  console.log(JSON.stringify({base, path, results}, null, 2));
} finally {await browser.close();}
