import { expect, test } from '@playwright/test';

for (const kind of ['prompt', 'prompt-generator']) {
  test(`${kind}: long text scrolls inside the frame and copies in full`, async ({ page, context }, testInfo) => {
    const text = Array.from({ length: 100 }, (_, i) => `${i + 1}. 학습용 예시 프롬프트입니다. 내용을 읽고 내 상황에 맞게 적용하세요.`).join('\n');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.route('**/api/platform/lesson-blocks**', route => route.fulfill({ json: {
      editable: false, currentRevision: '44444444-4444-4444-8444-444444444444', revision: '44444444-4444-4444-8444-444444444444',
      document: { schemaVersion: 1, blocks: [
        { id: 'long', type: kind, content: text, fields: [] },
        { id: 'short', type: 'prompt', content: '짧은 프롬프트' },
      ], checklist: [] }, draft: null, previousDrafts: [],
    } }));
    await page.goto('/lesson-blocks-test');
    const frame = page.getByRole('region', { name: '프롬프트 내용', exact: true }).first();
    const copy = page.getByRole('button', { name: '프롬프트 복사', exact: true }).first();
    await expect(frame).toHaveText(text);
    const geometry = await frame.evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight, viewport: innerHeight }));
    expect(geometry.height).toBeLessThanOrEqual(geometry.viewport / 2 + 1);
    expect(geometry.content).toBeGreaterThan(geometry.height);
    await copy.scrollIntoViewIfNeeded();
    await expect(copy).toBeInViewport();
    expect(await frame.evaluate(el => el.scrollTop)).toBe(0);
    await copy.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    await frame.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => frame.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const short = page.getByRole('region', { name: '프롬프트 내용', exact: true }).last();
    expect(await short.evaluate(el => el.scrollHeight === el.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('prompt-scroll.png'), fullPage: true });
    await page.emulateMedia({ media: 'print' });
    expect(await frame.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  });
}
