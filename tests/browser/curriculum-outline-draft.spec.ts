import { expect, test, type Page } from '@playwright/test';
import { backend, id } from './helpers/lesson-author-backend';

async function setup(page: Page) {
  const server = await backend(page, { day: 15 });
  const state = server.get();
  state.revision = id(80);
  state.payload.form.basic.day_number = '2';
  state.payload.form.basic.title = '새 준비 수업';
  const weeks = [{ id: id(5), course_id: 'course-one', week_number: 0, title: '준비 안내', is_published: true }];
  await page.route('**/api/platform?**', route => route.fulfill({ json: { data: {
    curriculum_weeks: weeks,
    curriculum_lessons: [
      { id: 'legacy-one', week_id: id(5), day_number: 1, title: '첫 안내', content_type: 'text' },
      { id: id(4), ...server.get().public.payload.form.basic, day_number: Number(server.get().public.payload.form.basic.day_number), content_type: 'text', curriculum_day_number: 15 },
    ],
    lesson_contents: [{ lesson_id: id(4), body_text: '공개된 본문' }],
  } } }));
  return server;
}

const url = `/curriculum-editor-test?course=course-one&lesson=${id(4)}&actor=${id(90)}&blocks=1`;
const selected = (page: Page) => page.locator('.studio-lesson-link[aria-current="page"]');

test('week zero outline restores day two and draft title while keeping student state separate', async ({ page }, info) => {
  const server = await setup(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole('textbox', { name: '수업 제목', exact: true })).toHaveValue('새 준비 수업');
  await expect(selected(page)).toContainText('2일차');
  await expect(selected(page)).toContainText('새 준비 수업');
  await expect(selected(page)).toContainText('학생 반영 전');
  await expect(page.locator('.studio-document-header')).toContainText('0주차 · 2일차');
  await expect(selected(page).locator('..')).toContainText('학생 반영: 공개');
  expect(server.get().public.payload.form.basic.day_number).toBe('15');
  expect(server.writes).toHaveLength(0);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('week-zero-draft-outline.png'), fullPage: true });
});

test('saving a draft updates outline, switching and reload retain it without publishing', async ({ page }) => {
  const server = await setup(page);
  await page.goto(url);
  await page.getByRole('textbox', { name: '수업 제목', exact: true }).fill('저장한 새 제목');
  await page.getByRole('button', { name: '지금 저장', exact: true }).first().click();
  await expect(selected(page)).toContainText('저장한 새 제목');
  await page.getByRole('button', { name: '1일차 첫 안내', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '수업 제목', exact: true })).toHaveValue('첫 안내');
  const saved = page.locator('.studio-lesson-link').filter({ hasText: '저장한 새 제목' });
  await expect(saved).toContainText('2일차');
  await saved.click();
  await expect(selected(page)).toContainText('2일차');
  await page.reload();
  await expect(selected(page)).toContainText('저장한 새 제목');
  await expect(selected(page)).toContainText('2일차');
  expect(server.get().public.payload.form.basic.day_number).toBe('15');
  expect(server.writes.some(write => write.action === 'publish')).toBe(false);
});

test('automatic draft save updates the outline without requiring another click', async ({ page }) => {
  const server = await setup(page);
  await page.goto(url);
  await page.getByRole('textbox', { name: '수업 제목', exact: true }).fill('자동저장한 준비 수업');
  await expect(selected(page)).toContainText('자동저장한 준비 수업', { timeout: 10_000 });
  await expect(selected(page)).toContainText('2일차');
  expect(server.writes.some(write => write.action === 'save' && write.saveSource === 'autosave')).toBe(true);
  expect(server.writes.some(write => write.action === 'publish')).toBe(false);
  expect(server.get().public.payload.form.basic.day_number).toBe('15');
});

test('student publication clears the draft marker and keeps the displayed day', async ({ page }) => {
  await setup(page);
  page.on('dialog', dialog => dialog.accept());
  await page.goto(url);
  await expect(selected(page)).toContainText('학생 반영 전');
  await page.getByRole('button', { name: '학생 화면에 반영', exact: true }).click();
  await expect(page.locator('.learning-save-feedback')).toContainText('학생 화면에 반영했습니다.');
  await expect(selected(page)).not.toContainText('학생 반영 전');
  await expect(selected(page)).toContainText('2일차');
});
