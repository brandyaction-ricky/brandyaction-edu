import { test, expect, type Page } from '@playwright/test';
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
  const paragraph = canvas(page).locator('p.ldc-movable-paragraph').first();
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
test('Tab on the last paragraph never jumps to the first move handle', async ({ page }) => {
  await setup(page, 80);
  const last = canvas(page).locator('p.ldc-movable-paragraph').last();
  await last.click(); await page.keyboard.press('End');
  const before = await page.evaluate(() => scrollY);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(before - 100);
  await expect(page.getByText('완료 체크리스트', { exact: true })).toBeFocused();
});
test('Tab moves to the next visible checklist input without changing the body', async ({ page }) => {
  const server = await setup(page, 4);
  const original = server.get().payload.blocks.document.blocks[0].content;
  await page.getByText('완료 체크리스트', { exact: true }).click();
  await canvas(page).locator('p.ldc-movable-paragraph').nth(2).click();
  await page.keyboard.press('Tab');
  await expect(page.getByText('완료 체크리스트', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '체크 항목 1 아래로', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: '체크 항목 1', exact: true })).toBeFocused();
  expect(server.get().payload.blocks.document.blocks[0].content).toBe(original);
});
test('Korean IME starts safely at the boundary beside a move handle', async ({ page }) => {
  await setup(page, 2);
  const cdp = await page.context().newCDPSession(page);
  const paragraph = canvas(page).locator('p.ldc-movable-paragraph').first();
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
test('Korean typing after selecting a blank paragraph handle keeps its first consonant', async ({ page }) => {
  const server = await setup(page, 2);
  const cdp = await page.context().newCDPSession(page);
  await canvas(page).getByRole('button', { name: '문단 이동', exact: true }).first().click();
  await cdp.send('Input.imeSetComposition', { text: 'ㄱ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '가' });
  await page.keyboard.insertText('나다');
  await expect(canvas(page)).toContainText('가나다');
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content).toContain('가나다');
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
