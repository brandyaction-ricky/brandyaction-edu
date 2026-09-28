import { expect, test } from '@playwright/test';

test('learner text links open the destination in a separate tab and preserve the lesson', async ({ page, context }) => {
  await context.route('https://claude.com/download', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<title>Synthetic download</title><h1>합성 다운로드 페이지</h1>' }));
  await page.goto('/classroom-questions-test?links');
  const body = page.locator('.reading-copy');
  const link = body.getByRole('link', { name: '클로드 다운로드 페이지', exact: true });
  await expect(link).toHaveAttribute('href', 'https://claude.com/download');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveCSS('text-decoration-line', 'underline');
  await expect(body.getByRole('link', { name: 'https://example.test/guide' })).toBeVisible();
  await expect(body.getByRole('link', { name: '실행 금지' })).toHaveCount(0);
  await expect(body).toContainText('[1. 클로드 설치하기]');
  const popupReady = page.waitForEvent('popup');
  await link.click();
  const popup = await popupReady;
  await expect(popup.getByRole('heading', { name: '합성 다운로드 페이지' })).toBeVisible();
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();
  await expect(page).toHaveURL(/classroom-questions-test\?links/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('product curriculum preview turns existing and unsaved body links into clickable text', async ({ page }) => {
  const bodyText = '1. [클로드 다운로드 페이지](https://claude.com/download)를 엽니다.';
  await page.route('**/api/platform?**part=curriculum', route => route.fulfill({ json: { data: {
    curriculum_weeks: [{ id: 'synthetic-week', course_id: 'synthetic-course', week_number: 1, title: '합성 주차' }],
    curriculum_lessons: [{ id: 'lesson-one', week_id: 'synthetic-week', day_number: 1, title: '설치 안내', content_type: 'text' }],
    lesson_contents: [{ lesson_id: 'lesson-one', body_text: bodyText }],
  } } }));
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '커리큘럼', exact: true }).click();
  await page.getByRole('button', { name: '학습 편집', exact: true }).click();
  await page.getByRole('button', { name: '학습 내용 미리보기', exact: true }).click();
  const preview = page.getByRole('region', { name: '학습 내용 미리보기' });
  await expect(preview.getByRole('link', { name: '클로드 다운로드 페이지' })).toHaveAttribute('href', 'https://claude.com/download');
  await page.getByRole('textbox', { name: '학습 본문' }).fill(bodyText + '\nhttps://example.test/download\n[위험](data:text/html,test)');
  await expect(preview.getByRole('link', { name: 'https://example.test/download' })).toHaveAttribute('href', 'https://example.test/download');
  await expect(preview.getByRole('link', { name: '위험' })).toHaveCount(0);
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
