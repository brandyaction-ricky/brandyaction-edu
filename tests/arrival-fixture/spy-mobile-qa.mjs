import {chromium, expect, webkit} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spyActions} from './review-office.mjs';

const url = new URL(process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4529/experience/moonshot');
if (url.pathname === '/') url.pathname = '/experience/moonshot';
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});

const devices = [
  {name: 'pc', engine: chromium, viewport: {width: 1280, height: 720}, mobile: false},
  // Exercise the reduced viewport available inside a mobile browser.
  {name: 'mobile-compact', engine: webkit, viewport: {width: 360, height: 590}, mobile: true},
];

for (const {name, engine, viewport, mobile} of devices) {
  const browser = await engine.launch();
  const page = await browser.newPage({viewport, isMobile: mobile, hasTouch: mobile});
  const tap = element => mobile ? element.tap() : element.click();
  const button = (root, label) => root.getByRole('button', {name: label, exact: true});
  const capture = stage => output && page.screenshot({path: resolve(output, name + '-' + stage + '.png')});
  const frame = page.frameLocator('iframe[title*="직원 사무실"]');
  const walk = frame.locator('#walk');
  const floor = frame.locator('#floor');
  const dialog = page.getByRole('dialog', {name: '경쟁사 스파이'});
  const transcript = dialog.getByRole('region', {name: '경쟁사 스파이와 나눈 대화'});
  const reply = transcript.locator('[data-spy-reply]');
  const action = index => button(dialog, spyActions[index]);
  const close = button(dialog, '복도로 돌아가기');
  const position = () => walk.evaluate(node => [Number(node.dataset.playerX), Number(node.dataset.playerZ)]);
  const distanceFrom = async ([oldX, oldZ]) => {
    const [x, z] = await position();
    return Math.hypot(x - oldX, z - oldZ);
  };
  const clickBehindDesk = async () => {
    const bounds = await floor.boundingBox();
    const x = bounds.x + bounds.width * (mobile ? .09 : .26);
    const y = bounds.y + bounds.height * (mobile ? .675 : .77);
    if (mobile) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };
  const scrollPosition = () => transcript.evaluate(node => ({
    top: node.scrollTop,
    remaining: node.scrollHeight - node.clientHeight - node.scrollTop,
    height: node.clientHeight,
  }));

  try {
    await page.addInitScript(() => {
      if (window !== window.top) return;
      const visit = JSON.stringify({version: 1, step: 0, station: 2, spyPhase: 'intro'});
      localStorage.setItem('moonshot:arrival:synthetic-local-qa:v1', visit);
      localStorage.setItem('moonshot:arrival:2026-12-07:v1', visit);
    });
    await page.goto(url.href);
    await expect(walk).toHaveAttribute('data-ready', 'true', {timeout: 30_000});
    await expect(walk).toHaveAttribute('data-station', '2');
    await tap(frame.getByRole('button', {name: /쪽으로 걷기/}));
    await tap(frame.getByRole('button', {name: /열기$/}));
    await expect(dialog).toBeVisible();
    await expect(close).toBeInViewport({ratio: 0.95});
    await expect(action(0)).toBeInViewport({ratio: 0.95});
    const panel = await dialog.boundingBox();
    expect(panel.height).toBeGreaterThan(250);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
    expect(await transcript.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await capture('spy-open');

    // Keep the order of committed DOM batches so a single render with all three
    // bubbles would fail even if their final DOM order happened to be right.
    await transcript.evaluate(element => {
      window.spyReplyBatches = [];
      let previous = '';
      new MutationObserver(() => {
        const batch = Array.from(element.querySelectorAll('[data-spy-reply]'), node => node.dataset.spyReply).join(',');
        if (batch && batch !== previous) {
          previous = batch;
          window.spyReplyBatches.push(batch);
        }
      }).observe(element, {childList: true, subtree: true});
    });
    await tap(action(0));
    await expect(reply).toHaveCount(3);
    await expect(reply.nth(0)).toContainText('경쟁사 3곳을 조사했어요!');
    await expect(reply.nth(1).getByRole('article')).toHaveCount(2);
    await expect(reply.nth(2)).toContainText('두 예시 후기에 같은 질문이 있었어요');
    const batches = await page.evaluate(() => window.spyReplyBatches);
    expect(batches).toEqual(['summary', 'summary,reviews', 'summary,reviews,analysis']);
    await expect.poll(async () => (await scrollPosition()).remaining).toBeLessThan(16);
    const afterReviews = await scrollPosition();
    if (mobile) expect(afterReviews.top).toBeGreaterThan(0);
    await expect(action(1)).toBeInViewport({ratio: 0.95});
    await expect(button(dialog, '이 질문을 광고에 반영하기')).toBeInViewport({ratio: 0.95});
    await capture('spy-replies');

    if (mobile) {
      // Reset only the transcript scroll position, then send from the pinned footer.
      // This makes a missing follow-new-message behavior fail without a Playwright scroll.
      await transcript.evaluate(node => {node.scrollTop = 0;});
      await expect.poll(async () => (await scrollPosition()).top).toBe(0);
      await expect(action(1)).toBeInViewport({ratio: 0.95});
    } else if (afterReviews.top > 0) {
      await transcript.hover();
      await page.mouse.wheel(0, -120);
      await expect.poll(async () => (await scrollPosition()).top).toBeLessThan(afterReviews.top);
    }
    await tap(action(1));
    await expect(transcript.getByText('10~15분 사용 후 떼어내세요.', {exact: true})).toBeVisible();
    await expect.poll(async () => (await scrollPosition()).remaining).toBeLessThan(16);
    expect((await scrollPosition()).top).toBeGreaterThan(afterReviews.top);
    await expect(action(2)).toBeInViewport({ratio: 0.95});

    const before = await position();
    await tap(close);
    await expect(dialog).not.toBeVisible();
    if (mobile) {
      // The walkable floor behind the avatar, away from the blue marker.
      await clickBehindDesk();
    } else {
      await expect(floor).toBeFocused();
      await page.keyboard.down('ArrowLeft');
    }
    try {
      await expect.poll(() => distanceFrom(before)).toBeGreaterThan(.75);
    } finally {
      if (!mobile) await page.keyboard.up('ArrowLeft');
    }
    await expect(walk).toHaveAttribute('data-paused', 'false');
    await expect(walk).toHaveAttribute('data-near-desk', 'false');
    await expect(dialog).not.toBeVisible();
    await capture('spy-corridor');
    await tap(frame.getByRole('button', {name: /쪽으로 걷기/}));
    await tap(frame.getByRole('button', {name: /열기$/}));
    await expect(dialog).toBeVisible();
    await expect(action(0)).toHaveCount(0);
    await expect(action(2)).toBeInViewport({ratio: 0.95});
    await expect.poll(async () => (await scrollPosition()).remaining).toBeLessThan(16);
    if (!mobile) {
      const next = await position();
      await tap(close);
      await expect(dialog).not.toBeVisible();
      await clickBehindDesk();
      await expect.poll(() => distanceFrom(next)).toBeGreaterThan(.75);
      await expect(walk).toHaveAttribute('data-near-desk', 'false');
    } else {
      await tap(button(dialog, '이 질문을 광고에 반영하기'));
      await expect(dialog).not.toBeVisible();
      await expect(walk).toHaveAttribute('data-station', '3');
    }
    console.log(JSON.stringify({name, viewport, replies: batches.length, panelHeight: panel.height, afterReviews, corridorInput: mobile ? 'touch' : 'keyboard and mouse'}));
  } catch (error) {
    await capture('spy-failure');
    throw error;
  } finally {
    await browser.close();
  }
}
