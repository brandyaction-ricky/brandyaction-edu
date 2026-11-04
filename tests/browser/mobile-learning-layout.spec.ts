import { test, expect } from '@playwright/test';
import { withExistingCohortVisibility } from './fixture/cohort-visibility';

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
for (const width of [320, 390, 680, 1440]) {
  test(`lesson diagnosis and menu remain usable at ${width}px without writes`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const writes: string[] = [];
    page.on('request', r => { if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(r.url()); });
    await page.route('**/api/platform?**', route => route.fulfill({ json: {
      user: { id: id(99), full_name: '검수 회원', role: 'student' }, support: {},
      data: withExistingCohortVisibility({ enrollments: [{ id: id(1), course_id: id(2), cohort_id: id(3), status: 'active' }], courses: [{ id: id(2), title: '합성 과정' }], cohorts: [{ id: id(3), course_id: id(2), name: '4기' }], curriculum_weeks: [{ id: id(5), course_id: id(2), week_number: 1, is_published: true }], curriculum_lessons: [{ id: id(4), week_id: id(5), day_number: 1, title: '광고 보고서를 읽고 소재 2차 피봇팅하기', is_published: true }], lesson_contents: [{ lesson_id: id(4), body_text: '학습 본문입니다.' }] })
    } }));
    await page.route('**/api/platform/diagnosis/session?**', route => route.fulfill({ json: { offers: [{ courseId: id(2) }], current: { state: 'submitted' } } }));
    await page.route('**/api/platform/lesson-questions?**', route => route.fulfill({ json: { questions: [], hasMore: false } }));
    await page.goto('/learning-question-test');
    const entry = page.getByRole('region', { name: 'N6 검사', exact: true });
    const copy = entry.locator('div').first(), cta = entry.getByRole('link');
    await expect(cta).toHaveAttribute('href', `/my/diagnosis?course=${id(2)}`);
    const c = (await copy.boundingBox())!, b = (await cta.boundingBox())!;
    expect(c.width).toBeGreaterThan(180);
    if (width <= 680) {
      expect(b.y).toBeGreaterThanOrEqual(c.y + c.height);
      expect(b.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator('.header-user .mobile-page-refresh')).toHaveCount(0);
      await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
      await expect(page.getByRole('navigation', { name: '모바일 메뉴' }).getByRole('button', { name: '새로고침', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '메뉴 닫기', exact: true }).click();
      await page.getByRole('button', { name: '학습 목록', exact: true }).click();
      await expect(page.locator('.lesson-nav.active')).toBeVisible();
      await page.getByRole('button', { name: '학습 목록', exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lesson-${width}.png`), fullPage: true });
  });
}

test('mobile progress disclosure preserves links and desktop visibility across resizing', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/learning-overview-test?scenario=single&view=dashboard');
  const toggle = page.getByRole('button', { name: '주차별 진도·학습 목록', exact: true });
  const body = page.locator('.member-learning-details-content');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(body).toBeHidden();
  await expect(page.locator('.member-journey-head a')).toHaveAttribute('href', '/learn/sample-enrollment/intro');
  await toggle.click();
  await expect(body.getByRole('link', { name: '일반 학습 이어서 학습하기' })).toHaveAttribute('href', '/learn/sample-enrollment/intro');
  await expect(body.locator('[aria-current=step]')).toContainText('현재 학습 주차');
  await expect(page.locator('#member-menu-hint')).toBeVisible();
  await toggle.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(body).toBeVisible();
  await expect(toggle).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(body).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('dashboard-mobile.png'), fullPage: true });
});
