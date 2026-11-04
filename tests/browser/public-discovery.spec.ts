import { expect, test } from '@playwright/test';

const course = { id: 'free', slug: 'next-free', title: '다음 실행 클래스', category: 'free', list_price: 0 };
const cohort = { id: 'live', course_id: 'free', status: 'recruiting', recruitment_end_at: '2099-11-05T11:00:00Z', operation_start_at: '2099-11-05T12:00:00Z' };
const story = { id: 'story', title: '일하는 방법을 바꾼 경험', description: '합성 개인 사례', reviewer_name: '검수 회원', reviewer_role: '디자인 대표', video_url: '', thumbnail_url: '' };

test('zero articles hide home section and navigation; existing public articles restore both', async ({ page, viewport }) => {
  let count = 0;
  await page.route('**/api/platform?**', route => route.fulfill({ json: { user: null, data: {
    article_banner: [{ id: 'settings', value: { enabled: true, articlesEnabled: true, articleCount: count } }],
    articles: count ? [{ id: 'article', slug: 'article', title: '내 일을 바꾸는 글' }] : [], courses: [course], cohorts: [cohort],
  }, support: {} } }));
  await page.goto('/public-data-test?publicScreen=home');
  await expect(page.locator('.course-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '일하는 방식을 바꾸는 인사이트' })).toHaveCount(0);
  if ((viewport?.width || 0) <= 900) await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await expect(page.locator('header a[href="/articles"]')).toHaveCount(0);
  await expect(page.locator('.recruiting-section .eyebrow')).toHaveText('NEXT PROGRAM');
  count = 1;
  await page.reload();
  await expect(page.getByRole('heading', { name: '일하는 방식을 바꾸는 인사이트' })).toBeVisible();
  await expect(page.locator('.main-nav a[href="/articles"]')).toHaveCount(1);
});

test('stories and home disclose individual results and offer a real free-class next step', async ({ page }) => {
  await page.route('**/api/platform?**', route => route.fulfill({ json: { user: null, data: {
    review_videos: [story], courses: [course], cohorts: [cohort], article_banner: [{ id: 'settings', value: { articleCount: 0 } }],
  }, support: {} } }));
  for (const screen of ['home', 'stories']) {
    await page.goto('/public-data-test?publicScreen=' + screen);
    await expect(page.getByText('개인 사례이며 결과는 사람마다 다릅니다.').first()).toBeVisible();
    const next = page.getByRole('region', { name: '다음 학습 안내' });
    await expect(next).toContainText('모집 마감 ·');
    await expect(next).toContainText('20:00');
    await expect(next.getByRole('link')).toHaveAttribute('href', '/classes/next-free');
    await expect(page.locator('.site-footer').getByRole('link', { name: '카카오톡으로 문의 (로그인 없이)' })).toHaveAttribute('href', 'http://pf.kakao.com/_ydxjhxj/chat');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test('closed and missing live schedules never claim a fabricated next live', async ({ page }) => {
  await page.route('**/api/platform?**', route => route.fulfill({ json: { user: null, data: {
    review_videos: [story], courses: [course], cohorts: [{ ...cohort, recruitment_end_at: '2020-01-01T00:00:00Z' }],
  }, support: {} } }));
  await page.goto('/public-data-test?publicScreen=stories');
  const next = page.getByRole('region', { name: '다음 학습 안내' });
  await expect(next).not.toContainText('모집 중');
  await expect(next).not.toContainText('21:00');
  await expect(next.getByRole('link')).toHaveAttribute('href', '/classes?type=free');
});

test('guest paid detail uses the same existing support channel without login or mutations', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', req => { if (req.method() !== 'GET') writes.push(req.url()); });
  await page.route('**/api/platform?**', route => route.fulfill({ json: { user: null, data: {
    courses: [{ ...course, id: 'paid', slug: 'paid', status: 'published', category: 'paid_class', list_price: 10000, description: '설명', duration_label: '4주', schedule_label: '운영 일정' }],
    cohorts: [{ ...cohort, course_id: 'paid', price: 10000 }],
  }, support: {} } }));
  await page.goto('/public-data-test?publicScreen=classes/paid');
  const link = page.getByRole('link', { name: '신청 전 카카오톡 문의' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'http://pf.kakao.com/_ydxjhxj/chat');
  await expect(link).toHaveAttribute('target', '_blank');
  expect(writes).toEqual([]);
});
