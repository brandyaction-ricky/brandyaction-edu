import { expect, test } from '@playwright/test';

const course = (index: number) => ({ id: `course-${index}`, slug: `course-${index}`, title: `실행 클래스 ${index}`, summary: '수업 안내', category: 'paid_class', list_price: 10000, metadata: {} });

test('class cards load in 12-row pages and searching requests only the current view', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const reads: URL[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/platform?**', route => {
    const url = new URL(route.request().url());
    reads.push(url);
    const pageNumber = Number(url.searchParams.get('page'));
    const q = url.searchParams.get('q');
    const courses = q ? [course(7)] : pageNumber === 1 ? Array.from({ length: 12 }, (_, index) => course(index + 1)) : [course(13)];
    return route.fulfill({ json: { user: null, data: { courses, cohorts: [] }, pagination: { page: pageNumber, pageSize: 12, total: q ? 1 : 13 }, support: {} } });
  });
  await page.goto('/public-data-test?publicScreen=classes');
  await page.clock.runFor(1);
  await expect(page.locator('.course-card')).toHaveCount(12);
  await page.getByRole('button', { name: '다음' }).click();
  await page.clock.runFor(1);
  await expect(page.locator('.course-card')).toHaveCount(1);
  // Initial empty search must not reset a quickly selected second page.
  await page.clock.runFor(400);
  await page.clock.resume();
  await expect(page.locator('.course-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: '클래스 검색' }).fill('7');
  await expect(page.locator('.course-card')).toHaveCount(1);
  await expect(page.locator('.course-card')).toContainText('실행 클래스 7');
  expect(reads.every(url => url.searchParams.get('view') === 'classes')).toBe(true);
  expect(reads.some(url => url.searchParams.get('page') === '2')).toBe(true);
  expect(reads.some(url => url.searchParams.get('q') === '7')).toBe(true);
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('failed public read shows a retryable error, not a false empty state', async ({ page }) => {
  await page.route('**/api/platform?**', route => route.fulfill({ status: 503, json: { error: '합성 조회 오류' } }));
  await page.goto('/public-data-test?publicScreen=classes');
  await expect(page.getByRole('alert')).toContainText('합성 조회 오류');
  await expect(page.getByText('등록된 클래스가 없습니다.')).toHaveCount(0);
});

test('empty catalog is distinct from an empty search result', async ({ page }) => {
  await page.route('**/api/platform?**', route => route.fulfill({ json: {
    user: null, data: { courses: [], cohorts: [] }, pagination: { page: 1, pageSize: 12, total: 0 }, support: {},
  } }));
  await page.goto('/public-data-test?publicScreen=classes');
  await expect(page.getByText('등록된 클래스가 없습니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '검색·필터 초기화' })).toHaveCount(0);
});

test('empty class filter and search explain the condition and reset in one action', async ({ page }) => {
  const reads: URL[] = [];
  await page.route('**/api/platform?**', route => {
    const url = new URL(route.request().url());
    reads.push(url);
    const filtered = Boolean(url.searchParams.get('filter') || url.searchParams.get('q'));
    const courses = filtered ? [] : [course(1), course(2)];
    return route.fulfill({ json: { user: null, data: { courses, cohorts: [] }, pagination: { page: 1, pageSize: 12, total: courses.length }, support: {} } });
  });
  await page.goto('/public-data-test?publicScreen=classes');
  await expect(page.locator('.course-card')).toHaveCount(2);
  await page.getByRole('button', { name: '무료 클래스' }).click();
  await expect(page.getByText('검색 조건에 맞는 클래스가 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '검색·필터 초기화' }).click();
  await expect(page.locator('.course-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '전체' })).toHaveClass(/active/);
  await page.getByRole('searchbox', { name: '클래스 검색' }).fill('없는클래스-QA');
  await expect(page.getByText('검색 조건에 맞는 클래스가 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '검색·필터 초기화' }).click();
  await expect(page.locator('.course-card')).toHaveCount(2);
  await expect(page.getByRole('searchbox', { name: '클래스 검색' })).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(reads.some(url => url.searchParams.get('filter') === '무료 클래스')).toBe(true);
  expect(reads.some(url => url.searchParams.get('q') === '없는클래스-QA')).toBe(true);
});

test('reset from a free-class deep link removes its URL filter', async ({ page }) => {
  await page.route('**/api/platform?**', route => {
    const filtered = new URL(route.request().url()).searchParams.get('filter') === '무료 클래스';
    const courses = filtered ? [] : [course(1)];
    return route.fulfill({ json: { user: null, data: { courses, cohorts: [] }, pagination: { page: 1, pageSize: 12, total: courses.length }, support: {} } });
  });
  await page.goto('/classes?type=free');
  await expect(page.getByText('검색 조건에 맞는 클래스가 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '검색·필터 초기화' }).click();
  await expect(page).toHaveURL('/classes');
  await expect(page.locator('.course-card')).toHaveCount(1);
});

test('article category filter and server page remain aligned', async ({ page }) => {
  const category = '11111111-1111-4111-8111-111111111111';
  const reads: URL[] = [];
  await page.route('**/api/platform?**', route => {
    const url = new URL(route.request().url());
    reads.push(url);
    const filtered = url.searchParams.get('filter') === category;
    const articles = filtered ? [{ id: 'a1', slug: 'selected', title: '선택된 아티클', summary: '요약', category_id: category, content_type: 'column' }] : Array.from({ length: 12 }, (_, index) => ({ id: `a${index}`, slug: `article-${index}`, title: `아티클 ${index}`, summary: '요약', category_id: category, content_type: 'column' }));
    return route.fulfill({ json: { user: null, data: { articles, article_categories: [{ id: category, name: '선택 분야', is_active: true }], article_banner: [{ id: 'banner', value: { enabled: false } }] }, pagination: { page: 1, pageSize: 12, total: filtered ? 1 : 13 }, support: {} } });
  });
  await page.goto('/public-data-test?publicScreen=articles');
  await expect(page.locator('.article-card')).toHaveCount(12);
  await page.getByRole('button', { name: '선택 분야' }).click();
  await expect(page.locator('.article-card')).toHaveCount(1);
  expect(reads.some(url => url.searchParams.get('filter') === category)).toBe(true);
});
