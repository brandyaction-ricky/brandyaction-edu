import {chromium, expect, webkit} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spyActions, teamLeaderGuide, teamLeaderNext} from './review-office.mjs';

const url = new URL(process.env.ARRIVAL_QA_URL ?? 'http://127.0.0.1:4560/experience/moonshot');
if (url.pathname === '/') url.pathname = '/experience/moonshot';
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});

const devices = [
  {name: 'desktop', engine: chromium, viewport: {width: 1280, height: 720}, mobile: false},
  {name: 'touch-320', engine: webkit, viewport: {width: 320, height: 460}, mobile: true},
  {name: 'touch-393', engine: webkit, viewport: {width: 393, height: 520}, mobile: true},
];

for (const {name, engine, viewport, mobile} of devices) {
  const browser = await engine.launch();
  const page = await browser.newPage({viewport, isMobile: mobile, hasTouch: mobile});
  const tap = element => mobile ? element.tap() : element.click();
  const button = (root, label) => root.getByRole('button', {name: label, exact: true});
  const capture = async stage => {
    if (output) await page.screenshot({path: resolve(output, `${name}-${stage}.png`)});
  };
  const frame = page.frameLocator('iframe[title*="직원 사무실"]');
  const world = frame.locator('#walk');
  const hostOpen = page.locator('#arrival-desk-button');
  const frameOpen = frame.getByRole('button', {name: /열기$/});
  const desk = page.getByRole('dialog');
  const requestedPaths = new Set();
  page.on('request', request => requestedPaths.add(new URL(request.url()).pathname));
  const modelPath = id => `/campus/world/office/vendor/assets/kenney/characters/character-${id}.glb`;
  const releaseModels = new Map();
  for (const id of ['female-d', 'male-b']) {
    const pending = new Promise(resolve => releaseModels.set(id, resolve));
    await page.route(`**${modelPath(id)}`, async route => {
      await pending;
      await route.continue();
    });
  }

  async function walkTo(station) {
    await expect(world).toHaveAttribute('data-station', String(station));
    const previousArrivals = Number(await world.getAttribute('data-arrivals'));
    await tap(frame.getByRole('button', {name: /쪽으로 걷기/}));
    await expect(world).toHaveAttribute('data-arrivals', String(previousArrivals + 1), {timeout: 20_000});
    if (station !== 1) await expect(world).toHaveAttribute('data-near-desk', 'true');
  }

  async function openFromHost() {
    await expect(hostOpen).toHaveText('내용 열기');
    await tap(hostOpen);
  }

  async function expectDeskVisible() {
    await expect(desk).toBeVisible();
    expect(await desk.evaluate(node => node.tagName)).not.toBe('DIALOG');
    await expect(desk).toHaveAttribute('aria-modal', 'true');
    // A visible backdrop can outlive a collapsed window. Check the window's own geometry.
    await expect.poll(() => desk.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      const view = window.visualViewport;
      const top = view?.offsetTop ?? 0;
      const bottom = top + (view?.height ?? window.innerHeight);
      return bounds.height >= 200 && bounds.top >= top - 1 && bounds.bottom <= bottom + 1;
    })).toBe(true);
    await expect(button(desk, '복도로 돌아가기')).toBeInViewport({ratio: .95});
    return (await desk.boundingBox()).height;
  }

  async function closeDesk() {
    await tap(button(desk, '복도로 돌아가기'));
    await expect(desk).not.toBeVisible();
    await expect(world).toHaveAttribute('data-paused', 'false');
  }

  try {
    await page.goto(url.href);
    await expect(world).toHaveAttribute('data-ready', 'true', {timeout: 30_000});
    expect(requestedPaths.has(modelPath('male-a'))).toBe(true);
    expect(requestedPaths.has(modelPath('female-c'))).toBe(true);
    expect(requestedPaths.has(modelPath('female-d'))).toBe(false);
    expect(requestedPaths.has(modelPath('male-b'))).toBe(false);
    if (mobile) {
      await expect.poll(async () => {
        const marker = await frame.getByRole('button', {name: /쪽으로 걷기/}).boundingBox();
        const avatar = await button(page, '내 캐릭터').boundingBox();
        const welcome = await page.getByRole('region', {name: '문샷 웰컴존 소개'}).boundingBox();
        return Boolean(marker && avatar && welcome && marker.x + marker.width <= avatar.x && marker.y + marker.height <= welcome.y);
      }).toBe(true);
    }
    await capture('entry');
    await walkTo(1);
    const leader = teamLeaderGuide(page);
    await expect(leader).toBeVisible();
    await expect(leader.locator('video')).toHaveCount(0);
    await expect(teamLeaderNext(leader)).toBeInViewport({ratio: .95});
    const spyModel = page.waitForRequest(request => new URL(request.url()).pathname === modelPath('female-d'));
    await tap(teamLeaderNext(leader));
    await spyModel;

    await walkTo(2);
    await openFromHost();
    await expect(desk).toHaveAccessibleName('경쟁사 스파이');
    const spyHeight = await expectDeskVisible();
    releaseModels.get('female-d')();
    await capture('spy-open');
    if (mobile) await page.setViewportSize({width: viewport.width, height: 380});
    const resizedSpyHeight = await expectDeskVisible();
    if (!mobile) {
      await expect(desk.locator('header').getByText('경쟁사 스파이', {exact: true})).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(button(desk, spyActions[0])).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(button(desk, '복도로 돌아가기')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(desk).not.toBeVisible();
      await expect(frame.locator('#floor')).toBeFocused();
      await openFromHost();
      await expectDeskVisible();
    }
    const transcript = desk.getByRole('region', {name: '경쟁사 스파이와 나눈 대화'});
    for (const [index, label] of spyActions.entries()) {
      await tap(button(desk, label));
      await expect(desk.getByRole('status').filter({hasText: '답변을 작성 중이에요.'})).toHaveCount(0);
      if (index === 0) {
        await expect(transcript.locator('[data-spy-reply]')).toHaveCount(3);
        await expect.poll(() => transcript.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThan(16);
        await capture('spy-reply');
        await closeDesk();
        await tap(frameOpen);
        await expectDeskVisible();
        await expect(transcript.locator('[data-spy-reply]')).toHaveCount(3);
        if (mobile) await page.setViewportSize(viewport);
        await expectDeskVisible();
      }
    }
    expect(requestedPaths.has(modelPath('male-b'))).toBe(false);
    const contentModel = page.waitForRequest(request => new URL(request.url()).pathname === modelPath('male-b'));
    await tap(button(desk, '이 질문을 광고에 반영하기'));
    await contentModel;
    await expect(desk).not.toBeVisible();

    await walkTo(3);
    await tap(frameOpen);
    await expect(desk).toHaveAccessibleName('콘텐츠 담당자');
    const contentHeight = await expectDeskVisible();
    releaseModels.get('male-b')();
    await capture('content-open');
    if (mobile) await page.setViewportSize({width: viewport.width, height: 380});
    const resizedContentHeight = await expectDeskVisible();
    await expect(button(desk, '정본에서 두 직원의 답 바꿔보기')).toBeInViewport({ratio: .95});
    const product = desk.getByLabel(/^상품·서비스/);
    await expect(product).toBeHidden();
    await tap(desk.getByText('내 상품으로도 해보기', {exact: true}));
    const draft = '웰컴존 테스트용 노트북 거치대';
    await tap(product);
    await page.keyboard.insertText(draft);
    await expect(product).toHaveValue(draft);
    const scrollsInside = await product.evaluate(node => {
      for (let parent = node.parentElement; parent && parent !== node.closest('[role=dialog]'); parent = parent.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowY)) {
          return parent.clientHeight > 0 && parent.scrollHeight > parent.clientHeight;
        }
      }
      return false;
    });
    expect(scrollsInside).toBe(true);
    await expectDeskVisible();
    await capture('content-input');
    if (mobile) await page.setViewportSize(viewport);
    await expectDeskVisible();
    await closeDesk();
    await openFromHost();
    await expectDeskVisible();
    await expect(product).toHaveValue(draft);
    await tap(button(desk, '정본에서 두 직원의 답 바꿔보기'));
    await expect(desk).not.toBeVisible();
    await walkTo(4);
    expect([...requestedPaths].some(path => path.includes('/vendor/assets/agents/'))).toBe(false);
    console.log(JSON.stringify({name, viewport, spyHeight, resizedSpyHeight, contentHeight, resizedContentHeight, reachedStation: 4}));
  } catch (error) {
    await capture('failure').catch(() => {});
    throw error;
  } finally {
    for (const release of releaseModels.values()) release();
    await browser.close();
  }
}
