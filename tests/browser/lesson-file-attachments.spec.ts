import fs from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { serializeLessonDocument, parseLessonDocument } from '../../lib/lesson-body';
import type { LessonBlockDocument } from '../../lib/lesson-blocks';
const seed: LessonBlockDocument = { schemaVersion: 1, blocks: [{ id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: '본문 안내' }] },
  { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '템플릿 자료' }] }, { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: '자료를 받아 실습하세요.' }] }] }] },
  { type: 'paragraph', content: [{ type: 'text', text: '마지막 본문' }] },
] }) }], checklist: [] };
const pdf = Buffer.from('%PDF-1.7\nsynthetic learning material');
async function setup(page: Page, failComplete = false) {
  let document = structuredClone(seed), revision = 'aaaaaaaa-1111-4111-8111-111111111112';
  const files = new Map<string, { name: string; kind: string; size: number }>(), prepared: string[] = [];
  const mediaQueries: URL[] = [];
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (new URL(route.request().url()).searchParams.get('action') === 'progression') { await route.fulfill({ json: { lessons: [{ lessonId: 'aaaaaaab-1111-4111-8111-000000000004', isUnlocked: true, track: null }] } }); return; }
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); document = body.document; revision = body.requestId; }
    await route.fulfill({ json: { document, revision, currentRevision: revision, editable: true, draft: null, previousDrafts: [] } });
  });
  await page.context().route('**/api/platform/lesson-media**', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'prepare') { prepared.push(body.requestId); files.set(body.requestId, { name: body.name, kind: body.kind, size: body.size }); await route.fulfill({ json: { id: body.requestId, contentType: body.contentType, signedUrl: 'https://upload.example.test/' + body.requestId } }); return; }
      if (failComplete) { failComplete = false; await route.fulfill({ status: 503, json: { error: '파일 확인 응답을 다시 받아 주세요.' } }); return; }
      await route.fulfill({ json: { id: body.assetId } }); return;
    }
    const query = new URL(route.request().url()); mediaQueries.push(query);
    const file = files.get(query.searchParams.get('asset') || '');
    if (!file) { await route.fulfill({ status: 404, json: { error: '파일 없음' } }); return; }
    if (query.searchParams.has('metadata')) { await route.fulfill({ json: file }); return; }
    await route.fulfill({ contentType: 'application/octet-stream', headers: { 'Content-Disposition': 'attachment; filename="lesson.pdf"' }, body: pdf });
  });
  await page.route('https://upload.example.test/**', async route => { expect(route.request().headers()['x-upsert']).toBe('false'); await route.fulfill({ json: { ok: true } }); });
  await page.goto('/lesson-block-author-test');
  await expect(page.getByRole('textbox', { name: '수업 문서', exact: true })).toBeVisible();
  return { saved: () => document, prepared, mediaQueries };
}
async function insert(page: Page, inside: boolean) {
  const canvas = page.getByRole('textbox', { name: '수업 문서', exact: true });
  if (inside) { await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click(); await canvas.getByText('자료를 받아 실습하세요.', { exact: true }).click(); }
  else await canvas.getByText('본문 안내', { exact: true }).click();
  await page.getByRole('button', { name: '+ 현재 위치에 추가', exact: true }).click();
  await page.getByRole('group', { name: '문서에 넣을 항목' }).getByRole('button', { name: '파일 첨부', exact: true }).click();
  const settings = page.getByRole('complementary', { name: '선택 항목 설정' });
  await expect(settings).toBeVisible();
  await settings.getByLabel('첨부 파일 선택', { exact: true }).setInputFiles({ name: inside ? '실습 템플릿.pdf' : '본문 자료.pdf', mimeType: 'application/pdf', buffer: pdf });
  return { canvas, settings };
}
async function save(page: Page) { await page.getByRole('button', { name: '학습 저장', exact: true }).click(); await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible(); }
for (const inside of [false, true]) test(`file attachment ${inside ? 'inside toggle' : 'between paragraphs'} survives save/reopen and student download`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const api = await setup(page), { canvas, settings } = await insert(page, inside);
  await expect(settings.getByRole('link', { name: '연결된 첨부 열기' })).toBeVisible();
  await expect(settings.getByRole('textbox', { name: '주소' })).toHaveCount(0);
  await settings.getByRole('textbox', { name: '설명', exact: true }).fill('실습에 사용할 자료입니다.');
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click(); await save(page);
  const file = api.saved().blocks.find(block => block.type === 'file')!; expect(file.assetId).toBeTruthy(); expect(file.url).toBeUndefined();
  if (inside) expect(parseLessonDocument(api.saved().blocks[0].content!)!.content![1].content![1].content!.some(node => node.type === 'lessonFile')).toBe(true);
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  if (inside) await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await expect(canvas.getByLabel('학습 첨부 파일')).toContainText('실습에 사용할 자료입니다.');
  await page.getByRole('button', { name: '학생 화면 보기' }).click();
  const reader = page.locator('.lesson-blocks').first(), attachment = reader.getByLabel('학습 첨부 파일');
  if (inside) { await expect(attachment).toBeHidden(); await reader.getByText('템플릿 자료', { exact: true }).click(); }
  await expect(attachment).toBeVisible(); await expect(attachment).toContainText(inside ? '실습 템플릿.pdf' : '본문 자료.pdf');
  const link = attachment.getByRole('link', { name: /다운로드/ });
  await expect(link).toHaveAttribute('href', /asset=.*&lesson=.*&enrollment=.*&revision=.*&download=1/);
  // A separate download context keeps the student's current lesson open.
  const downloading = page.waitForEvent('download');
  await link.click(); const download = await downloading;
  expect(download.suggestedFilename()).toBe('lesson.pdf');
  expect(await fs.readFile((await download.path())!)).toEqual(pdf);
  await expect.poll(() => api.mediaQueries.some(url => url.searchParams.get('download') === '1' && url.searchParams.has('enrollment'))).toBe(true);
  await expect(attachment).toBeVisible(); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await reader.screenshot({ path: info.outputPath(inside ? 'toggle-download.png' : 'body-download.png') });
});
test('failed file completion retries one immutable asset; moving in/out of a toggle preserves it', async ({ page }) => {
  const api = await setup(page, true), { settings } = await insert(page, false);
  await expect(settings.getByRole('alert')).toContainText('파일 확인 응답');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click(); expect(api.saved()).toEqual(seed);
  await settings.getByRole('button', { name: '같은 파일 다시 올리기' }).click();
  await expect(settings.getByRole('link', { name: '연결된 첨부 열기' })).toBeVisible(); expect(api.prepared[0]).toBe(api.prepared[1]);
  await settings.getByRole('combobox', { name: '토글 안으로 이동', exact: true }).selectOption('1'); await save(page);
  const file = api.saved().blocks.find(block => block.type === 'file')!;
  await expect(settings.getByRole('button', { name: '토글 밖으로 꺼내기' })).toBeVisible();
  await settings.getByRole('button', { name: '토글 밖으로 꺼내기' }).click(); await save(page);
  expect(api.saved().blocks.find(block => block.type === 'file')).toEqual(file);
  expect(api.saved().blocks.filter(block => block.type === 'text').map(block => block.content).join('')).not.toContain('lessonFile');
});
