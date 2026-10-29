import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/platform/encouragement**', route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('mine') ? { publicName: '', message: '', revision: null } : { rows: [], nextCursor: null } }));
  await page.route('**/api/platform/question-thread**', route => route.fulfill({ json: { question: { id: '22222222-2222-4222-8222-222222222222', status: 'answered', headId: null, resolved: false, archived: false }, answers: [], nextCursor: null, canAnswer: false, canFollowUp: true } }));
});

for (const view of ['dashboard', 'classes']) test(`single learning card fills its parent on ${view} without changing the learning link`, async ({ page }, info) => {
  await page.goto(`/learning-overview-test?scenario=single&view=${view}`);
  const overview = page.locator('.enrollment-learning-overview').first(), track = overview.locator(':scope > .elo-track');
  await expect(track).toHaveCount(1);
  const parent = (await overview.boundingBox())!, child = (await track.boundingBox())!;
  expect(Math.abs(parent.width - child.width)).toBeLessThan(2);
  await expect(track.getByRole('link')).toHaveAttribute('href', '/learn/sample-enrollment/intro');
  await expect(page.getByRole('heading', { name: '다가오는 일정' })).toHaveCount(0);
  if (view === 'classes') {
    const cta = page.locator('.member-resource-cta');
    await expect(cta.getByRole('link')).toHaveClass(/primary/);
    await expect(cta.getByRole('link')).toHaveAttribute('href', '/my/resources');
    await expect(cta).toHaveCSS('margin-top', '24px');
  } else await expect(page.getByRole('navigation', { name: '마이페이지', exact: true }).getByRole('link', { name: /신청·주문 내역/ })).toHaveAttribute('href', '/my/orders');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${view}-full-width.png`), fullPage: true });
  await page.goto(`/learning-overview-test?view=${view}`);
  const mixed = page.locator('.enrollment-learning-overview').first();
  const normal = mixed.getByRole('region', { name: '일반 학습', exact: true });
  expect(Math.abs((await mixed.boundingBox())!.width - (await normal.boundingBox())!.width)).toBeLessThan(2);
});

test('profile actions remain inside the same basic-information form; encouragement and question actions share spacing', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url()); });
  await page.goto('/learning-overview-test?view=profile&comments');
  const panel = page.locator('form > section.panel').first();
  await expect(panel.getByRole('button', { name: '변경 내용 저장', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '로그아웃', exact: true })).toHaveAttribute('type', 'button');
  await expect(panel.locator('input[name=name]')).toHaveValue('학습 QA 회원');
  await expect(panel.locator('input[name=contact_email]')).toHaveCount(1);
  const editor = page.getByRole('region', { name: '내 응원 메시지' });
  const size = await editor.getByRole('heading').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(size).toBeLessThanOrEqual(20);
  await expect(editor.getByRole('button', { name: '응원 메시지 저장', exact: true })).toBeDisabled();
  const actions = page.locator('.member-question-actions');
  await expect(actions).toHaveCSS('gap', '12px');
  const buttons = actions.getByRole('button'), a = (await buttons.nth(0).boundingBox())!, b = (await buttons.nth(1).boundingBox())!;
  if (Math.abs(a.y - b.y) < 2) expect(b.x - a.x - a.width).toBeGreaterThanOrEqual(11);
  else expect(b.y - a.y - a.height).toBeGreaterThanOrEqual(11);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('member-profile-comments.png'), fullPage: true });
});

test('review invitation opens the existing rating/content form without submitting anything', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url()); });
  await page.goto('/learning-overview-test?view=reviews');
  const card = page.locator('.member-review-invite');
  await expect(card).toContainText('짧은 경험도 다음 수강생의 선택에 도움이 됩니다.');
  await card.getByRole('button', { name: '내 경험 남기기' }).click();
  await expect(page.getByLabel('만족도')).toHaveValue('5');
  await expect(page.getByLabel('실행 경험')).toHaveValue('');
  await expect(page.getByRole('button', { name: '후기 등록', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('review-invitation.png'), fullPage: true });
});

for (const state of ['needs_review', 'ready', 'queued', 'processing', 'access_denied']) test(`N6 ${state} uses shared result styling without writes`, async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', request => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url()); });
  await page.route('**/api/platform/diagnosis/session', route => route.fulfill({ json: { state: 'submitted', revision: 8, answers: [], submittedAt: '2026-10-01T00:00:00Z', needsReview: false, survey: { code: 'needs6_n30', version: 'synthetic', title: '합성 N6 검사', coreQuestionCount: 0, questions: [] } } }));
  await page.route('**/api/platform/diagnosis/report', route => route.fulfill({ json: { state, updatedAt: '2026-10-01T00:00:00.000Z', canRetry: false, downloadAvailable: state === 'ready' } }));
  await page.route('**/api/member/push', route => route.fulfill({ json: { enabled: false } }));
  await page.goto('/diagnosis-test?reports&push');
  const result = page.getByRole('region', { name: 'N6 검사 결과', exact: true });
  await expect(result.locator('h1')).toBeVisible();
  const summary = result.locator('.diagnosis-report-summary');
  await expect(summary).toHaveCSS('border-radius', '8px');
  await expect(summary).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(summary.locator('h1')).toHaveCSS('border-top-width', '0px');
  if (['needs_review', 'queued', 'processing'].includes(state)) {
    const notification = result.getByRole('region', { name: '이 기기의 앱 알림', exact: true });
    const a = (await summary.boundingBox())!, b = (await notification.boundingBox())!;
    expect(Math.abs(a.x - b.x)).toBeLessThan(2); expect(Math.abs(a.width - b.width)).toBeLessThan(2);
    for (const button of await notification.getByRole('button').all()) {
      const height = (await button.boundingBox())!.height;
      expect(height).toBeGreaterThanOrEqual(44); expect(height).toBeLessThanOrEqual(64);
    }
  }
  if (state === 'ready') {
    await expect(result.getByRole('button', { name: '보고서 열기', exact: true })).toBeVisible();
    await expect(result.getByRole('button', { name: 'MD 파일 받기', exact: true })).toBeVisible();
  }
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`n6-common-${state}.png`), fullPage: true });
});
