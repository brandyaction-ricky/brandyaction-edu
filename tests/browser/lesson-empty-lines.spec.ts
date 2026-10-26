import { test, expect, type Page, type Locator } from '@playwright/test';
import { backend } from './helpers/lesson-author-backend';
import { serializeLessonDocument } from '../../lib/lesson-body';
import type { LessonBlock } from '../../lib/lesson-blocks';

const canvas = (page: Page) => page.getByRole('textbox', { name: '수업 문서', exact: true });
const text = (value: string) => ({ type: 'paragraph', ...(value ? { content: [{ type: 'text', text: value }] } : {}) });
const content = (...values: string[]) => serializeLessonDocument({ type: 'doc', content: values.map(text) });
async function caret(element: Locator, end = false) {
  await element.click();
  // Home/End are platform-dependent on macOS. Set only the DOM caret; deletion
  // still goes through the browser's real key events and editor transaction.
  await element.evaluate((el, atEnd) => {
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(!atEnd);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, end);
}
const initial: LessonBlock[] = [
  { id: 'before', type: 'text', content: content('앞의 안내입니다.') },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `blank-${i}`, type: 'text' as const, content: '' })),
  { id: 'after', type: 'heading', content: '다음 학습 제목' },
  { id: 'question', type: 'question', question: { label: '보존할 질문', kind: 'text', required: true } },
];
async function open(page: Page, blocks = initial) {
  const server = await backend(page);
  server.get().payload.blocks.document.blocks = structuredClone(blocks);
  await page.goto('/lesson-block-author-test?serverDraft=1');
  await expect(canvas(page)).toBeVisible();
  return server;
}

test('Backspace removes separate blank text items and persists the smaller gap', async ({ page }) => {
  const server = await open(page);
  await caret(canvas(page).locator('[data-author-block="after"] h2'));
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(0);
  await expect(canvas(page).getByRole('heading', { name: '다음 학습 제목' })).toBeVisible();
  await expect.poll(() => server.get().payload.blocks.document.blocks.length).toBe(3);
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(0);
  expect(server.get().payload.blocks.document.blocks.map(b => b.id)).toEqual(['before', 'after', 'question']);
  expect(server.writes.filter(x => x.action === 'publish')).toHaveLength(0);
  expect(server.get().payload.blocks.document.blocks).toEqual([initial[0], initial[7], initial[8]]);
});

test('blank boundary deletion supports undo and redo without changing neighboring blocks', async ({ page }) => {
  await open(page);
  await caret(canvas(page).locator('[data-author-block="after"] h2'));
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(6);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(0);
});

for (const key of ['Backspace', 'Delete']) {
  test(`${key} from an empty item moves the caret to adjacent text without losing it`, async ({ page }) => {
    const server = await open(page, [initial[0], initial[1], initial[7]]);
    await caret(canvas(page).locator('[data-author-block="blank-0"] p'));
    await page.keyboard.press(key);
    await expect(canvas(page).locator('[data-author-block="blank-0"]')).toHaveCount(0);
    await page.keyboard.type('추가');
    await expect.poll(() => server.get().payload.blocks.document.blocks.length).toBe(2);
    await expect(canvas(page).locator(`[data-author-block="${key === 'Backspace' ? 'before' : 'after'}"]`)).toContainText('추가');
    await expect(canvas(page).locator('[data-author-block="before"]')).toContainText('앞의 안내입니다.');
    await expect(canvas(page).locator('[data-author-block="after"]')).toContainText('다음 학습 제목');
  });
}

for (const key of ['Backspace', 'Delete']) {
  test(`${key} removes one empty paragraph at the neighboring item edge, preserving its text`, async ({ page }) => {
    const blocks: LessonBlock[] = key === 'Backspace'
      ? [{ id: 'before', type: 'text', content: content('앞의 안내입니다.', '', '') }, initial[7]]
      : [initial[0], { id: 'after', type: 'text', content: content('', '', '다음 학습 제목') }];
    const server = await open(page, blocks);
    const active = canvas(page).locator(key === 'Backspace' ? '[data-author-block="after"] h2' : '[data-author-block="before"] p');
    await caret(active, key === 'Delete');
    await page.keyboard.press(key);
    await expect(canvas(page).locator(key === 'Backspace' ? '[data-author-block="before"] p' : '[data-author-block="after"] p')).toHaveCount(2);
    await page.keyboard.press(key);
    await expect(canvas(page).locator(key === 'Backspace' ? '[data-author-block="before"] p' : '[data-author-block="after"] p')).toHaveCount(1);
    await expect(canvas(page)).toContainText('앞의 안내입니다.');
    await expect(canvas(page)).toContainText('다음 학습 제목');
    await expect.poll(() => server.get().payload.blocks.document.blocks.length).toBe(2);
  });
}

test('ordinary empty paragraphs within one item still delete and the final empty item remains writable', async ({ page }) => {
  await open(page, [{ id: 'body', type: 'text', content: content('첫 문단', '', '', '끝 문단') }]);
  const paragraphs = canvas(page).locator('p');
  await caret(paragraphs.last());
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await expect(paragraphs).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Delete');
  await page.keyboard.type('다시 작성');
  await expect(canvas(page)).toContainText('다시 작성');
});

test('empty paragraph deletion never removes a neighboring question or attachment', async ({ page }) => {
  const photo: LessonBlock = { id: 'photo', type: 'image', url: 'https://example.test/photo.png', content: '보존할 사진' };
  const server = await open(page, [initial[8], initial[1], photo]);
  const blank = canvas(page).locator('[data-author-block="blank-0"] p');
  for (const key of ['Backspace', 'Delete']) {
    await caret(blank); await page.keyboard.press(key); await page.keyboard.press(key);
    await expect(canvas(page).locator('[data-author-block="blank-0"]')).toHaveCount(0);
    await expect(canvas(page).locator('[data-author-block="question"]')).toBeVisible();
    await expect(canvas(page).locator('[data-author-block="photo"]')).toBeVisible();
    await expect.poll(() => server.get().payload.blocks.document.blocks).toEqual([initial[8], photo]);
    await page.getByRole('button', { name: '실행 취소', exact: true }).click();
    await expect(canvas(page).locator('[data-author-block="blank-0"]')).toHaveCount(1);
  }
});

test('Delete removes separate blank items from the preceding paragraph without losing its text', async ({ page }) => {
  await open(page);
  const before = canvas(page).locator('[data-author-block="before"] p');
  await caret(before, true);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Delete');
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(0);
  await expect(before).toHaveText('앞의 안내입니다.');
  await expect(canvas(page).locator('[data-author-block="question"]')).toBeVisible();
});

const list: LessonBlock = { id: 'list', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
  { type: 'bulletList', content: [{ type: 'listItem', content: [text('목록 안의 안내')] }] },
] }) };
test('Backspace from the gap below a list removes the gap and preserves list structure', async ({ page }) => {
  const server = await open(page, [list, initial[1], initial[7], initial[8]]);
  await caret(canvas(page).locator('[data-author-block="blank-0"] p'));
  await page.keyboard.press('Backspace');
  await expect(canvas(page).locator('[data-author-block="blank-0"]')).toHaveCount(0);
  await expect(canvas(page).locator('ul li')).toHaveText('목록 안의 안내');
  await expect.poll(() => server.get().payload.blocks.document.blocks).toEqual([list, initial[7], initial[8]]);
  await page.keyboard.type('추가');
  await expect(canvas(page).locator('ul li')).toHaveText('목록 안의 안내추가');
});

test('Delete at the end of a list removes neighboring blank items without flattening the list', async ({ page }) => {
  const server = await open(page, [list, ...initial.slice(1)]);
  await caret(canvas(page).locator('ul li p'), true);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Delete');
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(0);
  await expect.poll(() => server.get().payload.blocks.document.blocks).toEqual([list, initial[7], initial[8]]);
});

test('toggle contents and embedded media survive deletion of a following blank item', async ({ page }) => {
  const photo: LessonBlock = { id: 'photo', type: 'image', url: 'https://example.test/photo.png', content: '토글 사진' };
  const toggle: LessonBlock = { id: 'toggle', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'details', attrs: { open: true }, content: [
      { type: 'detailsSummary', content: [{ type: 'text', text: '토글 제목' }] },
      { type: 'detailsContent', content: [{ type: 'lessonImage', attrs: { blockId: photo.id } }, text('토글 마지막 설명')] },
    ] },
  ] }) };
  const server = await open(page, [toggle, photo, initial[1], initial[7]]);
  await canvas(page).getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await caret(canvas(page).locator('[data-type="detailsContent"] p'), true);
  await page.keyboard.press('Delete');
  await expect(canvas(page).locator('[data-author-block="blank-0"]')).toHaveCount(0);
  await expect(canvas(page).locator('[data-type="details"]')).toHaveCount(1);
  await expect(canvas(page).locator('[data-author-block="photo"]')).toBeVisible();
  await expect.poll(() => server.get().payload.blocks.document.blocks).toEqual([toggle, photo, initial[7]]);
});

test('composition and a newly selected DOM text range do not delete surrounding blank items', async ({ page }) => {
  await open(page);
  const heading = canvas(page).locator('[data-author-block="after"] h2');
  await caret(heading);
  await canvas(page).dispatchEvent('keydown', { key: 'Backspace', isComposing: true });
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(6);
  // The DOM selection can change before ProseMirror receives selectionchange.
  // Reproduce that ordering with a real key, rather than relying on a timer.
  await canvas(page).evaluate(el => el.addEventListener('keydown', () => {
    const text = el.querySelector('[data-author-block="after"] h2')!.firstChild!;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 1);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  }, { once: true, capture: true }));
  await page.keyboard.press('Backspace');
  await expect(heading).toHaveText('음 학습 제목');
  await expect(canvas(page).locator('[data-author-block^="blank-"]')).toHaveCount(6);
});

test('first Backspace after a Markdown heading restores its input before deleting a neighboring blank', async ({ page }) => {
  await open(page, [initial[1], { id: 'body', type: 'text', content: '' }]);
  const body = canvas(page).locator('[data-author-block="body"]');
  await caret(body.locator('p'));
  await page.keyboard.type('# ');
  await expect(body.locator('h1')).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(body.locator('p')).toHaveText('# ');
  await expect(canvas(page).locator('[data-author-block="blank-0"]')).toHaveCount(1);
});
