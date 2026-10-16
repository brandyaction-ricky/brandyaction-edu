import { test, expect, type Page } from '@playwright/test';
import type { Editor } from '@tiptap/core';
import { backend } from './helpers/lesson-author-backend';
import { serializeLessonDocument } from '../../lib/lesson-body';

const canvas = (page: Page) => page.getByRole('textbox', { name: '수업 문서', exact: true });
async function setup(page: Page, paragraphs: number) {
  const server = await backend(page);
  server.get().payload.blocks.document.blocks = [{ id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'paragraph' }, ...Array.from({ length: paragraphs }, (_, n) => ({ type: 'paragraph', content: [{ type: 'text', text: `학습 문단 ${n + 1}` }] })),
  ] }) }];
  server.get().payload.blocks.document.checklist = [
    { id: 'check-a', label: '첫 항목', required: true },
    { id: 'check-b', label: '두 번째 항목', required: false },
    { id: 'check-c', label: '세 번째 항목', required: true },
  ];
  await page.goto('/lesson-block-author-test?serverDraft=1');
  await expect(canvas(page)).toBeVisible();
  return server;
}
test('Korean IME preserves the first consonant on an empty movable paragraph', async ({ page }) => {
  const server = await setup(page, 2);
  const cdp = await page.context().newCDPSession(page);
  const paragraph = canvas(page).locator('.ldc-movable-paragraph').first();
  for (let n = 0; n < 8; n++) {
    await paragraph.click(); await page.keyboard.press('Home'); await page.keyboard.press('Shift+End'); await page.keyboard.press('Backspace');
    await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '가' });
    await page.keyboard.insertText('나다');
    await expect(paragraph).toContainText('가나다');
  }
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content).toContain('가나다');
  expect(server.writes.filter(row => row.action === 'publish')).toHaveLength(0);
});
test('deleting a whole line preserves its editable content DOM before Korean composition', async ({ page }) => {
  const server = await backend(page);
  server.get().payload.blocks.document.blocks = [{ id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '기존 굵은 문장', marks: [{ type: 'bold' }] }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '기존 제목' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '기존 일반 문장' }] },
  ] }) }];
  await page.goto('/lesson-block-author-test?serverDraft=1');
  await expect(canvas(page).locator('[data-lesson-movable]')).toHaveText(['기존 굵은 문장', '기존 제목', '기존 일반 문장']);
  const cdp = await page.context().newCDPSession(page);
  const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
  for (const index of [0, 1, 2]) {
    const block = canvas(page).locator('[data-lesson-movable]').nth(index);
    for (let repeat = 0; repeat < 4; repeat++) {
      await block.locator('.ldc-move-content').click();
      if (mac) {
        await page.keyboard.press('Meta+ArrowRight');
        // Native caret motion dispatches selectionchange asynchronously on Mac.
        // Verify the deletion starts at the intended line end in both models.
        await expect.poll(() => canvas(page).evaluate(el => {
          const editor = (el as HTMLElement & { editor: Editor }).editor;
          const selection = getSelection(), { $head } = editor.state.selection;
          return !!selection?.focusNode && $head.parentOffset === $head.parent.content.size &&
            editor.view.posAtDOM(selection.focusNode, selection.focusOffset) === $head.pos;
        })).toBe(true);
        await page.keyboard.press('Meta+Backspace');
      } else {
        await page.keyboard.press('Home'); await page.keyboard.press('Shift+End');
        // The Linux CI runner also delivers native selectionchange later than
        // the key event. Do not send Backspace while the model still has a
        // collapsed caret: that tests a different deletion than this case.
        await expect.poll(() => block.evaluate(el => {
          const editor = (el.closest('[aria-label="수업 문서"]') as HTMLElement & { editor: Editor }).editor;
          const content = el.querySelector('.ldc-move-content')!;
          const start = editor.view.posAtDOM(content, 0);
          const end = editor.view.posAtDOM(content, content.childNodes.length);
          const selection = getSelection(), { from, to } = editor.state.selection;
          return !!selection?.anchorNode && !!selection.focusNode && from === start && to === end && from < to &&
            Math.min(editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset), editor.view.posAtDOM(selection.focusNode, selection.focusOffset)) === start &&
            Math.max(editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset), editor.view.posAtDOM(selection.focusNode, selection.focusOffset)) === end;
        })).toBe(true);
        await page.keyboard.press('Backspace');
      }
      // Chrome may remove the content wrapper, not just its text. The node view
      // must let ProseMirror observe that deletion and repair its input context.
      await expect(block.locator('.ldc-move-content')).toBeAttached();
      await expect(block).toHaveText('');
      await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
      await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
      await cdp.send('Input.insertText', { text: '가' }); await page.keyboard.insertText('나다');
      await expect(block).toHaveText('가나다');
    }
  }
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content?.match(/가나다/g)?.length).toBe(3);
  await page.getByRole('button', { name: '편집 다시 열기', exact: true }).click();
  await expect(canvas(page).locator('[data-lesson-movable]')).toHaveText(['가나다', '가나다', '가나다']);
  expect(server.writes.filter(row => row.action === 'publish')).toHaveLength(0);
});
test('Tab on the last paragraph never jumps to the first move handle', async ({ page }) => {
  await setup(page, 80);
  const last = canvas(page).locator('.ldc-movable-paragraph').last();
  await last.click(); await page.keyboard.press('End');
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(before - 100);
  await expect(page.getByText('완료 체크리스트', { exact: true })).toBeFocused();
});
test('Tab walks adjacent handles from the caret and Shift+Tab returns without editing', async ({ page }) => {
  const server = await setup(page, 4);
  const original = server.get().payload.blocks.document.blocks[0].content;
  const handles = canvas(page).getByRole('button', { name: '문단 이동', exact: true });
  await canvas(page).locator('.ldc-movable-paragraph').nth(2).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await expect(handles.nth(3)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(handles.nth(4)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(handles.nth(3)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(handles.nth(2)).toBeFocused();
  expect(server.get().payload.blocks.document.blocks[0].content).toBe(original);
});
test('Shift+Tab from text focuses its own handle, then exits before the first', async ({ page }) => {
  await setup(page, 2);
  await canvas(page).locator('.ldc-movable-paragraph').first().click();
  await page.keyboard.press('Shift+Tab');
  await expect(canvas(page).getByRole('button', { name: '문단 이동', exact: true }).first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await canvas(page).evaluate(el => el.contains(document.activeElement))).toBe(false);
});
test('Tab follows visible handles across lists, quotes and a closed toggle', async ({ page }) => {
  const server = await backend(page);
  server.get().payload.blocks.document.blocks = [{ id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '첫 문단' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '목록 항목' }] }] }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '인용문' }] }] },
    { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '접힌 제목' }] }, { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: '접힌 문단' }] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '끝 문단' }] },
  ] }) }];
  const original = server.get().payload.blocks.document.blocks[0].content;
  await page.goto('/lesson-block-author-test?serverDraft=1');
  const handles = canvas(page).locator('[data-drag-handle]:visible');
  await expect(handles).toHaveCount(5);
  await canvas(page).locator('.ldc-movable-paragraph').first().click();
  await page.keyboard.press('Shift+Tab');
  await expect(handles.first()).toBeFocused();
  for (let n = 1; n < 5; n++) {
    await page.keyboard.press('Tab'); await expect(handles.nth(n)).toBeFocused();
  }
  for (let n = 3; n >= 0; n--) {
    await page.keyboard.press('Shift+Tab'); await expect(handles.nth(n)).toBeFocused();
  }
  expect(server.get().payload.blocks.document.blocks[0].content).toBe(original);
  expect(server.writes).toHaveLength(0);
});
test('Korean IME starts safely at the boundary beside a move handle', async ({ page }) => {
  await setup(page, 2);
  const cdp = await page.context().newCDPSession(page);
  const paragraph = canvas(page).locator('.ldc-movable-paragraph').first();
  await paragraph.click();
  await paragraph.evaluate(el => {
    const range = document.createRange(); range.setStart(el, 1); range.collapse(true);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '가' });
  await page.keyboard.insertText('나다');
  await expect(paragraph).toContainText('가나다');
});
test('Korean typing after selecting a blank paragraph handle keeps its first consonant', async ({ page }, info) => {
  const server = await setup(page, 2);
  const cdp = await page.context().newCDPSession(page);
  const handle = canvas(page).getByRole('button', { name: '문단 이동', exact: true }).first();
  await handle.hover(); await page.mouse.down();
  // The native Mac IME must keep an editable input context before mouseup.
  await expect(canvas(page)).toBeFocused();
  await page.mouse.up();
  await expect(handle).toHaveAttribute('tabindex', '0');
  await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '가' });
  await page.keyboard.insertText('나다');
  await expect(canvas(page)).toContainText('가나다');
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content).toContain('가나다');
  await canvas(page).screenshot({ path: info.outputPath('ime-handle-focus.png') });
});
test('Korean composition in a checklist field survives controlled updates and draft save', async ({ page }) => {
  const server = await setup(page, 1);
  await page.getByText('완료 체크리스트', { exact: true }).click();
  const field = page.getByRole('textbox', { name: '체크 항목 1', exact: true });
  await field.fill('');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '가' });
  await page.keyboard.insertText('나다');
  await expect(field).toHaveValue('가나다');
  await expect.poll(() => server.get().payload.blocks.document.checklist[0].label).toBe('가나다');
});
test('delayed autosave response preserves a Korean syllable still being composed', async ({ page }) => {
  const server = await setup(page, 1);
  const release = server.pauseNextSave();
  const paragraph = canvas(page).locator('.ldc-movable-paragraph').first();
  await paragraph.click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '가' });
  await expect.poll(() => server.writes.some(row => row.action === 'save')).toBe(true);
  await cdp.send('Input.imeSetComposition', { text: 'ㄴ', selectionStart: 1, selectionEnd: 1 });
  const response = page.waitForResponse(r => r.url().includes('/api/admin/lesson-author') && r.request().method() === 'POST');
  release(); await response;
  await expect(paragraph).toContainText('가ㄴ');
  await cdp.send('Input.imeSetComposition', { text: '나', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '나' });
  await cdp.send('Input.imeSetComposition', { text: 'ㄷ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '다', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '다' });
  await expect(paragraph).toContainText('가나다');
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content).toContain('가나다');
  expect(server.writes.filter(row => row.action === 'publish')).toHaveLength(0);
});
test('each checklist row moves with its ID and required flag and survives reopening', async ({ page }, info) => {
  const server = await setup(page, 1);
  await page.getByText('완료 체크리스트', { exact: true }).click();
  await page.getByRole('button', { name: '체크 항목 3 위로', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '체크 항목 2', exact: true })).toHaveValue('세 번째 항목');
  await page.getByRole('button', { name: '체크 항목 1 아래로', exact: true }).click();
  await expect.poll(() => server.get().payload.blocks.document.checklist).toEqual([
    { id: 'check-c', label: '세 번째 항목', required: true },
    { id: 'check-a', label: '첫 항목', required: true },
    { id: 'check-b', label: '두 번째 항목', required: false },
  ]);
  await expect(page.getByRole('button', { name: '체크 항목 1 위로', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '체크 항목 3 아래로', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '편집 다시 열기', exact: true }).click();
  await page.getByText('완료 체크리스트', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: '체크 항목 1', exact: true })).toHaveValue('세 번째 항목');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: '체크 항목 1', exact: true }).locator('..').locator('..').screenshot({ path: info.outputPath('checklist-order.png') });
  expect(server.writes.filter(row => row.action === 'publish')).toHaveLength(0);
});
