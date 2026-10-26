import { test, expect, type Page } from '@playwright/test';
import { serializeLessonDocument, parseLessonDocument } from '../../lib/lesson-body';
import { validateLessonBlocks, publicLessonBlocks, type LessonBlockDocument } from '../../lib/lesson-blocks';

const seed: LessonBlockDocument = { schemaVersion: 1, blocks: [
  { id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '접어 둔 학습 도구' }] }, { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: '여기에 기능 추가' }] }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: '접기 뒤의 본문' }] },
  ] }) },
  { id: 'original-prompt', type: 'prompt', content: '원래 프롬프트' },
], checklist: [] };
async function setup(page: Page, initial = seed) {
  let document = structuredClone(initial), revision = 'aaaaaaaa-1111-4111-8111-111111111112';
  await page.route('**/api/platform/lesson-blocks**', async route => {
    const action = new URL(route.request().url()).searchParams.get('action');
    if (action === 'progression') { await route.fulfill({ json: { lessons: [{ lessonId: 'aaaaaaab-1111-4111-8111-000000000004', isUnlocked: true, track: null, dayNumber: null, automaticApproval: false, reason: '' }] } }); return; }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.document) { document = validateLessonBlocks(body.document); revision = body.requestId; }
    }
    const learner = !new URL(route.request().url()).searchParams.has('admin');
    await route.fulfill({ json: { document: learner ? publicLessonBlocks(document) : document, revision, currentRevision: revision, editable: true, draft: null, previousDrafts: [] } });
  });
  await page.goto('/lesson-block-author-test');
  const canvas = page.getByRole('textbox', { name: '수업 문서', exact: true });
  await expect(canvas).toBeVisible();
  return { canvas, saved: () => document };
}
async function save(page: Page) {
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
}

test('insert a prompt inside a toggle, save/reopen and copy exactly once in the learner view', async ({ page, context }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { canvas, saved } = await setup(page);
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await canvas.getByText('여기에 기능 추가', { exact: true }).click();
  await page.getByRole('button', { name: '+ 현재 위치에 추가', exact: true }).click();
  await page.getByRole('group', { name: '문서에 넣을 항목' }).getByRole('button', { name: '복사할 프롬프트', exact: true }).click();
  const settings = page.getByRole('complementary', { name: '선택 항목 설정' });
  const text = '사업 소개를 정리해 주세요.\n조건: 줄바꿈과 {변수} 유지';
  await settings.getByRole('textbox', { name: '내용 *', exact: true }).fill(text);
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  const nested = canvas.locator('[data-type="detailsContent"] [data-block-type="prompt"]');
  await expect(nested).toHaveCount(1); await expect(nested).toContainText(text);
  await save(page);
  const inserted = saved().blocks.find(block => block.type === 'prompt' && block.id !== 'original-prompt')!;
  expect(parseLessonDocument(saved().blocks[0].content!)!.content![0].content![1].content!.at(-1)).toEqual({ type: 'lessonEmbed', attrs: { blockId: inserted.id } });
  expect(saved().blocks.find(block => block.id === 'original-prompt')).toEqual(seed.blocks[1]);
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await expect(nested).toContainText(text);
  await page.getByRole('button', { name: '학생 화면 보기' }).click();
  const reader = page.locator('.lesson-blocks').first(), prompt = reader.locator(`[data-lesson-block="${inserted.id}"]`);
  await expect(prompt).toHaveCount(1); await expect(prompt).toBeHidden();
  await reader.getByText('접어 둔 학습 도구', { exact: true }).click();
  await prompt.getByRole('button', { name: '프롬프트 복사', exact: true }).click();
  await expect(prompt.getByRole('status')).toContainText('복사했습니다');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await reader.getByText('접어 둔 학습 도구', { exact: true }).click();
  await expect(prompt).toBeHidden();
  await reader.getByText('접어 둔 학습 도구', { exact: true }).click();
  await expect(prompt.getByRole('region')).toHaveText(text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await reader.screenshot({ path: info.outputPath('toggle-prompt-reader.png') });
  expect(errors).toEqual([]);
});

test('existing prompts move into and out of toggles with the same identity; text insertion stays inside', async ({ page }) => {
  const { canvas, saved } = await setup(page);
  await canvas.locator('[data-author-block="original-prompt"]').getByRole('button', { name: '복사할 프롬프트 설정' }).click();
  await page.getByRole('combobox', { name: '토글 안으로 이동', exact: true }).selectOption('1');
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click(); await save(page);
  expect(saved().blocks[1]).toEqual(seed.blocks[1]);
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  const prompt = canvas.locator('[data-type="detailsContent"] [data-author-block="original-prompt"]');
  await expect(prompt).toHaveCount(1);
  await prompt.getByRole('button', { name: '복사할 프롬프트 설정' }).click();
  await page.getByRole('button', { name: '토글 밖으로 꺼내기', exact: true }).click();
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click(); await save(page);
  expect(saved()).toEqual(seed);
  await canvas.getByText('여기에 기능 추가', { exact: true }).click();
  await page.getByRole('button', { name: '+ 현재 위치에 추가', exact: true }).click();
  await page.getByRole('group', { name: '문서에 넣을 항목' }).getByRole('button', { name: '본문', exact: true }).click();
  await page.keyboard.type('접기 안에 추가된 본문'); await save(page);
  const doc = parseLessonDocument(saved().blocks[0].content!)!;
  expect(doc.content![0].content![1].content!.some(node => node.content?.some(child => child.text === '접기 안에 추가된 본문'))).toBe(true);
  expect(saved().blocks).toHaveLength(2);
});

test('duplicating a toggle gives every nested tool a new identity; undo keeps the original', async ({ page }) => {
  const initial = structuredClone(seed);
  const doc = parseLessonDocument(initial.blocks[0].content!)!;
  doc.content![0].content![1].content!.push({ type: 'lessonEmbed', attrs: { blockId: 'original-prompt' } });
  initial.blocks[0].content = serializeLessonDocument(doc);
  const { canvas, saved } = await setup(page, initial);
  await canvas.getByRole('button', { name: '내용 펼치기', exact: true }).click();
  await canvas.getByText('여기에 기능 추가', { exact: true }).click();
  await page.getByRole('button', { name: '항목 복제', exact: true }).click(); await save(page);
  const prompts = saved().blocks.filter(block => block.type === 'prompt');
  expect(prompts).toHaveLength(2); expect(new Set(saved().blocks.map(block => block.id)).size).toBe(saved().blocks.length);
  expect(prompts.map(block => block.content)).toEqual(['원래 프롬프트', '원래 프롬프트']);
  await canvas.getByText('여기에 기능 추가', { exact: true }).first().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await save(page);
  expect(saved()).toEqual(initial);
});

test('nested questions, generated prompts and quizzes keep answers and grading after collapse and reopen', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const tools: LessonBlockDocument['blocks'] = [
    { id: 'question', type: 'question', question: { label: '내 고객', kind: 'text', required: true } },
    { id: 'generator', type: 'prompt-generator', content: '고객: {고객}', fields: [{ id: 'customer', label: '고객', variable: '고객', placeholder: '', required: true, sensitive: false }] },
    { id: 'quiz', type: 'quiz', content: '학습 확인', quiz: { passPercent: 100, questions: [{ id: 'q1', prompt: '정답은?', options: ['첫째', '둘째'], correctIndex: 0 }] } },
  ];
  const nested: LessonBlockDocument = { schemaVersion: 1, blocks: [{ id: 'body', type: 'text', content: serializeLessonDocument({ type: 'doc', content: [
    { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '큰 접기' }] }, { type: 'detailsContent', content: [
      { type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '안쪽 학습 도구' }] }, { type: 'detailsContent', content: tools.map(block => ({ type: 'lessonEmbed', attrs: { blockId: block.id } })) }] },
    ] }] },
  ] }) }, ...tools], checklist: [] };
  let draft: { values: { blocks: Record<string, unknown>; checklist: string[] }; writeId: string; updatedAt: string } | null = null;
  let graded = '';
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: { document: publicLessonBlocks(nested), revision: '44444444-4444-4444-8444-444444444444', currentRevision: '44444444-4444-4444-8444-444444444444', editable: false, draft, previousDrafts: [] } }); return; }
    const body = route.request().postDataJSON();
    if (body.action === 'grade') { graded = body.blockId; await route.fulfill({ json: { result: { correct: 1, total: 1, passed: true, results: [{ id: 'q1', answered: true, correct: true }] } } }); return; }
    draft = { values: body.values, writeId: body.requestId, updatedAt: new Date().toISOString() };
    await route.fulfill({ json: { writeId: draft.writeId, updatedAt: draft.updatedAt } });
  });
  await page.goto('/lesson-blocks-test');
  const reader = page.locator('.lesson-blocks').first();
  await reader.getByText('큰 접기', { exact: true }).click();
  await reader.getByText('안쪽 학습 도구', { exact: true }).click();
  const question = reader.getByRole('textbox', { name: '내 고객 (필수)', exact: true });
  await question.fill('동네 사장님');
  await reader.getByRole('textbox', { name: '고객 (필수)', exact: true }).fill('지역 고객');
  await reader.getByRole('button', { name: '프롬프트 만들기', exact: true }).click();
  await expect(reader.getByRole('region', { name: '프롬프트 내용' })).toHaveText('고객: 지역 고객');
  await reader.getByRole('button', { name: '프롬프트 복사', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('고객: 지역 고객');
  await reader.getByRole('radio', { name: '첫째', exact: true }).check();
  await reader.getByRole('button', { name: '답안 확인', exact: true }).click();
  await expect.poll(() => graded).toBe('quiz');
  await expect(reader.getByRole('status').filter({ hasText: '1문제 중 1문제 정답' })).toBeVisible();
  await reader.getByText('큰 접기', { exact: true }).click();
  await expect(question).toBeHidden();
  await expect.poll(() => draft?.values.blocks.question).toBe('동네 사장님');
  await expect.poll(() => draft?.values.blocks.generator).toEqual({ customer: '지역 고객' });
  await expect.poll(() => draft?.values.blocks.quiz).toEqual({ q1: 0 });
  await page.reload();
  await reader.getByText('큰 접기', { exact: true }).click();
  await reader.getByText('안쪽 학습 도구', { exact: true }).click();
  await expect(question).toHaveValue('동네 사장님');
  await expect(reader.getByRole('textbox', { name: '고객 (필수)', exact: true })).toHaveValue('지역 고객');
  await expect(reader.getByRole('radio', { name: '첫째', exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});
