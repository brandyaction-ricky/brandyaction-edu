import { expect, test, type Page } from '@playwright/test';

async function trackCurriculumReads(page: Page) {
  const reads: string[] = [];
  await page.route('**/api/platform?**', route => {
    const params = new URL(route.request().url()).searchParams;
    reads.push(params.get('record') || '');
    return route.fulfill({ json: { data: { curriculum_weeks: [], curriculum_lessons: [], lesson_contents: [] } } });
  });
  return reads;
}

test('deleted products stay out of both curriculum selectors while sales-ended products remain editable', async ({ page }) => {
  const reads = await trackCurriculumReads(page);
  await page.goto('/curriculum-editor-test?productArchive=1');
  const picker = page.getByRole('region', { name: '커리큘럼을 편집할 상품 선택' });
  await expect(picker.getByRole('button')).toHaveCount(3);
  await expect(picker.getByRole('button', { name: '삭제한 테스트 상품 커리큘럼 열기' })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: '판매를 종료한 상품 커리큘럼 열기' })).toBeVisible();
  await picker.getByRole('button', { name: 'AI 문샷 챌린지 커리큘럼 열기' }).click();
  const selector = page.getByRole('combobox', { name: '편집할 상품' });
  await expect(selector.locator('option')).toHaveCount(3);
  await expect(selector.locator('option[value="course-archived"]')).toHaveCount(0);
  await expect(selector.locator('option[value="course-stopped"]')).toHaveText('판매를 종료한 상품');
  await selector.selectOption('course-stopped');
  await expect(selector).toHaveValue('course-stopped');
  await expect.poll(() => reads.includes('course-stopped')).toBe(true);
  expect(reads).not.toContain('course-archived');
});

test('a deleted product remembered from the last session opens a recovery notice instead of its curriculum', async ({ page }) => {
  const reads = await trackCurriculumReads(page);
  await page.addInitScript(() => localStorage.setItem('edu.curriculum.recent.v1:editor-one', JSON.stringify({ courseId: 'course-archived', lessonId: 'archived-lesson' })));
  await page.goto('/curriculum-editor-test?productArchive=1');
  await expect(page.getByText('삭제된 상품의 커리큘럼입니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /상품·판매 설정/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '편집할 상품' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '커리큘럼을 편집할 상품 선택' })).toBeVisible();
  expect(reads).not.toContain('course-archived');
});

test('a direct deleted-product lesson link cannot open the workspace', async ({ page }) => {
  const reads = await trackCurriculumReads(page);
  await page.goto('/curriculum-editor-test?productArchive=1&course=course-archived&lesson=archived-lesson');
  await expect(page.getByText('삭제된 상품의 커리큘럼입니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /상품·판매 설정/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: '편집할 상품' })).toHaveCount(0);
  expect(reads).not.toContain('course-archived');
});

test('restoring a product makes its existing curriculum selectable again', async ({ page }) => {
  const reads = await trackCurriculumReads(page);
  await page.goto('/curriculum-editor-test?productArchive=1');
  const restored = page.getByRole('button', { name: '삭제한 테스트 상품 커리큘럼 열기' });
  await expect(restored).toHaveCount(0);
  await page.getByRole('button', { name: '합성 삭제 상품 복원' }).click();
  await expect(restored).toBeVisible();
  await restored.click();
  await expect(page.getByRole('combobox', { name: '편집할 상품' })).toHaveValue('course-archived');
  await expect.poll(() => reads.includes('course-archived')).toBe(true);
  await expect(page.getByText('삭제된 상품의 커리큘럼입니다.', { exact: true })).toHaveCount(0);
});
