import { test, expect, type Page } from '@playwright/test';
const code = '33333333-3333-4333-8333-333333333333';
async function setup(page: Page, options: { paused?: boolean; oldRoom?: boolean; denyClipboard?: boolean } = {}) {
  const activity = { writes: 0, visits: 0 };
  await page.addInitScript(({ denied }) => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => {
      if (denied) throw new Error('denied');
      document.documentElement.dataset.copiedLink = text;
    } } });
  }, { denied: Boolean(options.denyClipboard) });
  await page.route('**/api/conversion/**', route => {
    if (route.request().method() !== 'GET') activity.writes++;
    const path = new URL(route.request().url()).pathname.split('/').at(-1)!;
    const reports: Record<string, unknown> = {
      links: { link: { id: code, enabled: !options.paused, room_version: options.oldRoom ? 1 : 2 }, counts: { paid: 0, organic: 0 } },
      webinar: { campaign: { id: code, enabled: !options.paused, freeCourse: '22222222-2222-4222-8222-222222222222', paidCohort: null, revision: 1 }, registrations: 0, purchases: null },
      broadcast: { sessions: ['first', 'encore'].map(phase => ({ phase, enabled: phase === 'first', offerEnabled: phase === 'first', url: 'https://youtube.com/watch?v=abcdefghijk', revision: 1 })), offerReady: true, counts: [] },
      followup: { drafts: [], audienceState: 'forbidden', counts: null },
    };
    return route.fulfill({ json: reports[path] || {} });
  });
  await page.route(/\/(go|join|webinar)\//, route => { activity.visits++; return route.abort(); });
  await page.goto('/copy-links-test');
  return activity;
}

test('copies exact channel links without tracking visits or writes; unsaved edits block copying', async ({ page }) => {
  const activity = await setup(page);
  for (const [label, path] of [
    ['광고용 모집 링크', `/join/${code}/paid`], ['오가닉용 모집 링크', `/join/${code}/organic`],
    ['광고 방 신청 링크', `/webinar/${code}/paid`], ['출처 미지정 신청 링크', `/webinar/${code}/unknown`],
    ['첫 웨비나 오가닉방 방송 링크', `/go/${code}/first/organic/live`], ['첫 웨비나 공통 교육 안내 링크', `/go/${code}/first/unknown/offer`],
  ]) {
    await page.getByRole('button', { name: `${label} 복사`, exact: true }).click();
    await expect(page.getByText(`${label}를 복사했습니다. 게시·발송은 직접 진행해 주세요.`, { exact: true })).toBeVisible();
    expect(await page.locator('html').getAttribute('data-copied-link')).toBe('http://127.0.0.1:4173' + path);
  }
  await expect(page.getByRole('button', { name: '앵콜 라이브 광고방 방송 링크 복사', exact: true })).toBeDisabled();
  await page.getByLabel('첫 웨비나 YouTube 주소', { exact: true }).fill('https://youtube.com/watch?v=zyxwvutsrqp');
  await expect(page.getByRole('button', { name: '첫 웨비나 광고방 방송 링크 복사', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '무료 신청 링크 활성화', exact: true }).uncheck();
  await expect(page.getByRole('button', { name: '광고 방 신청 링크 복사', exact: true })).toBeDisabled();
  expect(activity).toEqual({ writes: 0, visits: 0 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('paused recruitment disables otherwise active links; outdated room version blocks copy', async ({ page }) => {
  await setup(page, { paused: true });
  for (const name of ['광고용 모집 링크', '광고 방 신청 링크', '첫 웨비나 광고방 방송 링크', '첫 웨비나 광고방 교육 안내 링크']) {
    await expect(page.getByRole('button', { name: `${name} 복사`, exact: true })).toBeDisabled();
  }
  await page.unrouteAll({ behavior: 'wait' });
  await setup(page, { oldRoom: true });
  await expect(page.getByRole('button', { name: '광고용 모집 링크 복사', exact: true })).toBeDisabled();
  await expect(page.getByText('이전 방 설정을 사용하는 링크입니다. 최신 방으로 활성화한 뒤 복사하세요.', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '광고 방 신청 링크 복사', exact: true })).toBeEnabled();
});

test('clipboard rejection explains manual copy and selects the address without claiming success', async ({ page }) => {
  const activity = await setup(page, { denyClipboard: true });
  await page.getByRole('button', { name: '광고용 모집 링크 복사', exact: true }).click();
  await expect(page.getByText('자동 복사를 사용할 수 없습니다. 주소를 길게 누르거나 선택한 뒤 직접 복사해 주세요.', { exact: true })).toBeVisible();
  const address = page.getByRole('textbox', { name: '광고용 모집 링크', exact: true });
  await expect(address).toBeFocused();
  expect(await address.evaluate((element: HTMLInputElement) => element.selectionStart === 0 && element.selectionEnd === element.value.length)).toBe(true);
  await expect(page.getByText(/를 복사했습니다\./)).toHaveCount(0);
  expect(activity).toEqual({ writes: 0, visits: 0 });
});
