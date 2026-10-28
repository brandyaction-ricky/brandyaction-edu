import { test, expect } from '@playwright/test';

test('operations work stays ahead of every menu shortcut', async ({ page }, info) => {
  await page.goto('/admin-ux-audit-test?overview');
  const tasks = page.getByRole('heading', { name: '지금 처리할 일' });
  const menus = page.getByRole('region', { name: '운영 메뉴 바로가기' });
  await expect(tasks).toBeVisible();
  expect((await tasks.boundingBox())!.y).toBeLessThan((await menus.boundingBox())!.y);
  await expect(menus.getByRole('link')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: '미션 검토 대기 2건' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('operations-priority.png'), fullPage: true });
});

test('order summary discloses its independent scope without removing orders', async ({ page }, info) => {
  await page.goto('/admin-pilot-orders-test');
  const summary = page.getByRole('region', { name: '전체 기간 결제 요약' });
  await expect(summary).toContainText('조건은 아래 주문 목록에만 적용됩니다');
  await expect(summary).toContainText('시험·내부·무료 주문');
  const originalSummary = await summary.innerText();
  await expect(summary).toContainText('24,000');
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await page.getByRole('searchbox', { name: '주문 검색' }).fill('PILOT-FAIL');
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText(originalSummary, { useInnerText: true });
  await page.getByRole('searchbox', { name: '주문 검색' }).fill('');
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('orders-scope.png'), fullPage: true });
});

test('empty cohort uses a compact notice and retains every tab', async ({ page }, info) => {
  const writes: string[] = [];
  await page.route('**/api/admin/learning-care**', route => {
    if (route.request().method() !== 'GET') writes.push(route.request().method());
    return route.fulfill({ json: { cohorts: [{ id: '11111111-1111-4111-8111-111111111111', name: '빈 검수 기수', courseTitle: '합성 과정' }], cohortId: '11111111-1111-4111-8111-111111111111', rows: [], asOf: '2026-10-28T00:00:00Z' } });
  });
  await page.goto('/learning-care-test');
  const notice = page.getByRole('status').filter({ hasText: '이 기수에 등록된 수강생이 아직 없습니다.' });
  await expect(notice).toBeVisible();
  expect((await notice.boundingBox())!.height).toBeLessThan(150);
  await expect(page.getByRole('tab')).toHaveCount(4);
  await page.getByRole('tab', { name: '수강생별', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '상태 선택' })).toBeVisible();
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('empty-cohort.png'), fullPage: true });
});

test('profile explains manual saving and aligns fields without saving', async ({ page, viewport }, info) => {
  await page.goto('/learning-overview-test?view=profile');
  await expect(page.getByText(/입력 후 ‘변경 내용 저장’을 눌러야 반영됩니다/)).toBeVisible();
  const name = page.locator('input[name=name]'), phone = page.locator('input[name=phone]');
  await expect(name).toHaveValue('학습 QA 회원');
  if (viewport!.width > 680) expect(Math.abs((await name.boundingBox())!.y - (await phone.boundingBox())!.y)).toBeLessThan(2);
  await expect(page.getByRole('button', { name: '변경 내용 저장' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('profile-save-guidance.png'), fullPage: true });
});

test('question empty state opens the existing composer without writing data', async ({ page }, info) => {
  const writes: string[] = [];
  await page.route('**/api/platform/question-hub**', route => {
    if (route.request().method() !== 'GET') writes.push(route.request().method());
    return route.fulfill({ json: { questions: [], hasMore: false, contexts: [], answers: [] } });
  });
  await page.goto('/question-hub-test');
  await expect(page.getByRole('button', { name: '질문 작성하기' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('question-empty-action.png'), fullPage: true });
  await page.getByRole('button', { name: '질문 작성하기' }).click();
  await expect(page.getByRole('tab', { name: '질문하기', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '질문 등록', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
