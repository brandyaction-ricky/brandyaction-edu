import { test, expect, type Page } from '@playwright/test';
import { backend } from './helpers/lesson-author-backend';
import { serializeLessonDocument } from '../../lib/lesson-body';

const canvas = (page: Page) => page.getByRole('textbox', { name: '수업 문서', exact: true });
async function copySelection(page: Page) {
  return canvas(page).evaluate(el => {
    const data = new DataTransfer();
    el.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    return { html: data.getData('text/html'), text: data.getData('text/plain') };
  });
}
async function pasteSelection(page: Page, content: { html: string; text: string }) {
  await canvas(page).evaluate((el, content) => {
    const data = new DataTransfer(); data.setData('text/html', content.html); data.setData('text/plain', content.text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, content);
}
async function longLesson(page: Page, repeat = 50, loadTimeout = 5000) {
  const server = await backend(page);
  const content = serializeLessonDocument({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '복사할 짧은 한 줄', marks: [{ type: 'bold' }] }] },
    ...Array.from({ length: 120 }, (_, n) => ({ type: 'paragraph', content: [{ type: 'text', text: `가상 본문 ${n} ` + '한글 학습 내용을 보존합니다. '.repeat(repeat) }] })),
  ] });
  server.get().payload.blocks.document.blocks = [{ id: 'body', type: 'text', content }];
  const loadStarted = Date.now();
  await page.goto('/lesson-block-author-test?serverDraft=1'); await expect(canvas(page)).toBeVisible({ timeout: loadTimeout });
  console.info('internal fixture load:', JSON.stringify({ characters: content.length, elapsedMs: Date.now() - loadStarted }));
  return { server, content };
}
async function selectFirstLine(page: Page) {
  await canvas(page).locator('p').first().locator('.ldc-move-content').click();
  await canvas(page).locator('p').first().evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el.querySelector('.ldc-move-content') || el);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}
test('copying one line never embeds the remaining lesson body in clipboard context', async ({ page }, info) => {
  const { content } = await longLesson(page); await selectFirstLine(page);
  const copied = await copySelection(page);
  console.info('internal clipboard:', JSON.stringify({ lessonCharacters: content.length, copiedCharacters: copied.text.length, htmlCharacters: copied.html.length }));
  await info.attach('internal-copy-metrics.json', { body: JSON.stringify({ lessonCharacters: content.length, copiedCharacters: copied.text.length, htmlCharacters: copied.html.length }), contentType: 'application/json' });
  expect(copied.text).toBe('복사할 짧은 한 줄'); expect(copied.html).toContain('<strong>');
  expect(copied.html.includes('가상 본문 119')).toBe(false);
  expect(copied.html.length).toBeLessThan(10000);
});
test('repeated internal copy-delete-paste preserves text, formatting and server draft', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Long internal clipboard stress runs once on desktop.');
  test.setTimeout(180000);
  const { server, content } = await longLesson(page), errors: string[] = [], samples: unknown[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => errors.push('page crashed'));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const heapBefore = await cdp.send('Runtime.getHeapUsage');
  for (let n = 0; n < 100; n++) {
    await selectFirstLine(page); const copied = await copySelection(page);
    await page.keyboard.press('Backspace'); await pasteSelection(page, copied);
    if (n % 10 === 0) samples.push({ iteration: n, clipboardLength: copied.html.length, heap: await cdp.send('Runtime.getHeapUsage'), dom: await cdp.send('Memory.getDOMCounters') });
  }
  await expect(canvas(page).locator('p').first()).toContainText('복사할 짧은 한 줄');
  await expect(canvas(page).locator('p').first().locator('strong')).toHaveText('복사할 짧은 한 줄');
  await expect(canvas(page)).toContainText('가상 본문 119');
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content, { timeout: 15000 }).toBe(content);
  await info.attach('internal-copy-stress.json', { body: JSON.stringify(samples), contentType: 'application/json' });
  await cdp.send('HeapProfiler.collectGarbage');
  console.info('internal copy retained heap:', JSON.stringify({ before: heapBefore.usedSize, after: (await cdp.send('Runtime.getHeapUsage')).usedSize }));
  expect(errors).toEqual([]); expect(server.writes.filter(w => w.action === 'publish')).toHaveLength(0);
});

test('bulk internal cut-paste and undo preserve a long lesson while autosave is pending', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Bulk stress and held save run once on desktop.');
  test.setTimeout(180000);
  const { server } = await longLesson(page), errors: string[] = [];
  const published = structuredClone(server.get().public.payload);
  page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => errors.push('page crashed'));
  const resume = server.pauseNextSave();
  await page.getByLabel('제목 *', { exact: true }).fill('저장 중 내부 편집');
  await expect.poll(() => server.writes.filter(w => w.action === 'save').length).toBeGreaterThan(0);
  await canvas(page).locator('p').first().locator('.ldc-move-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  const copied = await copySelection(page);
  expect(copied.text).toContain('복사할 짧은 한 줄');
  expect(copied.text).toContain('가상 본문 119');
  expect(copied.html).toContain('<strong>');
  // No per-iteration waits: delete/paste transactions and history are exercised
  // in rapid succession, with the first server response deliberately held.
  for (let n = 0; n < 30; n++) {
    await page.keyboard.press('Backspace'); await pasteSelection(page, copied);
    await page.keyboard.press('ControlOrMeta+a');
  }
  await page.keyboard.press('ArrowRight');
  await page.keyboard.insertText(' 마지막 수정');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(canvas(page)).not.toContainText('마지막 수정');
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(canvas(page)).toContainText('마지막 수정');
  await expect(canvas(page).locator('strong').first()).toHaveText('복사할 짧은 한 줄');
  await expect(canvas(page)).toContainText('가상 본문 119');
  resume();
  await expect.poll(() => server.get().payload.blocks.document.blocks.map(b => b.content || '').join(''), { timeout: 15000 }).toContain('마지막 수정');
  expect(server.get().public.payload).toEqual(published);
  expect(server.writes.filter(w => w.action === 'publish')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('internal copying stays proportional to the selection in a million-character lesson', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Large document stress runs once on desktop.');
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', e => { errors.push(e.message); console.error('large fixture page error:', e.message); });
  page.on('crash', () => { errors.push('page crashed'); console.error('large fixture page crashed'); });
  // This intentionally exceeds a normal lesson's size. CI's shared two-worker
  // runner needs a load budget separate from the subsequent edit assertions.
  const { server, content } = await longLesson(page, 500, 30000);
  for (let n = 0; n < 20; n++) {
    await selectFirstLine(page); const copied = await copySelection(page);
    expect(copied.html.length).toBeLessThan(10000);
    await page.keyboard.press('Backspace'); await pasteSelection(page, copied);
  }
  await expect(canvas(page).locator('strong').first()).toHaveText('복사할 짧은 한 줄');
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content, { timeout: 15000 }).toBe(content);
  expect(errors).toEqual([]); expect(server.writes.filter(w => w.action === 'publish')).toHaveLength(0);
});

test('internal rich-text copy preserves toggle content, links and colors at another text block', async ({ page }) => {
  const server = await backend(page);
  const rich = { type: 'text', text: '선택한 안내', marks: [{ type: 'link', attrs: { href: 'https://example.com/guide' } }, { type: 'textStyle', attrs: { color: '#c51e2c' } }, { type: 'bold' }] };
  const content = serializeLessonDocument({ type: 'doc', content: [
    { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '자료 안내' }] }, { type: 'detailsContent', content: [{ type: 'paragraph', content: [rich] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '복사하지 않은 원문' }] },
  ] });
  const question = { id: 'old-question', type: 'question' as const, question: { label: '기존 질문', kind: 'text' as const, required: true } };
  server.get().payload.blocks.document.blocks = [{ id: 'source', type: 'text', content }, { id: 'target', type: 'text', content: '' }, question];
  await page.goto('/lesson-block-author-test?serverDraft=1'); await expect(canvas(page)).toBeVisible();
  const toggle = canvas(page).locator('[data-type="details"]');
  await toggle.locator(':scope > button').click();
  const selected = toggle.locator('[data-type="detailsContent"] p .ldc-move-content');
  await selected.click(); await selected.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  });
  const copied = await copySelection(page);
  expect(copied.text).toBe('선택한 안내'); expect(copied.html.includes('복사하지 않은 원문')).toBe(false);
  const target = canvas(page).locator('[data-author-block="target"]');
  await target.locator('p').click({ position: { x: 60, y: 10 } });
  await pasteSelection(page, copied);
  await expect(target.locator('strong')).toHaveText('선택한 안내');
  await expect(target.locator('a')).toHaveAttribute('href', 'https://example.com/guide');
  await expect(target.locator('span[style*="color"]')).toHaveCSS('color', 'rgb(197, 30, 44)');
  await expect.poll(() => server.get().payload.blocks.document.blocks.find(b => b.id === 'target')?.content).toContain('선택한 안내');
  expect(server.get().payload.blocks.document.blocks.find(b => b.id === 'source')?.content).toBe(content);
  expect(server.get().payload.blocks.document.blocks.find(b => b.id === question.id)).toEqual(question);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(target).not.toContainText('선택한 안내');
  expect(server.writes.filter(w => w.action === 'publish')).toHaveLength(0);
});

test('old internal clipboard data does not retain an unselected body after replacing the document', async ({ page }) => {
  const { content } = await longLesson(page); await selectFirstLine(page);
  const copied = await copySelection(page);
  copied.html = await page.evaluate(({ html, content }) => {
    const parsed = new DOMParser().parseFromString(html, 'text/html'), first = parsed.body.firstElementChild!;
    const value = first.getAttribute('data-pm-slice')!;
    first.setAttribute('data-pm-slice', value.slice(0, value.indexOf('[')) + JSON.stringify(['lessonText', { block: { id: 'body', type: 'text', content } }]));
    return parsed.body.innerHTML;
  }, { html: copied.html, content });
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace');
  await pasteSelection(page, copied);
  await expect(canvas(page).locator('strong')).toHaveText('복사할 짧은 한 줄');
  const caches = await canvas(page).evaluate(el => {
    const editor = (el as HTMLElement & { editor: { getJSON(): { content?: { attrs?: { block?: { content?: string } } }[] } } }).editor;
    return (editor.getJSON().content || []).map(node => node.attrs?.block?.content || '');
  });
  expect(caches.join('').includes('가상 본문 119')).toBe(false);
});
