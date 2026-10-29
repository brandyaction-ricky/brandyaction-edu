import { expect, test } from '@playwright/test';

const courses = [
  { id: 'closed', slug: 'closed', title: '마감된 유료 과정', category: 'paid_class', list_price: 1650000 },
  { id: 'open', slug: 'open', title: '실행 무료 클래스 (오가닉)', category: 'free', list_price: 0, summary: '업무에 바로 적용하는 클래스', duration_label: '온라인' },
];
const cohorts = [
  { id: 'ended', course_id: 'closed', status: 'recruiting', recruitment_end_at: '2026-10-23T14:59:00Z' },
  { id: 'live', course_id: 'open', status: 'recruiting', recruitment_end_at: '2026-11-05T11:00:00Z', operation_start_at: '2026-11-05T12:00:00Z' },
];
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-29T06:00:00Z') });
  await page.route('**/api/platform?**', route => {
    const url = new URL(route.request().url());
    const filter = url.searchParams.get('filter');
    const query = url.searchParams.get('q');
    const rows = courses.filter(c => (!filter || (filter === '무료 클래스' ? c.list_price === 0 : c.list_price > 0)) && (!query || c.title.includes(query)));
    return route.fulfill({ json: { user: { id: 'synthetic-member', full_name: '검수 회원', role: 'member', email: 'qa@example.test' },
      data: { courses: rows, cohorts, catalog_counts: [{ id: 'catalog', free: 1, paid: 1, digital: 0 }], article_banner: [{ id: 'banner', value: { enabled: false, articlesEnabled: true } }] },
      pagination: { page: 1, pageSize: 12, total: rows.length }, support: {} } });
  });
});

test('home separates expired cards, displays stored schedule and preserves product links', async ({ page }) => {
  await page.goto('/public-data-test?publicScreen=home');
  const open = page.locator('.course-card', { hasText: '실행 무료 클래스' });
  await expect(open).toContainText('모집 중 · D-7');
  await expect(open).toContainText('모집 마감 ·');
  await expect(open).toContainText('20:00');
  await expect(open).not.toContainText('21:00');
  await expect(open).not.toContainText('오가닉');
  await expect(open).toHaveAttribute('href', '/classes/open');
  await expect(page.getByRole('heading', { name: '모집이 끝난 클래스' })).toBeVisible();
  const closed = page.locator('.course-card', { hasText: '마감된 유료 과정' });
  await expect(closed).toContainText('모집 마감');
  await expect(closed).toContainText('다음 모집 준비 중');
  await expect(closed).toHaveAttribute('href', '/classes/closed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('types persist in URL, survive back and reload; empty type falls back without removing tracking', async ({ page }) => {
  await page.goto('/public-data-test?publicScreen=classes&navigationFixture=1&utm_source=qa');
  await expect(page.locator('.course-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '디지털 상품', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '무료 클래스', exact: true }).click();
  await expect(page).toHaveURL(/type=free/);
  await expect(page.locator('.course-card')).toHaveCount(1);
  await page.getByRole('button', { name: '유료 클래스', exact: true }).click();
  await expect(page).toHaveURL(/type=paid/);
  await page.goBack();
  await expect(page.getByRole('button', { name: '무료 클래스', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: '무료 클래스', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('searchbox', { name: '클래스 검색' }).fill('없음');
  await expect(page.getByText('검색 조건에 맞는 클래스가 없습니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '유료 클래스', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '검색·필터 초기화' }).click();
  await expect(page.locator('.course-card')).toHaveCount(2);
  await page.goto('/public-data-test?publicScreen=classes&navigationFixture=1&type=digital&utm_source=qa');
  await expect(page).not.toHaveURL(/type=digital/);
  await expect(page).toHaveURL(/utm_source=qa/);
  await expect(page.locator('.course-card')).toHaveCount(2);
});

test('mobile header keeps two actions and all existing destinations in the disclosure', async ({ page, viewport }) => {
  test.skip((viewport?.width || 0) > 900, 'mobile navigation only');
  await page.goto('/public-data-test?publicScreen=home');
  const header = page.locator('.site-header');
  await expect(header.getByRole('link', { name: '내 학습', exact: true })).toBeVisible();
  await expect(header.getByRole('button', { name: '내 프로필 메뉴', exact: true })).toBeHidden();
  await expect(header.getByRole('link', { name: '질문·답변', exact: true })).toBeHidden();
  const menu = header.getByRole('button', { name: '메뉴 열기', exact: true });
  await menu.click();
  const nav = page.getByRole('navigation', { name: '모바일 메뉴' });
  await expect(nav.getByRole('link', { name: '질문·답변', exact: true })).toHaveAttribute('href', '/my/questions');
  await expect(nav.getByRole('button', { name: '새로고침', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: '내 정보 수정' })).toHaveAttribute('href', '/my/profile');
  await page.keyboard.press('Escape');
  await expect(nav).toHaveCount(0);
  await expect(menu).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('an open page transitions to closed at the deadline without reload', async ({ page }) => {
  await page.clock.pauseAt(new Date('2026-11-05T10:59:59Z'));
  await page.goto('/public-data-test?publicScreen=home');
  const card = page.locator('.course-card', { hasText: '실행 무료 클래스' });
  await page.clock.runFor(1);
  await expect(card).toContainText('모집 중 · 오늘 마감');
  await page.clock.runFor(1001);
  await expect(card).toContainText('모집 마감');
});
