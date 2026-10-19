import { test, expect, type Page, type Locator } from '@playwright/test';
import { backend } from './helpers/lesson-author-backend';

const publish = (page: Page) => page.getByRole('button', { name: '학생 화면에 반영', exact: true });
async function focusedInView(field: Locator) {
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
}
test.beforeEach(async ({ page }) => { page.on('dialog', dialog => dialog.accept()); });

test('publish opens the failing block settings, highlights each problem and lets the summary navigate again', async ({ page }) => {
  const api = await backend(page);
  api.get().payload.blocks.document.blocks = [
    { id: 'long-body', type: 'text', content: Array(70).fill('이전에 작성한 본문은 그대로 보존합니다.').join('\n\n') },
    { id: 'question-missing', type: 'question', question: { label: '', kind: 'text', required: true } },
    { id: 'link-missing', type: 'link', url: '' },
  ];
  await page.goto('/lesson-block-author-test?serverDraft=1&embedded');
  await publish(page).click();
  const inspector = page.getByRole('complementary', { name: '선택 항목 설정' });
  const question = inspector.getByRole('textbox', { name: '질문 문구' });
  await focusedInView(question);
  await expect(inspector.locator('[data-validation-error=true]')).toContainText('2번 중간 질문');
  expect(api.writes.filter(write => write.action === 'publish')).toHaveLength(0);
  await publish(page).click();
  await focusedInView(question); // Repeating the same failure must navigate again.
  await page.getByRole('list', { name: '확인할 필수 항목' }).getByRole('button', { name: /3번 외부 링크/ }).click();
  const url = inspector.locator('input[type=url]');
  await focusedInView(url);
  await url.fill('https://example.test/guide');
  await expect(inspector.locator('[data-validation-error=true]')).toHaveCount(0);
  await page.getByRole('list', { name: '확인할 필수 항목' }).getByRole('button', { name: /2번 중간 질문/ }).click();
  await question.fill('무엇을 배웠나요?');
  await expect(page.getByRole('list', { name: '확인할 필수 항목' })).toHaveCount(0);
  await publish(page).click();
  await expect(page.locator('.learning-save-feedback')).toContainText('학생 화면에 반영했습니다.');
  expect(api.get().public.payload.blocks.document.blocks[0].content).toContain('이전에 작성한 본문');
});

test('publish reveals a missing checklist field inside its collapsed settings', async ({ page }) => {
  const api = await backend(page);
  api.get().payload.blocks.document.checklist = [{ id: 'check-empty', label: '', required: true }];
  await page.goto('/lesson-block-author-test?serverDraft=1&embedded');
  const field = page.getByRole('textbox', { name: '체크 항목 1', exact: true });
  await publish(page).click();
  await focusedInView(field);
  await expect(field.locator('xpath=ancestor::details')).toHaveAttribute('open', '');
  await expect(page.locator('.studio-version-section')).not.toHaveAttribute('open', '');
  expect(api.writes.filter(write => write.action === 'publish')).toHaveLength(0);
});

test('publish focuses the embedded title outside the form and rejects a whitespace-only title', async ({ page }) => {
  const api = await backend(page);
  await page.goto('/lesson-block-author-test?serverDraft=1&embedded');
  const title = page.getByRole('textbox', { name: '수업 제목', exact: true });
  await expect(title).toBeVisible();
  await title.fill('   ');
  await publish(page).click();
  await focusedInView(title);
  expect(await title.evaluate(node => (node as HTMLInputElement).validity.valid)).toBe(false);
  expect(api.writes.filter(write => write.action === 'publish')).toHaveLength(0);
  await title.fill('다시 작성한 수업 제목');
  await publish(page).click();
  await expect(page.locator('.learning-save-feedback')).toContainText('학생 화면에 반영했습니다.');
});

test('publish opens only the enclosing lesson settings for an invalid ordinal', async ({ page }) => {
  const api = await backend(page);
  await page.goto('/lesson-block-author-test?serverDraft=1&embedded');
  await page.locator('.studio-lesson-settings > summary').click();
  const ordinal = page.getByRole('spinbutton', { name: /주차 안 수업 순서/ });
  await ordinal.fill('0');
  await page.locator('.studio-lesson-settings > summary').click();
  await publish(page).click();
  await focusedInView(ordinal);
  await expect(page.locator('.studio-lesson-settings')).toHaveAttribute('open', '');
  await expect(page.locator('.studio-version-section')).not.toHaveAttribute('open', '');
  expect(api.writes.filter(write => write.action === 'publish')).toHaveLength(0);
});

test('empty lesson explains the missing content at the editing location without publishing', async ({ page }) => {
  const api = await backend(page);
  api.get().payload.blocks.document = { schemaVersion: 1, blocks: [], checklist: [] };
  await page.goto('/lesson-block-author-test?serverDraft=1&embedded');
  await publish(page).click();
  const error = page.locator('.lba-document-error');
  await expect(error).toContainText('본문이나 질문을 한 개 이상 추가해 주세요.');
  await focusedInView(error);
  expect(api.writes.filter(write => write.action === 'publish')).toHaveLength(0);
});

test('detailed mode moves directly to the invalid block and clears its highlight after correction', async ({ page }) => {
  const api = await backend(page);
  api.get().payload.blocks.document.blocks.push({ id: 'empty-heading', type: 'heading', content: '   ' });
  await page.goto('/lesson-block-author-test?serverDraft=1');
  await page.getByRole('button', { name: '항목별 상세 설정', exact: true }).click();
  await publish(page).click();
  const block = page.locator('.lba-block[data-author-block="empty-heading"]');
  const field = block.getByRole('textbox', { name: '내용' });
  await focusedInView(field);
  await expect(block).toHaveAttribute('data-validation-error', 'true');
  await field.fill('내용을 입력한 제목');
  await expect(block).not.toHaveAttribute('data-validation-error', 'true');
  expect(api.writes.filter(write => write.action === 'publish')).toHaveLength(0);
});

test('incompatible completion settings open the right section and explain the requirement', async ({ page }) => {
  const api = await backend(page);
  api.get().payload.blocks.document.progression = { track: 'daily', dayNumber: 1 };
  api.get().payload.blocks.document.completion = { mode: 'self', requireAnswers: false, requireQuizPass: false };
  await page.goto('/lesson-block-author-test?serverDraft=1&embedded');
  await publish(page).click();
  await focusedInView(page.getByRole('combobox', { name: '학습 개방 방식' }));
  await expect(page.locator('.ldc-settings[data-validation-error=true]')).toContainText('멘토 확인 방식');
  await page.getByRole('combobox', { name: '완료 방식' }).selectOption('mentor');
  await expect(page.locator('.ldc-settings[data-validation-error=true]')).toHaveCount(0);
  await publish(page).click();
  await expect(page.locator('.learning-save-feedback')).toContainText('학생 화면에 반영했습니다.');
});

test('an unsaved separate quiz is highlighted without publishing the lesson', async ({ page }) => {
  const api = await backend(page);
  await page.goto('/lesson-block-author-test?serverDraft=1&embedded&quiz=1');
  await page.getByRole('button', { name: '문제 추가', exact: true }).click();
  await publish(page).click();
  const quiz = page.locator('.learning-quiz-panel');
  await expect(quiz).toHaveAttribute('data-validation-error', 'true');
  await focusedInView(quiz.getByRole('textbox', { name: '1번 문제', exact: true }));
  expect(api.writes.filter(write => write.action === 'publish')).toHaveLength(0);
});
