import { expect, test, type Page, type Route } from '@playwright/test';

const revision = '44444444-4444-4444-8444-444444444444';
const oldRevision = '55555555-5555-4555-8555-555555555555';
const lessonDocument = {
  schemaVersion: 1,
  blocks: [
    { id: 'heading', type: 'heading', content: '나의 사업 소개' },
    { id: 'text', type: 'text', content: '첫 줄\n[도움말](https://example.test/help)\n<script>위험()</script>' },
    { id: 'image', type: 'image', url: 'https://example.test/picture.svg', alt: '학습 예시 이미지' },
    { id: 'audio', type: 'audio', url: 'https://example.test/voice.mp3', content: '소개 음성' },
    { id: 'answer', type: 'question', question: { label: '내 사업의 고객은 누구인가요?', kind: 'text', required: true } },
    { id: 'generator', type: 'prompt-generator', content: '고객: {고객}\n분야: {{분야}}\n시험 값: {비공개 값}', fields: [
      { id: 'customer', label: '고객', variable: '고객', placeholder: '예: 지역 사장님', required: true, sensitive: false },
      { id: 'category', label: '분야', variable: '분야', placeholder: '', required: true, sensitive: false, options: ['교육', '식품'] },
      { id: 'private', label: '비공개 값', variable: '비공개 값', placeholder: '', required: false, sensitive: true },
    ] },
    { id: 'quiz', type: 'quiz', content: '배운 내용 확인', quiz: { passPercent: 100, questions: [{ id: 'q1', prompt: '답안을 확인하는 곳은?', options: ['서버', '화면'] }] } },
  ], checklist: [{ id: 'check', label: '소개 문장을 정리했습니다.', required: true }],
};
type Draft = { values: { blocks: Record<string, unknown>; checklist: string[] }; writeId: string; updatedAt: string } | null;
async function mock(page: Page, options: { failure?: number; historical?: boolean; unsupported?: boolean; empty?: boolean } = {}) {
  let draft: Draft = null;
  const writes: Record<string, unknown>[] = [];
  let failure = options.failure || 0;
  await page.route('https://example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><rect width="100" height="30" fill="gray"/></svg>' }));
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (route.request().method() === 'GET') {
      const isOld = new URL(route.request().url()).searchParams.get('revision') === oldRevision;
      await route.fulfill({ json: {
        editable: false, currentRevision: revision, revision: isOld ? oldRevision : revision,
        document: options.empty ? null : { ...lessonDocument, blocks: options.unsupported ? [...lessonDocument.blocks, { id: 'tool', type: 'persona-generator', fields: [] }] : lessonDocument.blocks },
        draft: isOld ? { writeId: oldRevision, updatedAt: '2026-09-28T12:00:00Z', values: { blocks: { answer: '예전에 작성한 답변' }, checklist: [] } } : draft,
        previousDrafts: options.historical ? [{ revision: oldRevision, updatedAt: '2026-09-28T12:00:00Z' }] : [],
      } }); return;
    }
    const body = route.request().postDataJSON();
    if (body.action === 'grade') { await route.fulfill({ json: { result: { total: 1, correct: 1, passed: true, results: [{ id: 'q1', answered: true, correct: true }] } } }); return; }
    writes.push(body);
    if (failure) { const status = failure; failure = 0; await route.fulfill({ status, json: { error: status === 409 ? '다른 화면에서 저장했습니다.' : '연결이 끊겼습니다.' } }); return; }
    draft = { writeId: body.requestId, values: body.values, updatedAt: new Date().toISOString() };
    await route.fulfill({ json: { writeId: draft.writeId, updatedAt: draft.updatedAt } });
  });
  return { writes, getDraft: () => draft };
}

test('mixed lesson answers, generator, quiz and checklist survive reopening; private input never saves', async ({ page, context }, testInfo) => {
  const backend = await mock(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/lesson-blocks-test');
  await expect(page.getByRole('heading', { name: '나의 사업 소개' })).toBeVisible();
  expect(await page.locator('[data-lesson-block]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-lesson-block')))).toEqual(lessonDocument.blocks.map(block => block.id));
  await expect(page.getByRole('link', { name: '도움말' })).toHaveAttribute('target', '_blank');
  await expect(page.locator('[data-lesson-block=text]')).toContainText('<script>위험()</script>');
  expect(await page.locator('[data-lesson-block=text] script').count()).toBe(0);
  await expect(page.getByRole('img', { name: '학습 예시 이미지' })).toBeVisible();
  await expect(page.locator('audio')).toHaveAttribute('preload', 'none');
  await page.getByRole('button', { name: '프롬프트 만들기' }).click();
  await expect(page.getByRole('alert')).toContainText('고객');
  await page.getByRole('textbox', { name: '내 사업의 고객은 누구인가요?' }).fill('동네 카페 사장님');
  await page.getByRole('textbox', { name: '고객 (필수)', exact: true }).fill('$& 와 {분야}');
  await page.getByRole('combobox', { name: '분야' }).selectOption('교육');
  await page.getByLabel('비공개 값', { exact: false }).fill('synthetic-secret');
  await page.getByRole('button', { name: '프롬프트 만들기' }).click();
  await expect(page.locator('.lb-prompt pre')).toHaveText('고객: $& 와 {분야}\n분야: 교육\n시험 값: synthetic-secret');
  await page.getByRole('button', { name: '프롬프트 복사' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('$& 와 {분야}');
  await page.getByRole('radio', { name: '서버', exact: true }).check();
  await page.getByRole('button', { name: '답안 확인' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1문제 중 1문제 정답' })).toBeVisible();
  await page.getByRole('checkbox', { name: '소개 문장을 정리했습니다.' }).check();
  await expect(page.getByRole('status').filter({ hasText: '답변 저장됨' })).toBeVisible();
  expect(backend.getDraft()?.values).toEqual({ blocks: { answer: '동네 카페 사장님', generator: { customer: '$& 와 {분야}', category: '교육' }, quiz: { q1: 0 } }, checklist: ['check'] });
  expect(JSON.stringify(backend.writes)).not.toContain('synthetic-secret');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '내 사업의 고객은 누구인가요?' })).toHaveValue('동네 카페 사장님');
  await expect(page.getByRole('combobox', { name: '분야' })).toHaveValue('교육');
  await expect(page.getByLabel('비공개 값', { exact: false })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: '소개 문장을 정리했습니다.' })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('lesson-blocks.png'), fullPage: true });
});

test('failed autosave retries the same write without losing newer input', async ({ page }) => {
  const backend = await mock(page, { failure: 503 });
  await page.goto('/lesson-blocks-test');
  const input = page.getByRole('textbox', { name: '내 사업의 고객은 누구인가요?' });
  await input.fill('첫 답변');
  await expect(page.getByRole('alert')).toContainText('연결이 끊겼습니다.');
  await input.fill('바꾼 답변');
  await page.getByRole('button', { name: '저장 다시 시도' }).click();
  await expect.poll(() => backend.getDraft()?.values.blocks.answer).toBe('바꾼 답변');
  expect(backend.writes[0]).toEqual(backend.writes[1]);
  await expect(input).toHaveValue('바꾼 답변');
});

test('conflict preserves typed answers, offers download and guards navigation without overwriting', async ({ page }) => {
  const backend = await mock(page, { failure: 409 });
  await page.goto('/lesson-blocks-test');
  const input = page.getByRole('textbox', { name: '내 사업의 고객은 누구인가요?' });
  await input.fill('현재 화면에서 작성한 답변');
  await expect(page.getByRole('alert')).toContainText('다른 화면에서 저장');
  await input.fill('보존할 최종 답변');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '현재 답변 내려받기' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('내-학습-답변.json');
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).values.blocks.answer).toBe('보존할 최종 답변');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: '내 클래스로 이동' }).click();
  await expect(page).toHaveURL(/lesson-blocks-test/);
  await expect(input).toHaveValue('보존할 최종 답변');
  expect(backend.writes).toHaveLength(1);
});

test('old answers open with original revision read-only, then return to current lesson', async ({ page }) => {
  const backend = await mock(page, { historical: true });
  await page.goto('/lesson-blocks-test');
  await page.getByText('이전 수업에서 쓴 답변 보기', { exact: true }).click();
  await page.getByRole('button', { name: /2026.*답변/ }).click();
  const input = page.getByRole('textbox', { name: '내 사업의 고객은 누구인가요?' });
  await expect(input).toHaveValue('예전에 작성한 답변');
  await expect(input).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: '답안 확인' })).toHaveCount(0);
  await page.getByRole('button', { name: '현재 수업으로' }).click();
  await expect(input).toHaveValue('');
  expect(backend.writes).toHaveLength(0);
});

test('unsupported imported tools fail closed; an empty document uses legacy content', async ({ page }) => {
  await mock(page, { unsupported: true });
  await page.goto('/lesson-blocks-test');
  await expect(page.getByRole('alert')).toContainText('학습 도구를 준비');
  await expect(page.getByRole('heading', { name: '나의 사업 소개' })).toHaveCount(0);
  await page.unroute('**/api/platform/lesson-blocks**');
  await mock(page, { empty: true });
  await page.reload();
  await expect(page.getByText('기존 학습 본문 유지')).toBeVisible();
});

test('switching lessons ignores a delayed previous response', async ({ page }) => {
  const previous: Route[] = [];
  const snapshot = (title: string) => ({ revision, currentRevision: revision, draft: null, previousDrafts: [], document: { schemaVersion: 1, blocks: [{ id: 'heading', type: 'heading', content: title }], checklist: [] } });
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (new URL(route.request().url()).searchParams.get('lesson')?.startsWith('1111')) previous.push(route);
    else await route.fulfill({ json: snapshot('새 수업의 내용') });
  });
  await page.goto('/lesson-blocks-test');
  await expect.poll(() => previous.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: '다른 학습으로 전환' }).click();
  await expect(page.getByRole('heading', { name: '새 수업의 내용' })).toBeVisible();
  for (const route of previous) await route.fulfill({ json: snapshot('늦게 도착한 이전 수업') }).catch(() => {});
  await expect(page.getByRole('heading', { name: '새 수업의 내용' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '늦게 도착한 이전 수업' })).toHaveCount(0);
});

test('load failure is explicit and retry restores saved answers without showing legacy content', async ({ page }) => {
  let healthy = false;
  await page.route('**/api/platform/lesson-blocks**', route => route.fulfill(healthy ? { json: { document: lessonDocument, revision, currentRevision: revision, previousDrafts: [], draft: { writeId: revision, updatedAt: '2026-09-28T12:00:00Z', values: { blocks: { answer: '서버에 저장된 답변' }, checklist: [] } } } } : { status: 503, json: { error: '학습 조회 연결 오류' } }));
  await page.goto('/lesson-blocks-test');
  await expect(page.getByRole('alert')).toContainText('학습 조회 연결 오류');
  await expect(page.getByText('기존 학습 본문 유지')).toHaveCount(0);
  healthy = true;
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.getByRole('textbox', { name: '내 사업의 고객은 누구인가요?' })).toHaveValue('서버에 저장된 답변');
});
