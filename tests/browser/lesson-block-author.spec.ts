import { expect, test, type Page } from '@playwright/test';
import type { LessonBlockDocument } from '../../lib/lesson-blocks';

async function backend(page: Page, failure = 0, denied = false) {
  let document: LessonBlockDocument | null = null, revision: string | null = null, readError = false;
  const writes: { requestId: string; expectedRevision: string | null; document: LessonBlockDocument }[] = [];
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if (route.request().method() === 'GET') {
      if (new URL(route.request().url()).searchParams.get('action') === 'progression') { await route.fulfill({json:{lessons:[{lessonId:'aaaaaaab-1111-4111-8111-000000000004',isUnlocked:true,track:null,dayNumber:null,automaticApproval:false,reason:''}]}}); return; }

      if (readError) { await route.fulfill({ status: 503, json: { error: '합성 조회 오류' } }); return; }
      const learner = new URL(route.request().url()).searchParams.has('enrollment');
      const shown = document && structuredClone(document);
      if (learner && shown) for (const block of shown.blocks) if (block.quiz) for (const question of block.quiz.questions) Reflect.deleteProperty(question, 'correctIndex');
      await route.fulfill({ json: { document: shown, revision, currentRevision: revision, editable: !learner && !denied, draft: null, previousDrafts: [] } }); return;
    }
    const body = route.request().postDataJSON(); writes.push(body);
    if (failure === 409) { failure = 0; await route.fulfill({ status: 409, json: { error: '다른 화면에서 학습을 수정했습니다.' } }); return; }
    if (revision !== body.requestId && body.expectedRevision !== revision) { await route.fulfill({ status: 409, json: { error: '저장 충돌' } }); return; }
    document = body.document; revision = body.requestId;
    if (failure) { const status = failure; failure = 0; await route.fulfill({ status, json: { error: '저장 응답을 받지 못했습니다.' } }); return; }
    await route.fulfill({ json: { revision } });
  });
  return { writes, getDocument: () => document, setDocument: (value: LessonBlockDocument) => { document = value; revision = 'bbbbbbbc-1111-4111-8111-111111111111'; }, setReadError: (value: boolean) => { readError = value; } };
}
async function add(page: Page, type: string) { await page.getByRole('combobox', { name: '추가할 항목' }).selectOption(type); await page.getByRole('button', { name: '항목 추가', exact: true }).click(); return page.locator('[data-author-block]').last(); }

test('author preserves image and archive question types and exposes the matching student upload controls', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  for (const [kind, label] of [['image', '실행 화면'], ['file', '결과물 묶음']]) {
    const question = await add(page, 'question');
    await question.getByRole('textbox', { name: '질문 문구' }).fill(label);
    await question.getByRole('combobox', { name: '답변 유형' }).selectOption(kind);
  }
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  expect(server.getDocument()?.blocks.slice(1).map(block => block.question?.kind)).toEqual(['image', 'file']);
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await expect(page.getByRole('combobox', { name: '답변 유형' }).nth(0)).toHaveValue('image');
  await expect(page.getByRole('combobox', { name: '답변 유형' }).nth(1)).toHaveValue('file');
  await page.getByRole('button', { name: '구성 미리보기', exact: true }).click();
  await expect(page.getByLabel('구성 미리보기').locator('input[type=file]')).toHaveCount(0);
  await page.getByRole('button', { name: '학생 화면 보기' }).click();
  const image = page.getByRole('region', { name: '실행 화면', exact: true });
  const archive = page.getByRole('region', { name: '결과물 묶음', exact: true });
  await expect(image.getByLabel('답변 이미지 선택')).toBeEnabled();
  await expect(image.getByLabel('압축파일 선택')).toBeEnabled();
  await expect(archive.getByLabel('압축파일 선택')).toBeEnabled();
  await expect(archive.getByLabel('답변 이미지 선택')).toHaveCount(0);
});

test('author saves the learning track and whole-course ordinal with the original quiz completion policy',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test');await page.getByRole('button',{name:'여러 항목으로 구성하기'}).click();
 await page.getByRole('combobox',{name:'학습 개방 방식'}).selectOption('learning');await page.getByRole('spinbutton',{name:'전체 과정에서 몇 일차인가요?'}).fill('30');
 await page.getByRole('button',{name:'학습 저장',exact:true}).click();await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.',{exact:true})).toBeVisible();
 expect(server.getDocument()?.progression).toEqual({track:'learning',dayNumber:30});expect(server.getDocument()?.completion).toEqual({mode:'self',requireAnswers:false,requireQuizPass:true});
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.getByRole('combobox',{name:'학습 개방 방식'})).toHaveValue('learning');await expect(page.getByRole('spinbutton',{name:'전체 과정에서 몇 일차인가요?'})).toHaveValue('30');
});

test('one lesson save preserves original text, ordered questions/tools and displays them in real classroom', async ({ page }, testInfo) => {
  const server = await backend(page);
  await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  await expect(page.locator('[data-author-block]').first()).toContainText('원래 본문');
  const heading = await add(page, 'heading');
  await heading.getByRole('textbox', { name: '내용' }).fill('오늘의 실습');
  await page.getByRole('button', { name: '항목 2 위로' }).click();
  const question = await add(page, 'question');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('필수 항목');
  await expect(question.getByRole('textbox', { name: '질문 문구' })).toHaveCSS('border-top-color', 'rgb(188, 28, 42)');
  await expect(page.getByLabel('기본 정보 저장 횟수')).toHaveText('0');
  await question.getByRole('textbox', { name: '질문 문구' }).fill('어떤 고객을 돕고 싶나요?');
  const generator = await add(page, 'prompt-generator');
  await generator.getByRole('textbox', { name: '프롬프트 틀' }).fill('{고객}을 위한 소개 문장을 써 주세요.');
  await generator.getByRole('button', { name: '입력 항목 추가' }).click();
  await generator.getByRole('textbox', { name: '질문 문구' }).fill('도울 고객');
  await generator.getByRole('textbox', { name: /^변수 이름/ }).fill('고객');
  const quiz = await add(page, 'quiz');
  await quiz.getByRole('textbox', { name: '문제 1 내용' }).fill('첫 단계는 무엇인가요?');
  await quiz.getByRole('textbox', { name: '문제 1 선택지 1', exact: true }).fill('바로 광고');
  await quiz.getByRole('textbox', { name: '문제 1 선택지 2', exact: true }).fill('고객 이해');
  await quiz.getByRole('radio', { name: '문제 1 정답 2' }).check();
  await page.getByRole('button', { name: '체크 항목 추가' }).click();
  await page.getByRole('textbox', { name: '체크 항목 1' }).fill('실습했습니다.');
  await page.getByRole('combobox', { name: '완료 방식' }).selectOption('mentor');
  await page.getByRole('checkbox', { name: '필수 질문·생성기 입력 완료 필요' }).uncheck();
  await page.getByRole('checkbox', { name: '시험 통과 필요' }).uncheck();
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  expect(server.getDocument()?.blocks.map(block => block.type)).toEqual(['heading', 'text', 'question', 'prompt-generator', 'quiz']);
  expect(server.getDocument()?.blocks[1].content).toBe('원래 본문\n[안내 링크](https://example.test/guide)');
  await expect(page.getByLabel('기존 본문 변경 횟수')).toHaveText('0');
  const ids = server.getDocument()?.blocks.map(block => block.id);
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await expect(page.locator('[data-author-block]')).toHaveCount(5);
  expect(server.getDocument()?.completion).toEqual({ mode: 'mentor', requireAnswers: false, requireQuizPass: false });
  await expect(page.getByRole('combobox', { name: '완료 방식' })).toHaveValue('mentor');
  expect(await page.locator('[data-author-block]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-author-block')))).toEqual(ids);
  await page.getByRole('button', { name: '구성 미리보기', exact: true }).click();
  await expect(page.getByLabel('구성 미리보기').getByRole('heading', { name: '오늘의 실습' })).toBeVisible();
  await page.getByRole('button', { name: '학생 화면 보기' }).click();
  await expect(page.getByRole('heading', { name: '오늘의 실습' })).toBeVisible();
  await expect(page.getByRole('link', { name: '안내 링크' })).toHaveAttribute('href', 'https://example.test/guide');
  await expect(page.getByRole('textbox', { name: '어떤 고객을 돕고 싶나요?' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '도울 고객' })).toBeVisible();
  await expect(page.getByRole('radio', { name: '고객 이해' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '실습했습니다.' })).toBeVisible();
  await expect(page.getByText('기존 자료.pdf', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '미션 제출하기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '학습 완료하기' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('classroom-blocks.png'), fullPage: true });
});

test('new lesson keeps in-progress content after a lost save response and retries without duplicate versions', async ({ page }) => {
  const server = await backend(page, 503);
  await page.goto('/lesson-block-author-test?new');
  await page.getByRole('spinbutton', { name: '일차 (Day)' }).fill('1');
  await page.getByRole('combobox', { name: '주차 (Week)' }).selectOption({ index: 1 });
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('새 학습');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  const heading = await add(page, 'heading');
  await heading.getByRole('textbox', { name: '내용' }).fill('먼저 저장한 제목');
  await page.getByRole('button', { name: '학습 등록', exact: true }).click();
  await expect(page.getByText('저장 응답을 받지 못했습니다.').first()).toBeVisible();
  await expect(heading.getByRole('textbox', { name: '내용' })).toHaveValue('먼저 저장한 제목');
  await heading.getByRole('textbox', { name: '내용' }).fill('수정한 최종 제목');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  expect(server.writes).toHaveLength(3);
  expect(server.writes[1]).toEqual(server.writes[0]);
  expect(server.writes[2].expectedRevision).toBe(server.writes[0].requestId);
  expect(server.getDocument()?.blocks[0].content).toBe('수정한 최종 제목');
});

test('conflict keeps author changes, prevents overwrite and permits explicit download and exit', async ({ page }) => {
  const server = await backend(page, 409);
  await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  const heading = await add(page, 'heading');
  await heading.getByRole('textbox', { name: '내용' }).fill('보관할 내 편집');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('다른 화면');
  await expect(page.getByRole('button', { name: '학습 저장', exact: true })).toBeDisabled();
  await expect(heading.getByRole('textbox', { name: '내용' })).toHaveValue('보관할 내 편집');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '현재 편집 내용 내려받기' }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain('보관할 내 편집');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '목록으로', exact: true }).click();
  await expect(heading.getByRole('textbox', { name: '내용' })).toBeVisible();
  expect(server.writes).toHaveLength(1);
});

test('failed or forbidden load cannot replace a saved document with an empty one', async ({ page }) => {
  const server = await backend(page); server.setReadError(true);
  await page.goto('/lesson-block-author-test');
  await expect(page.getByRole('alert')).toContainText('합성 조회 오류');
  await expect(page.getByRole('button', { name: '학습 저장', exact: true })).toBeDisabled();
  server.setReadError(false);
  await page.getByRole('button', { name: '학습 구성 다시 불러오기' }).click();
  await expect(page.getByRole('button', { name: '여러 항목으로 구성하기' })).toBeEnabled();
  await page.unroute('**/api/platform/lesson-blocks**');
  const forbidden = await backend(page, 0, true);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('편집할 권한');
  await expect(page.getByRole('button', { name: '학습 저장', exact: true })).toBeDisabled();
  expect(forbidden.writes).toHaveLength(0);
});

test('reorder and removal are saved explicitly and legacy lesson needs no new API while feature is disabled', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  await add(page, 'divider');
  await page.getByRole('button', { name: '항목 2 위로' }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '항목 1 삭제' }).click();
  await expect(page.locator('[data-author-block]')).toHaveCount(2);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '항목 1 삭제' }).click();
  expect(server.writes).toHaveLength(0);
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect.poll(() => server.getDocument()?.blocks.length).toBe(1);
  let calls = 0;
  await page.unroute('**/api/platform/lesson-blocks**');
  await page.route('**/api/platform/lesson-blocks**', route => { calls++; return route.abort(); });
  await page.goto('/classroom-questions-test?links');
  await expect(page.getByRole('link', { name: '클로드 다운로드 페이지', exact: true })).toBeVisible();
  expect(calls).toBe(0);
});

test('removing the correct choice requires a new explicit answer before saving', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  const quiz = await add(page, 'quiz');
  await quiz.getByRole('textbox', { name: '문제 1 내용' }).fill('테스트 문제');
  await quiz.getByRole('textbox', { name: '문제 1 선택지 1', exact: true }).fill('첫 선택지');
  await quiz.getByRole('textbox', { name: '문제 1 선택지 2', exact: true }).fill('다른 선택지');
  await quiz.getByRole('button', { name: '문제 1 선택지 추가' }).click();
  await quiz.getByRole('textbox', { name: '문제 1 선택지 3', exact: true }).fill('삭제할 정답');
  await quiz.getByRole('radio', { name: '문제 1 정답 3' }).check();
  await quiz.getByRole('button', { name: '문제 1 선택지 3 삭제' }).click();
  await expect(quiz.locator('input[type=radio]:checked')).toHaveCount(0);
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('필수 항목');
  expect(server.writes).toHaveLength(0);
  await quiz.getByRole('radio', { name: '문제 1 정답 2' }).check();
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect.poll(() => server.getDocument()?.blocks[1].quiz?.questions[0].correctIndex).toBe(1);
});

test('a 109-block lesson opens one rich editor at a time and preserves untouched source blocks', async ({ page }, testInfo) => {
  const server = await backend(page);
  const original: LessonBlockDocument = { schemaVersion: 1, blocks: Array.from({ length: 109 }, (_, i) => ({ id: `text-${i}`, type: 'text', content: `원래 메모 ${i}\n\n줄바꿈 그대로` })), checklist: [] };
  server.setDocument(original);
  await page.goto('/lesson-block-author-test');
  await expect(page.locator('[data-author-block]')).toHaveCount(109);
  await expect(page.locator('[contenteditable=true]')).toHaveCount(0);
  await page.getByRole('button', { name: '항목 1 본문 편집', exact: true }).click();
  await expect(page.locator('[contenteditable=true]')).toHaveCount(1);
  await page.getByRole('textbox', { name: '항목 1 본문', exact: true }).fill('첫 메모 수정');
  await page.getByRole('button', { name: '항목 109 본문 편집', exact: true }).click();
  await expect(page.locator('[contenteditable=true]')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: '항목 109 본문', exact: true })).toContainText('원래 메모 108');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  expect(server.getDocument()?.blocks.slice(1)).toEqual(original.blocks.slice(1));
  expect(server.getDocument()?.blocks[0].content).toContain('첫 메모 수정');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('author-large-lesson.png') });
});

test('author can add both guided tools, preserve their versions and preview their original questions', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  await add(page, 'persona-generator');
  await add(page, 'landing-planner');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  const doc = server.getDocument()!;
  expect(doc.blocks.map(b => b.type)).toEqual(['text', 'persona-generator', 'landing-planner']);
  expect(doc.blocks.slice(1).map(b => b.toolVersion)).toEqual(['replit-2026-09-07', 'replit-2026-09-07']);
  expect(doc.blocks[1].fields).toHaveLength(15);
  expect(doc.blocks[2].fields).toHaveLength(11);
  await page.getByRole('button', { name: '편집 다시 열기' }).click();
  await expect(page.locator('[data-author-block]')).toHaveCount(3);
  await page.getByRole('button', { name: '구성 미리보기', exact: true }).click();
  const preview = page.getByLabel('구성 미리보기');
  await expect(preview.getByText('우리를 선택하는 결정적 이유는?', { exact: true })).toBeVisible();
  await expect(preview.getByText('이 페이지가 성공했다고 말할 수 있는 숫자는?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '학생 화면 보기' }).click();
  await expect(page.getByRole('region', { name: '핵심 고객 페르소나 생성기' })).toBeVisible();
  await expect(page.getByRole('region', { name: '랜딩페이지 기획 문답' })).toBeVisible();
});

test('author adds and saves all three calculators with their input definitions', async ({ page }) => {
  const server=await backend(page);await page.goto('/lesson-block-author-test');
  await page.getByRole('button',{name:'여러 항목으로 구성하기'}).click();
  for(const type of ['recipe-calculator','margin-calculator','marketing-funnel'])await add(page,type);
  await page.getByRole('button',{name:'학습 저장',exact:true}).click();await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.',{exact:true})).toBeVisible();
  expect(server.getDocument()!.blocks.slice(1).map(b=>b.fields!.length)).toEqual([9,13,1]);
  expect(server.getDocument()!.blocks.slice(1).map(b=>b.toolVersion)).toEqual(['replit-2026-09-07','replit-2026-09-07','replit-2026-09-07']);
  await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.locator('[data-author-block]')).toHaveCount(4);
  await page.getByRole('button',{name:'구성 미리보기',exact:true}).click();
  await expect(page.getByLabel('구성 미리보기').getByRole('region',{name:'마케팅 퍼널 만들기'})).toBeVisible();
  await page.getByRole('button',{name:'학생 화면 보기'}).click();
  for(const name of ['레시피 실행 계산기','마진 계산기','마케팅 퍼널 만들기'])await expect(page.getByRole('region',{name,exact:true})).toBeVisible();
});

const draftKey = (actor = 'aaaaaaab-1111-4111-8111-000000000090', lesson = 'aaaaaaab-1111-4111-8111-000000000004') => `edu:learning-author:v1:${actor}:${lesson || 'new'}`;
test('author drafts autosave while editing and restore title, unfinished blocks and checklist only on request', async ({ page }, info) => {
  const server = await backend(page); await page.clock.install(); await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  const q = await add(page, 'question'); await q.getByRole('textbox', { name: '질문 문구' }).fill('작성 중 질문');
  await page.getByRole('button', { name: '체크 항목 추가' }).click();
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('복구할 제목');
  await page.clock.fastForward(20_000); await q.getByRole('textbox', { name: '질문 문구' }).fill('계속 쓰는 질문');
  await page.clock.fastForward(11_000);
  await expect(page.getByRole('region', { name: '편집 임시저장' }).getByRole('status')).toContainText('브라우저 임시저장:');
  expect(server.writes).toHaveLength(0);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey());
  expect(stored.form.basic.title).toBe('복구할 제목'); expect(stored.blocks.document.checklist[0].label).toBe('');
  await page.reload(); await expect(page.getByRole('button', { name: '임시저장본 불러오기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '학습 저장', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('구성 편집 검수');
  await page.getByRole('button', { name: '임시저장본 불러오기' }).click();
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('복구할 제목');
  await expect(page.getByRole('textbox', { name: '질문 문구' })).toHaveValue('계속 쓰는 질문');
  await expect(page.getByRole('textbox', { name: '체크 항목 1' })).toHaveValue('');
  await page.getByRole('textbox', { name: '체크 항목 1' }).fill('마무리');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), draftKey())).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath('author-draft-restored.png'), fullPage: true });
});

test('a different account cannot restore the draft and a newer server document is preserved', async ({ page }) => {
  const server = await backend(page); await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  const heading = await add(page, 'heading'); await heading.getByRole('textbox', { name: '내용' }).fill('내 미저장 내용');
  await page.getByRole('button', { name: '지금 임시저장' }).click();
  await page.goto('/lesson-block-author-test?actor=aaaaaaab-1111-4111-8111-000000000091');
  await expect(page.getByRole('button', { name: '여러 항목으로 구성하기' })).toBeVisible(); await expect(page.getByRole('button', { name: '임시저장본 불러오기' })).toHaveCount(0);
  server.setDocument({ schemaVersion: 1, blocks: [{ id: 'server-title', type: 'heading', content: '다른 직원의 최신 내용' }], checklist: [] });
  await page.goto('/lesson-block-author-test'); await page.getByRole('button', { name: '임시저장본 불러오기' }).click();
  await expect(page.getByRole('alert')).toContainText('서버에 더 새로운');
  await expect(page.getByRole('textbox', { name: '내용' })).toHaveValue('다른 직원의 최신 내용'); expect(server.writes).toHaveLength(0);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '임시저장본 내려받기' }).click();
  const stream = await (await downloadPromise).createReadStream(); const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toContain('내 미저장 내용');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '임시저장본 버리기' }).click();
  await expect(page.getByRole('button', { name: '학습 저장', exact: true })).toBeEnabled();
  expect(server.getDocument()?.blocks[0].content).toBe('다른 직원의 최신 내용');
});

test('corrupt drafts and unavailable storage are explicit and never replace server content', async ({ page }) => {
  const server = await backend(page); await page.goto('/lesson-block-author-test');
  await page.evaluate(key => localStorage.setItem(key, '{broken'), draftKey()); await page.reload();
  await expect(page.getByRole('alert')).toContainText('임시저장본을 읽지 못했습니다');
  await expect(page.getByRole('button', { name: '임시저장본 불러오기' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '학습 저장', exact: true })).toBeDisabled();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '임시저장본 버리기' }).click();
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: '지금 임시저장' }).click();
  await expect(page.getByRole('alert')).toContainText('임시저장에 실패했습니다'); expect(server.writes).toHaveLength(0);
  await page.getByRole('button', { name: '학습 저장', exact: true }).click(); await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
});

test('a successful write with a lost response can be restored without creating a duplicate version', async ({ page }) => {
  const server = await backend(page, 503); await page.goto('/lesson-block-author-test');
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  const heading = await add(page, 'heading'); await heading.getByRole('textbox', { name: '내용' }).fill('응답을 놓친 편집');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click(); await expect(page.getByText('저장 응답을 받지 못했습니다.').first()).toBeVisible();
  await page.getByRole('button', { name: '지금 임시저장' }).click(); await page.reload();
  await page.getByRole('button', { name: '임시저장본 불러오기' }).click();
  await expect(page.getByRole('textbox', { name: '내용' })).toHaveValue('응답을 놓친 편집');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click(); await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  expect(server.writes).toHaveLength(1);
});

test('another editor tab draft is not overwritten or deleted by this tab', async ({ page, context }) => {
  await backend(page); await page.goto('/lesson-block-author-test'); await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  const other = await context.newPage(); await backend(other); await other.goto('/lesson-block-author-test'); await other.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  await other.getByRole('textbox', { name: '제목', exact: false }).fill('다른 창 편집'); await other.getByRole('button', { name: '지금 임시저장' }).click();
  await page.getByRole('button', { name: '지금 임시저장' }).click(); await expect(page.getByRole('alert')).toContainText('다른 창에서');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click();
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), draftKey())).form.basic.title).toBe('다른 창 편집'); await other.close();
});

test('new lesson draft restores before creation and partially registered lesson resumes at its assigned id', async ({ page }) => {
  const server = await backend(page, 503); await page.goto('/lesson-block-author-test?new');
  await page.getByRole('spinbutton', { name: '일차 (Day)' }).fill('1'); await page.getByRole('combobox', { name: '주차 (Week)' }).selectOption({ index: 1 });
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('구성 편집 검수'); await page.getByRole('checkbox', { name: '공개', exact: true }).check();
  await page.getByRole('button', { name: '여러 항목으로 구성하기' }).click();
  const heading = await add(page, 'heading'); await heading.getByRole('textbox', { name: '내용' }).fill('새 학습의 작성 내용');
  await page.getByRole('button', { name: '지금 임시저장' }).click(); await page.reload();
  await page.getByRole('button', { name: '임시저장본 불러오기' }).click(); await expect(page.getByRole('textbox', { name: '내용' })).toHaveValue('새 학습의 작성 내용');
  await page.getByRole('button', { name: '학습 등록', exact: true }).click(); await expect(page.getByText('저장 응답을 받지 못했습니다.').first()).toBeVisible();
  await page.getByRole('button', { name: '지금 임시저장' }).click(); await page.reload();
  await expect(page.getByRole('button', { name: '등록된 학습에서 복구하기' })).toBeVisible();
  await page.route('**/admin/learning-editor?id=*', route => route.fulfill({ status: 302, headers: { location: '/lesson-block-author-test?created' } }));
  await page.getByRole('button', { name: '등록된 학습에서 복구하기' }).click();
  await expect(page).toHaveURL(/lesson-block-author-test\?created/);
  await page.getByRole('button', { name: '임시저장본 불러오기' }).click(); await expect(page.getByRole('textbox', { name: '내용' })).toHaveValue('새 학습의 작성 내용');
  await page.getByRole('button', { name: '학습 저장', exact: true }).click(); await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.', { exact: true })).toBeVisible();
  expect(server.writes).toHaveLength(1);
  expect(await page.evaluate(key => localStorage.getItem(key), draftKey('aaaaaaab-1111-4111-8111-000000000090', ''))).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), draftKey())).toBeNull();
});

test('changed server basic information is not silently replaced by a restored draft', async ({ page }) => {
  const server = await backend(page); await page.goto('/lesson-block-author-test');
  await page.getByRole('textbox', { name: '제목', exact: false }).fill('내가 쓰던 제목'); await page.getByRole('button', { name: '지금 임시저장' }).click();
  await page.goto('/lesson-block-author-test?serverTitle=' + encodeURIComponent('직원이 저장한 제목'));
  await page.getByRole('button', { name: '임시저장본 불러오기' }).click(); await expect(page.getByRole('alert')).toContainText('서버의 기본 정보나 본문이 변경됐습니다');
  await expect(page.getByRole('textbox', { name: '제목', exact: false })).toHaveValue('직원이 저장한 제목'); expect(server.writes).toHaveLength(0);
});
