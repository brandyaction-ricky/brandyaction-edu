import { expect, test, type Page } from '@playwright/test';
const member = '11111111-1111-4111-8111-111111111111';
async function backend(page: Page, fail = false) {
  const queries: URLSearchParams[] = [];
  await page.route('**/api/admin/member-overview**', route => route.fulfill({ json: { rows: [], total: 0, page: 1, pageSize: 20 } }));
  await page.route('**/api/admin/learning-progress**', async route => {
    const query = new URL(route.request().url()).searchParams; queries.push(query);
    if (fail) { await route.fulfill({ status: 503, json: { error: '합성 진도 조회 오류' } }); return; }
    const pageNumber = Number(query.get('page')), search = query.get('search');
    await route.fulfill({ json: { page: pageNumber, pageSize: 20, total: search === '없음' ? 0 : search ? 1 : 21, rows: search === '없음' ? [] : [{
      enrollmentId: 'enrollment-' + pageNumber, memberId: member, memberName: pageNumber === 2 ? '둘째 페이지 회원' : '합성 회원', memberEmail: 'qa@example.test', courseTitle: '문샷 테스트', cohortName: '가상 기수', status: 'ready', accessActive: !query.get('member'),
      tracks: [{ track: 'daily', total: 30, completed: 5, currentDay: 6, nextDay: null, waiting: !query.get('member'), finished: false }, { track: 'learning', total: 30, completed: 30, currentDay: 30, nextDay: null, waiting: false, finished: true }],
    }] } });
  });
  return { queries, recover: () => { fail = false; } };
}
test('operator progress shows separate tracks, server pagination/search and a scoped submission link', async ({ page }, info) => {
  const { queries } = await backend(page); await page.goto('/admin-learning-progress-test');
  const panel = page.getByRole('region', { name: '과정별 학습 진도', exact: true });
  await expect(panel).toContainText('5 / 30개 완료 · 17%'); await expect(panel).toContainText('현재 DAY 6 · 공개 대기'); await expect(panel).toContainText('전체 완료');
  await expect(panel.getByRole('link', { name: '회원의 학습 제출물 보기' })).toHaveAttribute('href', `/admin/reviews?tab=blocks&member=${member}`);
  await panel.getByRole('button', { name: '다음', exact: true }).click(); await expect(panel).toContainText('둘째 페이지 회원'); expect(queries.at(-1)?.get('page')).toBe('2');
  await page.getByRole('textbox', { name: '진도 회원 검색' }).fill('이름 검색'); await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(panel).toContainText('합성 회원'); expect(queries.at(-1)?.get('page')).toBe('1'); expect(queries.at(-1)?.get('search')).toBe('이름 검색');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width); await page.screenshot({ path: info.outputPath('admin-track-progress.png'), fullPage: true });
});
test('member details include restricted progress and expired access while errors have an explicit retry', async ({ page }) => {
  const { queries, recover } = await backend(page, true); await page.goto('/admin-learning-progress-test?member');
  await expect(page.getByRole('alert')).toContainText('합성 진도 조회 오류'); await expect(page.getByText('0 / 30개 완료')).toHaveCount(0);
  recover(); await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.getByText('현재 수강할 수 없는 수강권의 기록입니다.')).toBeVisible(); expect(queries.at(-1)?.get('member')).toBe(member);
  await expect(page.getByRole('textbox', { name: '진도 회원 검색' })).toHaveCount(0);
  await page.getByRole('tab', { name: '프로필', exact: true }).click(); await expect(page.getByText('합성 프로필')).toBeVisible();
});
test('submission filters search the server and reset pagination while preserving the selected member', async ({ page }, info) => {
  const queries: URLSearchParams[] = [];
  await page.route('**/api/admin/lesson-block-reviews**', async route => {
    const q = new URL(route.request().url()).searchParams; queries.push(q);
    await route.fulfill({ json: { rows: [{ id: 'submission', memberName: '합성 회원', memberEmail: 'qa.long-email@example.test', courseTitle: '가상 과정', lessonTitle: '실행 기록', track: 'daily', dayNumber: 3, submission: { id: 'submission', state: 'submitted' } }], total: 25, page: Number(q.get('page')), pageSize: 20 } });
  });
  await page.goto('/lesson-block-review-test?member=' + member);
  await expect(page.getByRole('button', { name: /합성 회원.*DAY 3/ })).toBeVisible();
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click(); await expect(page.getByText('25건 · 2페이지', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '회원 검색', exact: true }).fill('qa@example.test'); await page.getByRole('button', { name: '검색', exact: true }).click(); await expect(page.getByText('25건 · 1페이지', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '학습 종류', exact: true }).selectOption('daily');
  await page.getByRole('combobox', { name: '일차', exact: true }).selectOption('3');
  await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('day_desc');
  await expect.poll(() => queries.at(-1)?.get('sort')).toBe('day_desc');
  const last = queries.at(-1)!; expect(last.get('member')).toBe(member); expect(last.get('search')).toBe('qa@example.test'); expect(last.get('day')).toBe('3'); expect(last.get('track')).toBe('daily'); expect(last.get('page')).toBe('1');
  await page.getByRole('button', { name: '회원 제한 해제' }).click(); await expect.poll(() => queries.at(-1)?.get('member')).toBe('');
  await expect(page.getByRole('button', { name: /합성 회원.*qa.long-email@example.test.*DAY 3/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width); await page.screenshot({ path: info.outputPath('submission-search.png'), fullPage: true });
});
