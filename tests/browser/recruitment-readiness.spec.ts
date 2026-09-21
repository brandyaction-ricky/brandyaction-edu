import { test, expect } from '@playwright/test';

const code = '33333333-3333-4333-8333-333333333333';
test('saved-state inspection catches outdated room links and preserves unsaved forms without writes', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/conversion/**', route => {
    if (route.request().method() !== 'GET') writes++;
    const path = new URL(route.request().url()).pathname;
    const reports: Record<string, unknown> = {
      rooms: { draft: { version: 2 } }, links: { link: { enabled: true, room_version: 1 }, counts: { paid: 0, organic: 0 } },
      webinar: { campaign: { id: code, enabled: true, freeCourse: '22222222-2222-4222-8222-222222222222', paidCohort: 'paid', revision: 1 }, registrations: 0, purchases: null },
      broadcast: { sessions: [{ phase: 'first', url: 'https://youtube.com/watch?v=abcdefghijk', enabled: true, offerEnabled: false, revision: 1 }], offerReady: false, counts: [] },
      followup: { drafts: [{ channel: 'room', body: '저장된 합성 초안', purpose: 'encore', revision: 1 }], audienceState: 'unavailable', counts: null },
      marketing: { selected: [], candidates: [], revision: 0 },
      delivery: { state: 'unavailable', period: 'sample', reservations: [], templates: [], delivery: { enabled: false } },
    };
    return route.fulfill({ json: reports[path.split('/').at(-1)!] || {} });
  });
  await page.goto('/webinar-admin-test?workspace=1');
  await page.getByRole('button', { name: '4. 후속 안내', exact: true }).click();
  await page.getByRole('textbox', { name: '카톡방 공지 초안', exact: true }).fill('저장하지 않은 내 초안');
  await page.getByRole('button', { name: '저장된 준비 상태 확인', exact: true }).click();
  const summary = page.getByRole('region', { name: '모집 준비 점검' });
  await expect(summary.getByText(/링크가 이전 방 설정/)).toBeVisible();
  await expect(summary.getByText('초안 저장됨 · 검수 필요', { exact: true })).toHaveCount(1);
  await expect(summary.getByText('초안 준비 필요', { exact: true })).toHaveCount(1);
  await expect(summary.getByText(/방송 이동 활성 · 유료 교육 안내 준비 필요/)).toBeVisible();
  await summary.getByRole('button', { name: '첫 웨비나 링크 설정으로 이동' }).click();
  await expect(page.getByLabel('첫 웨비나 YouTube 주소', { exact: true })).toBeVisible();
  await summary.getByRole('button', { name: '카톡방 공지 문구 설정으로 이동' }).click();
  await expect(page.getByRole('textbox', { name: '카톡방 공지 초안', exact: true })).toHaveValue('저장하지 않은 내 초안');
  await summary.getByRole('button', { name: '준비 상태 다시 점검' }).click();
  await expect(summary.getByText('초안 저장됨 · 검수 필요', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('paused campaign never reports active broadcasts; denied refresh removes previously inspected settings', async ({ page }) => {
  let enabled = true, denied = false;
  await page.route('**/api/conversion/**', route => {
    const path = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (path === 'rooms' && denied) return route.fulfill({ status: 403, json: { error: 'denied' } });
    const reports: Record<string, unknown> = {
      rooms: { draft: { version: 1 } }, links: { link: { enabled: true, room_version: 1 } },
      webinar: { campaign: { id: code, enabled, paidCohort: 'paid', revision: 1 }, registrations: 0, purchases: null },
      broadcast: { sessions: ['first', 'encore'].map(phase => ({ phase, enabled: true, offerEnabled: true, url: 'https://youtube.com/watch?v=abcdefghijk', revision: 1 })), offerReady: true, counts: [] },
      followup: { drafts: [], audienceState: 'forbidden', counts: null }, marketing: { candidates: [], selected: [], revision: 0 },
    };
    return route.fulfill({ json: reports[path] || {} });
  });
  await page.goto('/webinar-admin-test?workspace=1');
  const summary = page.getByRole('region', { name: '모집 준비 점검' });
  await summary.getByRole('button', { name: '저장된 준비 상태 확인' }).click();
  await expect(summary.getByText('방송·교육 링크 활성', { exact: true })).toHaveCount(2);
  await expect(summary.getByText('권한 확인 필요', { exact: true })).toBeVisible();
  enabled = false;
  await summary.getByRole('button', { name: '준비 상태 다시 점검' }).click();
  await expect(summary.getByText(/방송 이동 준비 필요 · 유료 교육 안내 준비 필요/)).toHaveCount(2);
  await expect(summary.getByText('방송·교육 링크 활성', { exact: true })).toHaveCount(0);
  denied = true;
  await summary.getByRole('button', { name: '준비 상태 다시 점검' }).click();
  await expect(summary.getByRole('alert')).toHaveText('현재 권한으로 준비 상태를 조회할 수 없습니다.');
  await expect(summary.getByRole('listitem')).toHaveCount(0);
});

test('empty setup is incomplete and does not request campaign-dependent data', async ({ page }) => {
  let dependent = 0;
  await page.route('**/api/conversion/**', route => {
    const path = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (['broadcast', 'followup'].includes(path)) dependent++;
    const reports: Record<string, unknown> = { rooms: { draft: null }, links: { link: null }, webinar: { campaign: null } };
    return route.fulfill({ json: reports[path] || {} });
  });
  await page.goto('/webinar-admin-test?workspace=1');
  await page.getByRole('button', { name: '저장된 준비 상태 확인' }).click();
  const summary = page.getByRole('region', { name: '모집 준비 점검' });
  await expect(summary.getByText('확인 필요', { exact: true })).toHaveCount(5);
  await expect(summary.getByText('초안 준비 필요', { exact: true })).toHaveCount(2);
  expect(dependent).toBe(0);
});
