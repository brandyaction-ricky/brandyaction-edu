import { detailedAuthor } from './helpers/detailed-author';
import { expect, test, type Page, type Locator } from '@playwright/test';

// Existing field-level regressions exercise the retained detailed settings.
test.beforeEach(async ({ page }) => detailedAuthor(page));
import { serializeLessonDocument } from '../../lib/lesson-body';
import type { LessonBlockDocument } from '../../lib/lesson-blocks';

const id = (n: number) => `eeeeeeea-1111-4111-8111-${String(n).padStart(12, '0')}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMwoAAAAASUVORK5CYII=', 'base64');
const text = (value: string) => ({ type: 'text', text: value });
function initial(): LessonBlockDocument {
  return { schemaVersion: 1, blocks: [
    { id: id(1), type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [text('시작 제목')] },
      { type: 'paragraph', content: [text('첫 문단')] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('목록 안 내용')] }] }] },
      { type: 'paragraph', content: [text('마지막 문단')] },
    ] }) },
    { id: id(2), type: 'image', assetId: id(3), alt: '원래 이미지' },
    { id: id(4), type: 'question', question: { label: '기존 질문', kind: 'text', required: false } },
  ], checklist: [] };
}
async function server(page: Page) {
  let document = initial(), revision = id(90), release: (() => void) | undefined, reject = false, pause = false;
  const uploads: unknown[] = [];
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (route.request().method() === 'GET') {
      if (new URL(route.request().url()).searchParams.get('action') === 'progression') { await route.fulfill({ json: { lessons: [{ lessonId: 'aaaaaaab-1111-4111-8111-000000000004', isUnlocked: true, track: null, dayNumber: null, automaticApproval: false, reason: '' }] } }); return; }
      await route.fulfill({ json: { document, revision, currentRevision: revision, editable: true, draft: null, previousDrafts: [] } }); return;
    }
    const body = route.request().postDataJSON(); document = body.document; revision = body.requestId;
    await route.fulfill({ json: { revision } });
  });
  await page.route('**/api/platform/lesson-media**', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ contentType: 'image/png', body: png }); return; }
    const body = route.request().postDataJSON(); uploads.push(body);
    if (body.action === 'prepare') { await route.fulfill({ json: { id: id(50), signedUrl: '/synthetic-image-upload', contentType: 'image/png' } }); return; }
    if (pause) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill(reject ? { status: 422, json: { error: '이미지 확인 실패' } } : { json: { id: id(50), ready: true } });
  });
  await page.route('**/synthetic-image-upload', route => route.fulfill({ json: {} }));
  return { getDocument: () => document, uploads, pause: () => { pause = true; }, finish: async (fail = false) => { reject = fail; await expect.poll(() => Boolean(release)).toBe(true); release!(); } };
}
async function fileDrop(page: Page, target: Locator, names = ['sample.png']) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const data = await page.evaluateHandle(({ names, bytes }) => {
    const transfer = new DataTransfer();
    names.forEach(name => transfer.items.add(new File([Uint8Array.from(bytes)], name, { type: 'image/png' })));
    return transfer;
  }, { names, bytes: [...png] });
  const point = { clientX: box.x + 20, clientY: box.y + box.height - 1, dataTransfer: data };
  await target.dispatchEvent('dragover', point);
  await expect(page.getByRole('status', { name: '이미지가 들어갈 위치' })).toBeVisible();
  const guide = (await page.locator('.lba-image-drop-guide').boundingBox())!;
  expect(Math.abs(guide.y + 2 - (box.y + box.height))).toBeLessThan(4);
  await target.dispatchEvent('drop', point);
  await data.dispose();
}
async function save(page: Page) {
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
}

test('drop reserves the paragraph position before upload; editing elsewhere cannot move it; save/reload/reader keep it', async ({ page }) => {
  const backend = await server(page); backend.pause();
  await page.goto('/lesson-block-author-test');
  const first = page.locator('[data-author-block]').first();
  await fileDrop(page, first.getByText('첫 문단', { exact: true }));
  await expect(page.locator('.lba-image-placeholder')).toBeVisible();
  await expect(page.getByRole('button', { name: '파일 업로드 중…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '항목 3 본문 편집', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '항목 3 본문', exact: true });
  await editor.getByText('마지막 문단', { exact: true }).evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    (element.closest('[contenteditable]') as HTMLElement).focus();
  });
  await page.keyboard.insertText(' 추가한 내용');
  await backend.finish();
  await expect(page.locator('.lba-image-placeholder')).toHaveCount(0);
  await expect(page.locator('[data-block-type="image"]')).toHaveCount(2);
  await save(page);
  const blocks = backend.getDocument().blocks;
  expect(blocks.map(block => block.type)).toEqual(['text', 'image', 'text', 'image', 'question']);
  expect(blocks[1].assetId).toBe(id(50)); expect(blocks[2].content).toContain('추가한 내용');
  expect(blocks[3].id).toBe(id(2)); expect(blocks[4].id).toBe(id(4));
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await expect(page.locator('[data-author-block]')).toHaveCount(5);
  await page.getByRole('button', { name: '학생 화면 보기' }).click();
  await expect(page.locator('.lesson-blocks img')).toHaveCount(2);
  await expect(page.getByText('마지막 문단 추가한 내용', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('failed drop removes only its placeholder, preserves concurrent edits and never saves an unfinished asset', async ({ page }) => {
  const backend = await server(page); backend.pause();
  await page.goto('/lesson-block-author-test');
  await fileDrop(page, page.getByText('첫 문단', { exact: true }));
  await page.getByRole('textbox', { name: '질문 문구' }).fill('업로드 중 고친 질문');
  await backend.finish(true);
  await expect(page.getByText(/이미지를 올리지 못했습니다.*작성한 글/)).toBeVisible();
  await expect(page.locator('[data-block-type="image"]')).toHaveCount(1);
  await save(page);
  expect(backend.getDocument().blocks.find(block => block.id === id(4))?.question?.label).toBe('업로드 중 고친 질문');
  expect(backend.getDocument().blocks.filter(block => block.type === 'image').map(block => block.assetId)).toEqual([id(3)]);
});

test('unsupported/multiple files leave content intact; keyboard arrows still move images', async ({ page }) => {
  const backend = await server(page); await page.goto('/lesson-block-author-test');
  const paragraph = page.getByText('첫 문단', { exact: true });
  await fileDrop(page, paragraph, ['sample.svg']);
  await expect(page.getByText(/이미지는 JPG·PNG/)).toBeVisible();
  await fileDrop(page, paragraph, ['a.png', 'b.png']);
  await expect(page.getByText('이미지는 한 번에 한 장씩 넣어 주세요.', { exact: true })).toBeVisible();
  expect(backend.uploads).toHaveLength(0);
  await page.getByRole('button', { name: '항목 2 위로', exact: true }).focus(); await page.keyboard.press('Enter');
  await save(page); expect(backend.getDocument().blocks[0].id).toBe(id(2));
});

test('pasting inside a rich paragraph inserts the private image after that paragraph', async ({ page }) => {
  const backend = await server(page); await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '항목 1 본문 편집', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '항목 1 본문', exact: true });
  await editor.getByText('첫 문단', { exact: true }).click();
  await editor.evaluate((element, bytes) => {
    const clipboard = new DataTransfer(); clipboard.items.add(new File([Uint8Array.from(bytes)], 'pasted.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  }, [...png]);
  await expect(page.getByText('선택한 위치에 이미지를 넣었습니다. 아래 저장 버튼을 눌러 보관해 주세요.', { exact: true })).toBeVisible();
  await save(page); expect(backend.getDocument().blocks[1].assetId).toBe(id(50));
  expect(backend.getDocument().blocks[0].content).toContain('첫 문단');
  expect(backend.getDocument().blocks[2].content).toContain('목록 안 내용');
});

test('real pointer drag of an existing image snaps outside a list without uploading or duplicating it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Desktop native drag; touch devices use the separately tested move buttons.');
  const backend = await server(page); await page.goto('/lesson-block-author-test');
  const handle = page.getByRole('button', { name: '항목 2 이미지 이동 손잡이', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const from = (await handle.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + 20); await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 10, { steps: 5 });
  const list = page.locator('[data-author-block]').first().locator('ul');
  await list.scrollIntoViewIfNeeded();
  const to = (await list.boundingBox())!;
  await page.mouse.move(to.x + 30, to.y + to.height - 1, { steps: 12 });
  await page.mouse.move(to.x + 31, to.y + to.height - 1);
  await expect(page.locator('.lba-image-drop-guide')).toBeVisible();
  await page.screenshot({ path: info.outputPath('image-drag-guide.png') });
  await page.mouse.up();
  await expect(page.locator('[data-author-block]')).toHaveCount(4);
  await save(page);
  const blocks = backend.getDocument().blocks;
  expect(blocks.map(block => block.type)).toEqual(['text', 'image', 'text', 'question']);
  expect(blocks[0].content).toContain('bulletList'); expect(blocks[2].content).toContain('마지막 문단');
  expect(blocks[1]).toEqual(initial().blocks[1]); expect(backend.uploads).toHaveLength(0);
  await page.getByRole('button', { name: '학생 화면 보기' }).click();
  await expect(page.locator('.lesson-blocks img')).toHaveCount(1);
  await expect(page.locator('.lesson-blocks li img, .lesson-blocks h2 img')).toHaveCount(0);
});
