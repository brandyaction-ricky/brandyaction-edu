import { test, expect } from '@playwright/test';

test('BF-01/02 unavailable product CTAs are disabled for every visitor and layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const state of ['upcoming', 'closed', 'cancelled', 'operation-ended']) {
    const label = state === 'upcoming' ? '모집 예정' : state === 'cancelled' ? '운영 취소' : '신청 마감';
    for (const member of ['guest', 'member', 'expired', 'revoked']) {
      for (const landing of ['', '&landing']) {
        await page.goto(`/learning-qa?state=${state}&member=${member}&custom${landing}`);
        await expect(page.locator('.bottom-cta button')).toBeDisabled();
        await expect(page.locator('.bottom-cta button')).toHaveText(label);
        await expect(page.locator('a[href="https://example.test/join"]')).toHaveCount(0);
        await expect(page.frameLocator('iframe').locator('#join-one')).toHaveAttribute('aria-disabled', 'true');
      }
    }
  }
  expect(errors).toEqual([]);
});

test('BF-04 closed HTML CTA suppresses mouse, keyboard and conversion while anchors keep working', async ({ page }) => {
  await page.goto('/learning-qa?state=closed&custom&landing');
  const frame = page.frameLocator('iframe');
  const link = frame.locator('#join-one');
  await expect(link).toHaveText('신청 마감');
  await expect(link).not.toHaveAttribute('href');
  await expect(link).toHaveAttribute('tabindex', '-1');
  await link.click({ force: true });
  await link.press('Enter');
  await expect(page).toHaveURL(/learning-qa/);
  await expect(page.locator('html')).not.toHaveAttribute('data-conversions');
  await expect(frame.locator('#toc')).toHaveAttribute('href', '#outline');
  await frame.locator('#toc').click();
  await expect(frame.locator('#editorial')).toHaveAttribute('href', 'https://example.test/reference');
  await expect(frame.getByText('등록한 디자인과 콘텐츠')).toBeVisible();
});

test('BF-01 direct checkout blocks unavailable cohorts and preserves free login return', async ({ page }) => {
  for (const state of ['upcoming', 'closed', 'cancelled']) {
    for (const member of ['guest', 'member']) {
      await page.goto(`/learning-qa/checkout?cohort=cohort&category=paid_class&state=${state}&member=${member}`);
      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.locator('a[href^="/login"]')).toHaveCount(0);
      await expect(page.getByText(state === 'upcoming' ? '모집 예정' : state === 'closed' ? '신청 마감' : '운영 취소', { exact: true })).toBeVisible();
    }
  }
  await page.goto('/learning-qa/checkout?cohort=cohort&state=recruiting');
  await expect(page.getByRole('link', { name: '로그인하기' })).toHaveAttribute('href', '/login?next=%2Fapply%3Fcohort%3Dcohort');
  await page.goto('/learning-qa/checkout?cohort=cohort&state=recruiting&category=paid_class&member=member');
  await expect(page.getByRole('link', { name: '이용 및 환불 안내' })).toHaveAttribute('href', '/policies/refund');
  await expect(page.getByRole('button', { name: '결제하기' })).toBeDisabled();
});

test('BF-02/04 valid learners and digital buyers use their existing access in body and fixed CTA', async ({ page }) => {
  for (const category of ['free', 'digital']) {
    for (const landing of ['', '&landing']) {
      await page.goto(`/learning-qa?state=closed&member=active&category=${category}&custom${landing}`);
      const href = category === 'digital' ? '/my/resources' : '/learn/enrollment';
      await expect(page.locator('.bottom-cta a')).toHaveAttribute('href', href);
      await expect(page.frameLocator('iframe').locator('#join-one')).toHaveAttribute('href', href);
      await expect(page.frameLocator('iframe').locator('#join-two')).toHaveAttribute('href', href);
      await expect(page.locator('a[href="https://example.test/join"]')).toHaveCount(0);
    }
  }
});

test('BF-03 valid cohort wins over closed cohort, including custom campaign CTA', async ({ page }) => {
  for (const extra of ['', '&custom', '&landing']) {
    await page.goto(`/learning-qa?multi&state=closed${extra}`);
    const cta = page.locator('.bottom-cta a, .campaign-sticky a');
    await expect(cta).toHaveAttribute('href', extra ? 'https://example.test/join' : '/apply?cohort=cohort');
    await expect(page.frameLocator('iframe').locator('#join-one')).toHaveAttribute('href', extra ? 'https://example.test/join' : '/apply?cohort=cohort');
  }
});

test('BF-04 safe inline HTML retains anchors and applies recruitment state', async ({ page }) => {
  await page.goto('/learning-qa?state=closed&inline');
  await expect(page.locator('#join-one')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#join-one')).not.toHaveAttribute('href');
  await expect(page.locator('#toc')).toHaveAttribute('href', '#outline');
  await page.goto('/learning-qa?state=recruiting&inline');
  await expect(page.locator('#join-one')).toHaveAttribute('href', '/apply?cohort=cohort');
});

test('catalogue badge, status filter, search, sorting and 12-item pagination agree', async ({ page }) => {
  const courses = Array.from({ length: 15 }, (_, i) => ({ id: `course-${i}`, slug: `class-${i}`, title: `클래스 ${String(i).padStart(2, '0')}`, status: 'published', category: 'paid_class', list_price: (i + 1) * 1000, display_order: i, metadata: { public_keywords: i === 14 ? '찾는키워드' : '' } }));
  const cohorts = courses.map((course, i) => ({ id: `cohort-${i}`, course_id: course.id, status: i === 13 ? 'closed' : i === 14 ? 'cancelled' : i === 12 ? 'upcoming' : 'recruiting', recruitment_start_at: i >= 12 ? '2098-01-01' : '2020-01-01', recruitment_end_at: '2099-01-01' }));
  await page.route('**/api/platform', route => route.fulfill({ json: { user: null, data: { courses, cohorts } } }));
  await page.goto('/learning-qa?catalogue');
  const cards = page.locator('.course-grid > a');
  await expect(cards).toHaveCount(12);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('모집 예정');
  await expect(cards.nth(1)).toContainText('모집 종료');
  await expect(cards.nth(2)).toContainText('운영 취소');
  await page.getByLabel('모집 상태', { exact: true }).selectOption('모집 종료');
  await expect(cards).toHaveCount(2);
  await page.getByLabel('클래스 검색', { exact: true }).fill('찾는키워드');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('클래스 14');
  await page.getByLabel('클래스 검색', { exact: true }).fill('');
  await page.getByLabel('모집 상태', { exact: true }).selectOption('전체 상태');
  await page.getByLabel('클래스 정렬', { exact: true }).selectOption('가격 높은순');
  await expect(cards).toHaveCount(12);
  await expect(cards.first()).toContainText('클래스 14');
  await page.getByLabel('모집 상태', { exact: true }).selectOption('모집 중');
  await expect(cards).toHaveCount(12);
  await page.getByLabel('모집 상태', { exact: true }).selectOption('모집 예정');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('클래스 12');
});

test('CTA fits viewport without overflow or overlap and has no browser errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const state of ['closed', 'recruiting']) {
    await page.goto(`/learning-qa?state=${state}&custom`);
    await expect(page.locator('iframe')).toBeVisible();
    await expect(page.frameLocator('iframe').locator('#join-one')).toHaveText(state === 'closed' ? '신청 마감' : '외부 신청하기');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const box = await page.locator('.bottom-cta').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await page.screenshot({ path: testInfo.outputPath(`${state}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
