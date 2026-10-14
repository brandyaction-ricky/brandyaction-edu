import { test, expect, type Page } from '@playwright/test';
import { serializeLessonDocument, parseLessonDocument } from '../../lib/lesson-body';
import type { LessonBlockDocument } from '../../lib/lesson-blocks';

const seed: LessonBlockDocument = { schemaVersion: 1, blocks: [
  { id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '지침과 CLAUDE.md' }] }, { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: '프로젝트 지침 안내' }] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '토글 뒤의 본문' }] },
  ] }) },
  { id: 'image', type: 'image', assetId: 'aaaaaaaa-1111-4111-8111-111111111111', alt: '프로젝트 지침 화면', content: '지침 설정 예시' },
  { id: 'question', type: 'question', question: { label: '기존 확인 질문', kind: 'text', required: true } },
], checklist: [] };
async function setup(page: Page, initial = seed) {
  let document = structuredClone(initial), revision = 'aaaaaaaa-1111-4111-8111-111111111112';
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (new URL(route.request().url()).searchParams.get('action') === 'progression') { await route.fulfill({ json: { lessons: [{ lessonId: 'aaaaaaab-1111-4111-8111-000000000004', isUnlocked: true, track: null, dayNumber: null, automaticApproval: false, reason: '' }] } }); return; }
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); document = body.document; revision = body.requestId; }
    await route.fulfill({ json: { document, revision, currentRevision: revision, editable: true, draft: null, previousDrafts: [] } });
  });
  await page.route('**/api/platform/lesson-media?**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="120"><rect width="700" height="120" fill="#e6f1ee"/><text x="20" y="65" font-size="28">PROJECT INSTRUCTIONS</text></svg>' }));
  await page.goto('/lesson-block-author-test');
  const canvas = page.getByRole('textbox', { name: '수업 문서', exact: true }); await expect(canvas).toBeVisible();
  if (page.viewportSize()!.width >= 800) {
    const controls = page.getByRole('group', { name: '본문 서식' });
    expect(await controls.evaluate(element => {
      const select = element.querySelector('select')!; const style = getComputedStyle(select);
      return { display: getComputedStyle(element).display, width: select.getBoundingClientRect().width, basis: style.flexBasis, min: style.minWidth };
    })).toMatchObject({ display: 'flex', width: expect.any(Number) });
    expect((await controls.getByRole('combobox', { name: '문단 스타일' }).boundingBox())!.width).toBeLessThan(220);
  }
  return { canvas, saved: () => document };
}
async function save(page: Page) { await page.getByRole('button', { name: '학습 저장', exact: true }).click(); await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible(); }
async function moveWithSettings(page: Page) {
  await page.locator('.ldc-document [data-author-block="image"]').getByRole('button', { name: '이미지 설정', exact: true }).click();
  await page.getByRole('combobox', { name: '토글 안으로 이동', exact: true }).selectOption('1');
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
}

test('first nested image caption edit keeps the settings input and viewport in place', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const long = structuredClone(seed);
  long.blocks[0].content = serializeLessonDocument({ type: 'doc', content: [
    { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '새 이미지 토글' }] }, { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: '프로젝트 지침 안내' }] }, { type: 'lessonImage', attrs: { blockId: 'image' } }] }] },
    ...Array.from({ length: 80 }, (_, index) => ({ type: 'paragraph', content: [{ type: 'text', text: `하단 본문 ${index + 1}` }] })),
  ] });
  long.blocks[1].content = '';
  const { canvas, saved } = await setup(page, long);
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await canvas.locator('[data-type="detailsContent"] [data-author-block="image"]').getByRole('button', { name: '이미지 설정', exact: true }).click();
  const settings = page.getByRole('complementary', { name: '선택 항목 설정' });
  const caption = settings.getByRole('textbox', { name: '설명', exact: true });
  await caption.click();
  const image = canvas.locator('[data-type="detailsContent"] [data-author-block="image"]').first();
  await expect(image).toHaveClass(/is-selected/);
  const before = await caption.evaluate(element => ({ y: scrollY, top: element.getBoundingClientRect().top }));
  await caption.pressSequentially(' 첫 설명');
  await expect(image).toHaveClass(/is-selected/);
  await expect(caption).toBeFocused();
  await expect(caption).toBeInViewport();
  const after = await caption.evaluate(element => ({ y: scrollY, top: element.getBoundingClientRect().top }));
  expect(Math.abs(after.y - before.y)).toBeLessThan(80);
  expect(Math.abs(after.top - before.top)).toBeLessThan(80);
  await settings.getByRole('textbox', { name: '이미지 대체 설명', exact: true }).fill('새 대체 설명');
  await expect(image).toHaveClass(/is-selected/);
  await expect(canvas.locator('[data-type="details"]')).toHaveClass(/is-open/);
  await expect(image).toBeVisible();
  await expect(image.locator('img')).toBeVisible();
  await page.screenshot({ path: info.outputPath('toggle-caption-stable.png') });
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await save(page);
  expect(saved().blocks.find(block => block.id === 'image')!.content).toBe(' 첫 설명');
  expect(saved().blocks.find(block => block.id === 'question')).toEqual(seed.blocks[2]);
  expect(saved().blocks.find(block => block.id === 'image')!.alt).toBe('새 대체 설명');
  expect(saved().blocks[0]).toEqual(long.blocks[0]);
  expect(errors).toEqual([]);
});

test('settings move preserves private image, caption and questions after save/reopen; reader hides and enlarges the image with its toggle', async ({ page }, info) => {
  const { canvas, saved } = await setup(page); await moveWithSettings(page); await save(page);
  expect(saved().blocks[1]).toEqual(seed.blocks[1]); expect(saved().blocks[2]).toEqual(seed.blocks[2]);
  expect(parseLessonDocument(saved().blocks[0].content!)!.content![0].content![1].content!.at(-1)).toEqual({ type: 'lessonImage', attrs: { blockId: 'image' } });
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await expect(canvas.locator('[data-type="detailsContent"] [data-author-block="image"] img')).toBeVisible();
  await canvas.locator('[data-type="details"]').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: info.outputPath('toggle-image-editor.png') });
  await page.getByRole('button', { name: '학생 화면 보기' }).click();
  const reader = page.locator('.lesson-blocks').first(), image = reader.locator('[data-lesson-block="image"]');
  await expect(reader.locator('[data-lesson-block="image"]')).toHaveCount(1); await expect(image).toBeHidden();
  await reader.getByText('지침과 CLAUDE.md', { exact: true }).click();
  await expect(image).toBeVisible(); await expect(image).toContainText('지침 설정 예시');
  expect(await image.locator('img').getAttribute('src')).toContain('lesson=');
  await image.getByRole('button', { name: '프로젝트 지침 화면 크게 보기' }).click();
  await expect(page.getByRole('dialog', { name: '이미지 크게 보기' })).toBeVisible(); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await reader.getByText('지침과 CLAUDE.md', { exact: true }).focus();
  await reader.screenshot({ path: info.outputPath('toggle-image-reader.png') });
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await canvas.locator('[data-author-block="image"]').getByRole('button', { name: '이미지 설정', exact: true }).click();
  await page.getByRole('button', { name: '토글 밖으로 꺼내기' }).click(); await save(page);
  expect(saved()).toEqual(seed);
});

test('native drag in and out of a toggle supports undo/redo without losing any activity', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Touch users use the settings selector.');
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'Linux x86_64' }));
  const { canvas, saved } = await setup(page);
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  const source = canvas.locator('[data-author-block="image"] [data-drag-handle]');
  await source.dragTo(canvas.getByText('프로젝트 지침 안내', { exact: true }));
  await expect(canvas.locator('[data-type="detailsContent"] [data-author-block="image"]')).toHaveCount(1);
  await canvas.getByText('토글 뒤의 본문', { exact: true }).click(); await page.keyboard.press('Control+z');
  await expect(canvas.locator('[data-type="detailsContent"] [data-author-block="image"]')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(canvas.locator('[data-type="detailsContent"] [data-author-block="image"]')).toHaveCount(1);
  await save(page); expect(saved().blocks[1]).toEqual(seed.blocks[1]);
  await canvas.locator('[data-author-block="image"] [data-drag-handle]').dragTo(canvas.locator('[data-author-block="question"]'), { targetPosition: { x: 40, y: 4 } });
  await save(page); expect(saved()).toEqual(seed);
});

test('image insertion inside a toggle keeps the location and duplication gives each image a distinct identity', async ({ page }) => {
  const { canvas, saved } = await setup(page);
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await canvas.getByText('프로젝트 지침 안내', { exact: true }).click();
  await page.getByRole('button', { name: '+ 현재 위치에 추가', exact: true }).click();
  await page.getByRole('group', { name: '문서에 넣을 항목' }).getByRole('button', { name: '이미지', exact: true }).click();
  await page.getByRole('complementary', { name: '선택 항목 설정' }).getByRole('textbox', { name: /^주소/ }).fill('https://example.test/new.png');
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click(); await save(page);
  const inserted = saved().blocks.find(block => block.type === 'image' && block.id !== 'image')!; expect(inserted.url).toBe('https://example.test/new.png');
  expect(parseLessonDocument(saved().blocks[0].content!)!.content![0].content![1].content!.some(node => node.attrs?.blockId === inserted.id)).toBe(true);
  await canvas.getByText('프로젝트 지침 안내', { exact: true }).click(); await page.getByRole('button', { name: '항목 복제', exact: true }).click(); await save(page);
  expect(new Set(saved().blocks.map(block => block.id)).size).toBe(saved().blocks.length);
  expect(saved().blocks.filter(block => block.url === inserted.url)).toHaveLength(2);
});

for (const fail of [false, true]) test(`pasted private image stays inside its toggle; failed upload removes only its reference (${fail ? 'failure' : 'success'})`, async ({ page }) => {
  const { canvas, saved } = await setup(page);
  const asset = 'aaaaaaaa-1111-4111-8111-111111111113';
  await page.route('**/api/platform/lesson-media', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill(body.action === 'prepare' ? { json: { id: asset, signedUrl: '/synthetic-toggle-upload', contentType: 'image/png' } } : fail ? { status: 422, json: { error: '시험 업로드 실패' } } : { json: { id: asset, ready: true } });
  });
  await page.route('**/synthetic-toggle-upload', route => route.fulfill({ json: {} }));
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  const paragraph = canvas.getByText('프로젝트 지침 안내', { exact: true });
  await paragraph.click();
  await page.keyboard.press('End');
  await expect.poll(() => paragraph.evaluate(element => element.closest('[data-type="detailsContent"]')?.contains(window.getSelection()?.anchorNode || null))).toBe(true);
  const bytes = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMwoAAAAASUVORK5CYII=', 'base64')];
  await canvas.evaluate((element, bytes) => { const clipboard = new DataTransfer(); clipboard.items.add(new File([Uint8Array.from(bytes)], 'pasted.png', { type: 'image/png' })); element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true })); }, bytes);
  await expect(page.getByText(fail ? /이미지를 올리지 못했습니다.*작성한 글/ : '선택한 위치에 이미지를 넣었습니다. 아래 저장 버튼을 눌러 보관해 주세요.', { exact: !fail })).toBeVisible();
  await save(page);
  if (fail) expect(saved()).toEqual(seed);
  else {
    const uploaded = saved().blocks.find(block => block.assetId === asset)!;
    expect(parseLessonDocument(saved().blocks[0].content!)!.content![0].content![1].content!.some(node => node.attrs?.blockId === uploaded.id)).toBe(true);
    expect(saved().blocks.filter(block => ['image', 'question'].includes(block.id))).toEqual(seed.blocks.slice(1));
  }
});
