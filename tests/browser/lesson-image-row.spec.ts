import { test, expect, type Page, type Locator } from '@playwright/test';
import type { LessonBlockDocument } from '../../lib/lesson-blocks';
const initial: LessonBlockDocument = { schemaVersion: 1, blocks: [
  { id: 'title', type: 'text', content: '이미지 안내를 순서대로 확인해 주세요.' },
  ...[1, 2, 3, 4].map(n => ({ id: `image-${n}`, type: 'image' as const, assetId: `aaaaaaaa-1111-4111-8111-11111111111${n}`, alt: `단계 ${n}`, content: `${n}단계 설명` })),
  { id: 'question', type: 'question', question: { label: '이해한 내용을 적어 주세요.', kind: 'text', required: true } },
], checklist: [] };
async function setup(page: Page) {
  let document = structuredClone(initial), revision = 'aaaaaaaa-1111-4111-8111-111111111111';
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); document = body.document; revision = body.requestId; }
    await route.fulfill({ json: { document, revision, editable: true } });
  });
  await page.route('**/api/platform/lesson-media?**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1100"><rect width="700" height="1100" fill="#e6f1ee"/><text x="50" y="150" font-size="48">STEP</text><rect x="50" y="250" width="600" height="200" rx="24" fill="white"/></svg>' }));
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
