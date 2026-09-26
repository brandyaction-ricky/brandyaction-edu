import { expect, test } from '@playwright/test';

const course = (index: number) => ({ id: `course-${index}`, slug: `course-${index}`, title: `실행 클래스 ${index}`, summary: '수업 안내', category: 'paid_class', list_price: 10000, metadata: {} });

test('class cards load in 12-row pages and searching requests only the current view', async ({ page }) => {
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
  await expect(page.locator('.course-card')).toHaveCount(12);
  await page.getByRole('button', { name: '다음' }).click();
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
