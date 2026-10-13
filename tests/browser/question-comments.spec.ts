import { test, expect, type BrowserContext } from '@playwright/test';
const questionId = '22222222-2222-4222-8222-222222222222', head = '33333333-3333-4333-8333-333333333333';
async function backend(context: BrowserContext, fail = false) {
  let failed = fail, reads = 0;
  const writes: Record<string, unknown>[] = [];
  const answers = [
    { id: head, authorName: '예시 운영자', source: 'operator', content: '처음 남긴 운영자 답변', createdAt: '2026-10-12T01:00:00Z' },
    { id: '44444444-4444-4444-8444-444444444444', authorName: '예시 수강생', source: 'learner', content: '후속 질문: 다음 단계도 설명해 주세요.', createdAt: '2026-10-13T01:00:00Z' },
  ];
  await context.route('**/api/platform/question-thread?**', async route => {
    if (route.request().method() === 'GET') {
      reads++;
      if (failed) { await route.fulfill({ status: 503, json: { error: '댓글을 읽지 못했습니다.' } }); return; }
      const before = new URL(route.request().url()).searchParams.get('before');
      await route.fulfill({ json: { question: { id: questionId, title: '예시 학습 질문', content: '예시 질문 본문', status: writes.length ? 'answered' : 'open', headId: writes.length ? writes.at(-1)!.requestId : head, resolved: false, archived: false }, canAnswer: true, canFollowUp: true, answers: before ? [{ id: 'older', authorName: '예시 운영자', source: 'operator', content: '이전 페이지의 답변', createdAt: '2026-10-11T01:00:00Z' }] : answers, nextCursor: before ? null : '10' } });
      return;
    }
    const body = route.request().postDataJSON(); writes.push(body);
    answers.push({ id: body.requestId, authorName: '예시 운영자', source: 'operator', content: body.content, createdAt: '2026-10-13T02:00:00Z' });
    await route.fulfill({ json: { id: body.requestId, questionId } });
  });
  return { answers, writes, reads: () => reads, recover: () => { failed = false; } };
}
test('question list shows followups and answers immediately, then refreshes comments after an appended reply', async ({ page, context }, info) => {
  const server = await backend(context); await page.goto('/question-comments-test');
  const comments = page.getByRole('region', { name: '후속 질문과 답변 댓글' });
  await expect(comments.getByText('처음 남긴 운영자 답변', { exact: true })).toBeVisible();
  await expect(comments.getByText('후속 질문: 다음 단계도 설명해 주세요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('목록에 저장된 이전 답변', { exact: true })).toHaveCount(0);
  await expect(comments.getByRole('textbox')).toHaveCount(0); expect(server.writes).toHaveLength(0);
  await comments.getByRole('button', { name: '답글 달기', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '새 답변', exact: true }).fill('이어지는 예시 답글');
  await dialog.getByRole('button', { name: '답변 추가하기', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('답변을 추가했습니다');
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(comments.getByText('이어지는 예시 답글', { exact: true })).toBeVisible();
  await expect(comments.getByText('후속 질문: 다음 단계도 설명해 주세요.', { exact: true })).toBeVisible();
  expect(server.writes).toHaveLength(1); expect(server.writes[0].expectedHeadId).toBe(head);
  expect(server.answers).toHaveLength(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('question-inline-comments.png'), fullPage: true });
});
test('ordinary parent renders do not repeatedly read threads, while a changed list revision and older pages refresh explicitly', async ({ page, context }) => {
  const server = await backend(context); await page.goto('/question-comments-test');
  const comments = page.getByRole('region', { name: '후속 질문과 답변 댓글' });
  await expect(comments.getByText('후속 질문: 다음 단계도 설명해 주세요.', { exact: true })).toBeVisible();
  const initial = server.reads(); expect(initial).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: /일반 화면 갱신/ }).click();
  await page.waitForTimeout(300); expect(server.reads()).toBe(initial);
  server.answers.push({ id: 'new-followup', authorName: '예시 수강생', source: 'learner', content: '새로 도착한 후속 질문', createdAt: '2026-10-13T03:00:00Z' });
  await page.getByRole('button', { name: '목록 새로고침', exact: true }).click();
  await expect(comments.getByText('새로 도착한 후속 질문', { exact: true })).toBeVisible();
  expect(server.reads()).toBe(initial + 1);
  await comments.getByRole('button', { name: '이전 답변 더 보기', exact: true }).click();
  await expect(comments.getByText('이전 페이지의 답변', { exact: true })).toBeVisible();
  await expect(comments.getByText('새로 도착한 후속 질문', { exact: true })).toBeVisible();
});
test('failed comment reads show a retry instead of the stale answer, and recovery does not create a reply', async ({ page, context }) => {
  const server = await backend(context, true); await page.goto('/question-comments-test');
  const comments = page.getByRole('region', { name: '후속 질문과 답변 댓글' });
  await expect(comments.getByRole('alert')).toContainText('댓글을 읽지 못했습니다');
  await expect(page.getByText('목록에 저장된 이전 답변', { exact: true })).toHaveCount(0);
  server.recover(); await comments.getByRole('button', { name: '답변 다시 불러오기', exact: true }).click();
  await expect(comments.getByText('후속 질문: 다음 단계도 설명해 주세요.', { exact: true })).toBeVisible();
  expect(server.writes).toHaveLength(0);
});
