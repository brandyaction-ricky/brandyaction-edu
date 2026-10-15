import { test, expect, type Page } from '@playwright/test';
import { backend } from './helpers/lesson-author-backend';
import { serializeLessonDocument } from '../../lib/lesson-body';

const canvas = (page: Page) => page.getByRole('textbox', { name: '수업 문서', exact: true });
async function paste(page: Page, html: string) {
  const data = await page.evaluateHandle(html => { const d = new DataTransfer(); d.setData('text/html', html); return d; }, html);
  await canvas(page).evaluate((el, clipboardData) => el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })), data);
  await data.dispose();
}
test('Enter on a closed toggle title opens its content and keeps new text inside', async ({ page }, info) => {
  const server = await backend(page);
  server.get().payload.blocks.document.blocks = [{ id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '접어 둔 제목' }] }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] },
  ] }) }];
  await page.goto('/lesson-block-author-test?serverDraft=1');
  const doc = canvas(page), toggle = doc.locator('[data-type="details"]');
  await expect(toggle).not.toHaveClass(/is-open/);
  await toggle.locator('summary').click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.keyboard.type('토글 내부 첫 줄');
  await expect(toggle).toHaveClass(/is-open/);
  await expect(toggle.locator('[data-type="detailsContent"]')).toContainText('토글 내부 첫 줄');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.type('토글 내부 다음 줄');
  await expect(toggle.locator('[data-type="detailsContent"]')).toContainText('토글 내부 다음 줄');
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content).toContain('토글 내부 다음 줄');
  await page.keyboard.press('ControlOrMeta+Enter'); await page.keyboard.type('토글 바깥 새 문단');
  await expect(doc).toContainText('토글 바깥 새 문단');
  await expect(toggle).not.toContainText('토글 바깥 새 문단');
  await expect.poll(() => server.get().payload.blocks.document.blocks[0].content).toContain('토글 바깥 새 문단');
  await doc.screenshot({ path: info.outputPath('toggle-review.png') });
});
test('empty paragraphs with and without move handles have no repeated placeholder', async ({ page }) => {
  const server = await backend(page);
  server.get().payload.blocks.document.blocks = [{ id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: '본문' }] },
    { type: 'paragraph' }, { type: 'blockquote', content: [{ type: 'paragraph' }] },
  ] }) }];
  await page.goto('/lesson-block-author-test?serverDraft=1'); await expect(canvas(page)).toBeVisible();
  const placeholders = await canvas(page).evaluate(el => [...el.querySelectorAll('p')].map(p => getComputedStyle(p, '::before').content));
  expect(placeholders.join('')).not.toContain('학습할 내용을 작성해 주세요.');
});
test('grouped images autosave, reopen and retain their assets without publishing', async ({ page }) => {
  const server = await backend(page);
  server.get().payload.blocks.document.blocks.push(...[1, 2].map(n => ({ id: `image-${n}`, type: 'image' as const, url: `https://example.test/image-${n}.png`, alt: `예시 ${n}` })));
  await page.route('https://example.test/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"/>' }));
  await page.goto('/lesson-block-author-test?serverDraft=1');
  await canvas(page).locator('[data-author-block="image-1"]').getByRole('button', { name: '이미지 설정', exact: true }).click();
  await page.getByRole('complementary', { name: '선택 항목 설정' }).getByRole('button', { name: '다음 이미지와 나란히' }).click();
  await expect(page.locator('.editor-savebar')).toContainText('자동저장 완료');
  const saved = structuredClone(server.get().payload.blocks.document.blocks);
  expect(saved[1].imageGroup).toBeTruthy(); expect(saved[2].imageGroup).toBe(saved[1].imageGroup);
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await expect(canvas(page).locator('[data-author-block="image-1"] img')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(server.get().payload.blocks.document.blocks).toEqual(saved);
  expect(server.writes.filter(x => x.action === 'publish')).toHaveLength(0);
});
test('rapidly replacing a long document stays responsive and saves its last text', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Long document stress runs once on desktop.');
  test.setTimeout(120000);
  const server = await backend(page), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => errors.push('page crashed'));
  await page.goto('/lesson-block-author-test?serverDraft=1'); await expect(canvas(page)).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const timings: number[] = [];
  const html = Array.from({ length: 1000 }, (_, n) => `<p>가상 학습 문단 ${n} 반복 편집 검수</p>`).join('');
  for (let i = 0; i < 20; i++) {
    await canvas(page).locator('p').first().click(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace');
    const began = Date.now(); await paste(page, html + `<p>마지막 편집 ${i}</p>`); timings.push(Date.now() - began);
  }
  await expect(canvas(page)).toContainText('마지막 편집 19');
  await expect.poll(() => server.get().payload.blocks.document.blocks.map(b => b.content).join(''), { timeout: 15000 }).toContain('마지막 편집 19');
  await cdp.send('HeapProfiler.collectGarbage');
  await info.attach('stress-metrics.json', { body: JSON.stringify({ pasteMilliseconds: timings, heap: await cdp.send('Runtime.getHeapUsage'), dom: await cdp.send('Memory.getDOMCounters') }), contentType: 'application/json' });
  expect(errors).toEqual([]);
  expect(server.writes.filter(x => x.action === 'publish')).toHaveLength(0);
});
