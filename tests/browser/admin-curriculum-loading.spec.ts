import { expect, test } from '@playwright/test';

test('curriculum navigation prefetch stays small while a new lesson still receives its week choices', async ({ page }) => {
  const user = { id: 'loading-fixture-admin', full_name: '합성 관리자', role: 'admin', permissions: { products: true } };
  const course = { id: 'fixture-course', title: '합성 로딩 점검 과정', status: 'draft' };
  const reads: string[] = [];
  await page.route('**/api/platform?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('section') === 'learning') reads.push(params.get('part') || 'full');
    await route.fulfill({ json: { user, data: {
      courses: [course],
      ...(params.get('section') === 'learning' && params.get('part') !== 'picker' ? {
        curriculum_weeks: [{ id: 'fixture-week', course_id: course.id, week_number: 1, title: '보존할 주차' }],
        curriculum_lessons: [], lesson_contents: [], curriculum_missions: [], mission_quizzes: [],
      } : {}),
    }, pagination: null } });
  });
  await page.goto('/admin?navigationFixture=1&careNavigationFixture=1');
  await expect(page.getByRole('heading', { name: '오늘의 운영' })).toBeVisible();
  const menu = page.getByRole('button', { name: '관리자 메뉴 열기', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('link', { name: '커리큘럼 편집', exact: true }).click();
  await expect(page.getByRole('button', { name: course.title + ' 커리큘럼 열기' })).toBeVisible();
  expect(reads).toEqual(['picker']);

  await page.goto('/admin/learning-editor?navigationFixture=1');
  const weeks = page.getByRole('combobox', { name: '주차 (Week) *', exact: true });
  await expect(weeks).toBeVisible();
  await expect(weeks.locator('option')).toHaveText(['주차 선택', course.title + ' · 1주차 · 보존할 주차']);
  expect(reads).toEqual(['picker', 'full']);
});
