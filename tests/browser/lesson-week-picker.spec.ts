import { expect, test } from '@playwright/test';
import { backend, id } from './helpers/lesson-author-backend';

test('a draft with an unavailable week can select week zero without losing its contents', async ({ page }) => {
  const server = await backend(page);
  server.get().payload.form.basic.week_id = id(999);
  server.get().payload.form.basic.title = '작성 중인 준비 수업';
  await page.goto('/lesson-block-author-test?serverDraft=1&zeroWeek=1');
  const picker = page.getByRole('combobox', { name: '주차 (Week) *', exact: true });
  await expect(picker.locator('option')).toHaveText(['주차 선택', '합성 과정 · 0주차 · 준비 안내', '합성 과정 · 1주차 · 첫 주차']);
  await picker.selectOption(id(5));
  await expect(picker).toHaveValue(id(5));
  await page.getByRole('button', { name: '지금 저장', exact: true }).click();
  await expect(page.locator('.learning-save-feedback')).toContainText('서버에 초안을 저장했습니다.');
  expect(server.get().payload.form.basic.week_id).toBe(id(5));
  expect(server.get().payload.form.basic.title).toBe('작성 중인 준비 수업');
  expect(server.get().payload.blocks.document.blocks).toEqual([{ id: 'original', type: 'text', content: '학생이 보는 원래 본문' }]);
  expect(server.writes.some(write => write.action === 'publish')).toBe(false);
});

test('a valid week zero draft keeps its selection and can move within the same course', async ({ page }) => {
  await backend(page);
  await page.goto('/lesson-block-author-test?serverDraft=1&zeroWeek=1');
  const picker = page.getByRole('combobox', { name: '주차 (Week) *', exact: true });
  await expect(picker).toHaveValue(id(5));
  await picker.selectOption(id(6));
  await expect(picker.locator('option')).toHaveCount(3);
  await picker.selectOption(id(5));
  await expect(picker).toHaveValue(id(5));
});
