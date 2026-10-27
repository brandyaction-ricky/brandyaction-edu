import { test, expect, type Page } from '@playwright/test';
const start = '2026-10-01T00:00:00Z', at = (hours: number) => new Date(Date.parse(start) + hours * 3600000).toISOString();
const lesson = (id: string, day: number, state: string, hours?: number) => ({ lessonId: id, day, week: 1, title: id === 'first' ? '첫 필수 학습' : id === 'current' ? '반복 업무 찾기' : '업무 결과 정리하기', track: 'learning', state, published: state !== 'scheduled', completedAt: state === 'completed' ? at(hours || 0) : null, timing: { state: id === 'first' ? 'first' : 'known', previousLessonId: id === 'first' ? null : 'first', previousCompletedAt: id === 'first' ? null : start }, submittedAt: null, reviewedAt: null, submissionId: null, reason: '' });
const rows = ['completed', 'completed', 'not_submitted', 'locked', 'scheduled', 'submitted', 'changes_requested'].map((state, i) => ({
  enrollmentId: 'example-enrollment-' + i, memberId: 'example-member-' + i, name: '예시 수강생 ' + i, email: 'qa' + i + '@example.test',
  cells: [lesson('first', 1, 'completed'), lesson('current', 2, state, i ? 24 : 12), lesson('slow', 3, i === 0 ? 'completed' : i === 1 ? 'not_submitted' : 'locked', 96), lesson('future', 4, 'scheduled')],
  lastVisitAt: i === 2 ? start : at(95), lastContactAt: i === 6 ? at(95) : null, openQuestions: 0,
}));
for (const [i, row] of rows.entries()) if (i < 2) row.cells[2].timing = { state: 'known', previousLessonId: 'current', previousCompletedAt: at(i ? 24 : 12) };
const snapshot = { cohorts: [{ id: '11111111-1111-4111-8111-111111111111', name: '4기 (합성 검수)', courseTitle: '문샷 테스트' }], cohortId: '11111111-1111-4111-8111-111111111111', rows, asOf: at(96) };
async function backend(page: Page, data = snapshot) {
  const writes: string[] = [];
  await page.route('**/api/admin/member-conversation**', r => r.fulfill({ json: { rows: [], nextCursor: null } }));
  await page.route('**/api/admin/learning-care**', async r => {
    if (r.request().method() !== 'GET') writes.push(r.request().method());
    await r.fulfill({ json: new URL(r.request().url()).pathname.endsWith('/channels') ? { config: { enabled: false }, reach: [] } : data });
  });
  return writes;
}
test('day metrics and both sorts use cohort-wide denominators in overview and day tab', async ({ page }) => {
  await backend(page); await page.goto('/learning-care-test');
  const current = page.getByRole('button', { name: '1주차 2일차 · 반복 업무 찾기 명단 보기', exact: true });
  await expect(current).toContainText('29%'); await expect(current).toContainText('2/7명 완료');
  await expect(current).toContainText('18시간'); await expect(current).toContainText('2명 완료 기록 기준');
  await expect(page.getByRole('button', { name: '1주차 1일차 · 첫 필수 학습 명단 보기' })).toContainText('— (첫 일차)');
  await page.getByRole('combobox', { name: '일차 정렬' }).selectOption('completion');
  await expect(page.locator('.care-day-tiles article').first()).toContainText('업무 결과 정리하기');
  await page.getByRole('combobox', { name: '일차 정렬' }).selectOption('duration');
  await expect(page.locator('.care-day-tiles article').first()).toContainText('84시간');
  await current.click(); await expect(page.getByRole('tab', { name: '일차별', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(current).toContainText('18시간');
  await page.getByRole('combobox', { name: '일차 정렬' }).selectOption('completion');
  await expect(page.locator('.care-day-tiles article').first()).toContainText('14%');
});
test('top attention list shows factual clocks/visits/contact and opens existing detail and encouragement without sending', async ({ page }, info) => {
  const writes = await backend(page); await page.goto('/learning-care-test');
  const toggle = page.getByRole('button', { name: '확인 필요 수강생 3명' });
  await expect(toggle).toBeVisible();
  const before = await page.locator('.care-overview').evaluate(el => el.firstElementChild?.className);
  expect(before).toBe('care-attention-heading');
  await toggle.click(); const table = page.getByRole('table', { name: '확인 필요 수강생 목록' });
  await expect(table.locator('tbody tr')).toHaveCount(3);
  const stalled = table.locator('tr').filter({ hasText: '예시 수강생 2' });
  await expect(stalled).toContainText('반복 업무 찾기'); await expect(stalled).toContainText('72시간 이상 학습 정체');
  await expect(stalled).toContainText('3일 이상 방문 기록 없음'); await expect(stalled).toContainText('96시간');
  await expect(table.getByRole('columnheader', { name: '마지막 안내' })).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('care-insights-attention.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await table.getByRole('button', { name: '예시 수강생 2' }).click();
  const dialog = page.getByRole('dialog', { name: '수강생 상세', exact: true });
  await expect(dialog.getByRole('button', { name: '학습 독려하기', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '학습 독려하기', exact: true }).click();
  await expect(page.getByRole('region', { name: '학습 안내 확인' })).toContainText('예시 수강생 2');
  expect(writes).toEqual([]); await page.getByRole('button', { name: '취소', exact: true }).click();
});
test('old snapshots without predecessor data keep progress and visit attention; no invented duration or stall', async ({ page }) => {
  const legacy = { ...snapshot, rows: snapshot.rows.map(r => ({ ...r, cells: r.cells.map(c => Object.fromEntries(Object.entries(c).filter(([key]) => key !== 'timing'))) })) };
  await backend(page, legacy as typeof snapshot); await page.goto('/learning-care-test');
  const current = page.getByRole('button', { name: '1주차 2일차 · 반복 업무 찾기 명단 보기' });
  await expect(current).toContainText('29%'); await expect(current).toContainText('기록 확인 필요');
  await expect(page.getByRole('button', { name: '확인 필요 수강생 2명' })).toBeVisible();
  await page.getByRole('button', { name: '확인 필요 수강생 2명' }).click();
  const table = page.getByRole('table', { name: '확인 필요 수강생 목록' });
  await expect(table).not.toContainText('72시간 이상 학습 정체'); await expect(table).toContainText('3일 이상 방문 기록 없음');
});

test('long attention labels stay within columns, and lesson buttons retain week context and order', async ({ page }, info) => {
  const longTitle = '아주 긴 학습 제목과상태배지가겹치지않아야합니다'.repeat(8);
  const longRows = snapshot.rows.map((row, index) => index === 2 ? {
    ...row, name: '아주 긴 이름을 가진 가상 수강생 '.repeat(4),
    cells: row.cells.map((cell, cellIndex) => ({ ...cell, title: cellIndex === 1 ? longTitle : cell.title, week: cellIndex === 2 ? 2 : 1 })),
  } : row);
  const writes = await backend(page, { ...snapshot, rows: longRows });
  await page.goto('/learning-care-test');
  const overview = page.getByRole('region', { name: '기수별 수강생 현황판' });
  await expect(overview.getByRole('link', { name: '일차별 현황 바로 보기' })).toHaveAttribute('href', '#care-day-overview');
  await overview.getByRole('link', { name: '일차별 현황 바로 보기' }).click();
  await expect(page).toHaveURL(/#care-day-overview$/);
  await expect(page.getByRole('heading', { name: '일차별로 진행 상황을 확인하세요' })).toBeVisible();
  await overview.getByRole('button', { name: '확인 필요 수강생 3명' }).click();
  const row = page.getByRole('table', { name: '확인 필요 수강생 목록' }).locator('tbody tr').filter({ hasText: longTitle });
  await expect(row).toHaveCount(1);
  for (const width of info.project.name === 'desktop' ? [1440, 1024] : [page.viewportSize()!.width]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await row.evaluate(element => Array.from(element.querySelectorAll('th,td')).map(cell => ({ overflow: cell.scrollWidth > cell.clientWidth + 1, whiteSpace: getComputedStyle(cell).whiteSpace })));
    expect(layout.every(cell => !cell.overflow && cell.whiteSpace !== 'nowrap')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.getByRole('tab', { name: '수강생별', exact: true }).click();
  const studentRow = page.locator('.care-table tbody tr').filter({ hasText: longRows[2].name });
  await expect(studentRow.locator('.care-week-label')).toHaveText(['1주차', '2주차', '1주차']);
  const buttons = studentRow.locator('.care-week-cells button');
  await expect(buttons).toHaveCount(4);
  await expect(buttons.nth(0)).toHaveAttribute('aria-label', /1주차 1일차/);
  await expect(buttons.nth(2)).toHaveAttribute('aria-label', /2주차 3일차/);
  await expect(buttons.nth(3)).toHaveAttribute('aria-label', /1주차 4일차/);
  await buttons.nth(2).click();
  await expect(page.getByRole('dialog', { name: '수강생 상세' })).toBeVisible();
  expect(writes).toEqual([]);
});
