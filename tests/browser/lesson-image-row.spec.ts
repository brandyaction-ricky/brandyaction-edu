import { test, expect, type Page, type Locator } from '@playwright/test';
import type { LessonBlockDocument } from '../../lib/lesson-blocks';
const initial: LessonBlockDocument = { schemaVersion: 1, blocks: [
  { id: 'title', type: 'text', content: '이미지 안내를 순서대로 확인해 주세요.' },
  ...[1, 2, 3, 4].map(n => ({ id: `image-${n}`, type: 'image' as const, assetId: `aaaaaaaa-1111-4111-8111-11111111111${n}`, alt: `단계 ${n}`, content: `${n}단계 설명` })),
  { id: 'question', type: 'question', question: { label: '이해한 내용을 적어 주세요.', kind: 'text', required: true } },
], checklist: [] };
async function setup(page: Page, compact = false) {
  let document = structuredClone(initial), revision = 'aaaaaaaa-1111-4111-8111-111111111111';
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); document = body.document; revision = body.requestId; }
    await route.fulfill({ json: { document, revision, editable: true } });
  });
  await page.route('**/api/platform/lesson-media?**', route => route.fulfill({ contentType: 'image/svg+xml', body: (compact ? '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="120"><rect width="700" height="120" fill="#e6f1ee"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1100"><rect width="700" height="1100" fill="#e6f1ee"/><text x="50" y="150" font-size="48">STEP</text><rect x="50" y="250" width="600" height="200" rx="24" fill="white"/></svg>') }));
  await page.goto('/lesson-block-author-test');
  await expect(page.getByRole('textbox', { name: '수업 문서', exact: true })).toBeVisible();
  return () => document;
}
async function sameRow(left: Locator, right: Locator) {
  await expect.poll(async () => { const a = await left.boundingBox(), b = await right.boundingBox(); return Boolean(a && b && Math.abs(a.y - b.y) < 3 && b.x >= a.x + a.width); }).toBe(true);
}
async function save(page: Page) { await page.getByRole('button', { name: '학습 저장', exact: true }).click(); await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible(); }

test('group two or three images, save and reopen, enlarge privately and split without losing content', async ({ page }, testInfo) => {
  const saved = await setup(page), canvas = page.getByRole('textbox', { name: '수업 문서', exact: true });
  await canvas.locator('[data-author-block="image-1"]').getByRole('button', { name: '이미지 설정', exact: true }).click();
  const settings = page.getByRole('complementary', { name: '선택 항목 설정' });
  await settings.getByRole('button', { name: '다음 이미지와 나란히' }).click();
  await sameRow(canvas.locator('[data-author-block="image-1"]'), canvas.locator('[data-author-block="image-2"]'));
  await settings.getByRole('button', { name: '다음 이미지와 나란히' }).click();
  await sameRow(canvas.locator('[data-author-block="image-1"]'), canvas.locator('[data-author-block="image-3"]'));
  await expect(settings.getByRole('button', { name: '다음 이미지와 나란히' })).toBeDisabled();
  await save(page); const grouped = structuredClone(saved());
  expect(grouped.blocks.slice(1, 4).every(block => block.imageGroup === grouped.blocks[1].imageGroup)).toBe(true);
  expect(grouped.blocks[4].imageGroup).toBeUndefined(); expect(grouped.blocks.map(b => b.id)).toEqual(initial.blocks.map(b => b.id));
  await page.getByRole('button', { name: '편집 다시 열기', exact: true }).click();
  await sameRow(canvas.locator('[data-author-block="image-1"]'), canvas.locator('[data-author-block="image-3"]'));
  await page.getByRole('button', { name: '구성 미리보기', exact: true }).click();
  const preview = page.getByLabel('구성 미리보기');
  await sameRow(preview.locator('[data-lesson-block="image-1"]'), preview.locator('[data-lesson-block="image-3"]'));
  await preview.screenshot({ path: testInfo.outputPath('image-row-preview.png') });
  const trigger = preview.getByRole('button', { name: '단계 2 크게 보기', exact: true });
  await trigger.click(); const dialog = page.getByRole('dialog', { name: '이미지 크게 보기' }); await expect(dialog).toBeVisible();
  expect(await dialog.locator('img').getAttribute('src')).toContain('aaaaaaaa-1111-4111-8111-111111111112');
  await dialog.getByRole('button', { name: '원본 크기로 보기' }).click();
  await expect(dialog.getByRole('button', { name: '화면에 맞추기' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '편집 화면으로', exact: true }).click();
  await canvas.locator('[data-author-block="image-2"]').getByRole('button', { name: '이미지 설정', exact: true }).click();
  await settings.getByRole('button', { name: '이미지 묶음 풀기' }).click(); await save(page);
  expect(saved()).toEqual(initial);
});

test('moving images within a row preserves grouping and non-image content', async ({ page }) => {
  const saved = await setup(page), canvas = page.getByRole('textbox', { name: '수업 문서', exact: true });
  await canvas.locator('[data-author-block="image-1"]').getByRole('button', { name: '이미지 설정', exact: true }).click();
  const settings = page.getByRole('complementary', { name: '선택 항목 설정' });
  await settings.getByRole('button', { name: '다음 이미지와 나란히' }).click();
  await settings.getByRole('button', { name: '항목 2 아래로', exact: true }).click(); await save(page);
  expect(saved().blocks.slice(1, 3).map(b => b.id)).toEqual(['image-2', 'image-1']);
  expect(saved().blocks[1].imageGroup).toEqual(saved().blocks[2].imageGroup);
  expect(saved().blocks.at(-1)).toEqual(initial.blocks.at(-1));
});


test('native image drag groups, reorders, limits three, splits and survives save/undo', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Native HTML drag uses a mouse; touch retains image settings.');
  const saved = await setup(page, true), canvas = page.getByRole('textbox', { name: '수업 문서', exact: true });
  const block = (n: number) => canvas.locator(`[data-author-block="image-${n}"]`);
  async function drag(from: number, to: number, side: 'left' | 'right' | 'above' | 'below', handle = false, cancel = false) {
    const target = block(to), source = handle ? block(from).locator('[data-drag-handle]') : block(from).locator('img');
    // A redo can leave the source underneath the sticky editor/save bars.
    // Center it, then let Playwright verify pointer hit-testing and stability.
    await source.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await source.hover();
    const sourceRect = await source.boundingBox(); expect(sourceRect).not.toBeNull();
    await page.mouse.move(sourceRect!.x + sourceRect!.width / 2, sourceRect!.y + sourceRect!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceRect!.x + sourceRect!.width / 2 + 15, sourceRect!.y + sourceRect!.height / 2 + 10, { steps: 5 });
    await target.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const rect = await target.boundingBox(); expect(rect).not.toBeNull();
    const x = rect!.x + (side === 'left' ? 6 : side === 'right' ? rect!.width - 6 : rect!.width / 2);
    const y = rect!.y + (side === 'above' ? 6 : side === 'below' ? rect!.height - 6 : rect!.height / 2);
    await page.mouse.move(x, y, { steps: 10 }); await page.mouse.move(x, y);
    await expect(page.locator(`[data-image-drop="${side}"]`)).toBeVisible();
    if (from === 4) {
      await expect(page.getByText('최대 3장 · 위나 아래에 놓아 주세요', { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('three-image-limit.png') });
    } else if (from === 2) await page.screenshot({ path: testInfo.outputPath('image-drop-guide.png') });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('[data-image-drop]')).toHaveCount(0);
  }
  await drag(2, 1, 'right', false, true);
  await save(page); expect(saved()).toEqual(initial);
  await drag(2, 1, 'right'); await sameRow(block(1), block(2));
  await canvas.locator('[data-block-type="text"] p').click();
  await page.keyboard.press('End'); await page.keyboard.insertText(' 추가');
  await page.keyboard.press('ControlOrMeta+z'); await sameRow(block(1), block(2));
  await expect(canvas.locator('[data-block-type="text"]')).not.toContainText('추가');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(block(1).locator('..')).not.toHaveAttribute('data-image-columns');
  await page.keyboard.press('ControlOrMeta+Shift+z'); await sameRow(block(1), block(2));
  await drag(3, 2, 'right'); await sameRow(block(1), block(3));
  await save(page);
  const triple = structuredClone(saved());
  expect(triple.blocks.slice(1,4).every(b => b.imageGroup === triple.blocks[1].imageGroup)).toBe(true);
  await drag(4, 3, 'right');
  await save(page); expect(saved()).toEqual(triple);
  await drag(3, 1, 'left', true);
  await save(page); expect(saved().blocks.slice(1,4).map(b=>b.id)).toEqual(['image-3','image-1','image-2']);
  await drag(1, 2, 'below');
  await expect(block(1).locator('..')).not.toHaveAttribute('data-image-columns');
  await canvas.click({ position: { x: 10, y: 10 } }); await page.keyboard.press('ControlOrMeta+z');
  await sameRow(block(3), block(2));
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(block(1).locator('..')).not.toHaveAttribute('data-image-columns');
  await save(page);
  expect(saved().blocks.find(b=>b.id==='image-1')?.imageGroup).toBeUndefined();
  expect(saved().blocks.map(block=>{ const copy = {...block}; delete copy.imageGroup; return copy; }).sort((a,b)=>a.id.localeCompare(b.id))).toEqual(initial.blocks.toSorted((a,b)=>a.id.localeCompare(b.id)));
  await page.getByRole('button', { name: '편집 다시 열기', exact: true }).click();
  await sameRow(block(3), block(2)); await expect(block(1).locator('..')).not.toHaveAttribute('data-image-columns');
  await canvas.screenshot({ path: testInfo.outputPath('dragged-image-layout.png') });
});
