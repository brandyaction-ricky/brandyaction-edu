import { expect, test } from '@playwright/test';

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

test('a learner followup refreshes the lesson list once while the slow list catches up', async ({ page }) => {
  let status = 'answered', reads = 0, writes = 0;
  await page.route('**/api/platform/question-hub**', route => {
    const mode = new URL(route.request().url()).searchParams.get('mode');
    return route.fulfill({ json: mode === 'contexts' ? { contexts: [] } : { answers: [] } });
  });
  await page.route('**/api/platform/lesson-questions?**', async route => {
    reads++;
    // The list response is slower than the updated thread. Abort storms must
    // not starve this request; all requests stay inside the synthetic fixture.
    if (reads > 12) return route.abort();
    const snapshot = status;
    if (writes) await new Promise(resolve => setTimeout(resolve, 200));
    await route.fulfill({ json: { questions: [{ id: id(9), title: '답변 뒤 다시 질문', content: '합성 질문', answer: '먼저 등록된 답변', status: snapshot, mine: true }], hasMore: false } });
  });
  await page.route('**/api/platform/question-thread?**', async route => {
    if (route.request().method() === 'POST') {
      writes++; status = 'open';
      return route.fulfill({ json: { id: route.request().postDataJSON().requestId, questionId: id(9) } });
    }
    return route.fulfill({ json: { question: { id: id(9), title: '답변 뒤 다시 질문', content: '합성 질문', status, headId: id(10), resolved: false, archived: false }, answers: [{ id: id(10), authorName: '합성 멘토', content: '먼저 등록된 답변', createdAt: '2026-10-12T00:00:00Z' }], nextCursor: null, canFollowUp: true } });
  });
  await page.goto('/question-hub-test?lesson=1');
  await page.getByRole('button', { name: '답변 전체 보기', exact: true }).click();
  await page.getByRole('textbox', { name: '후속 질문', exact: true }).fill('답변 뒤 추가로 궁금합니다.');
  await page.getByRole('button', { name: '후속 질문 등록', exact: true }).click();
  await expect(page.getByText('답변 대기', { exact: true })).toBeVisible({ timeout: 3000 });
  expect(writes).toBe(1);
  expect(reads, 'a status change must not repeatedly cancel and restart the lesson list').toBeLessThanOrEqual(4);
  const settledReads = reads;
  await page.getByRole('textbox', { name: '후속 질문', exact: true }).fill('아직 전송하지 않은 초안');
  await expect(page.getByRole('textbox', { name: '후속 질문', exact: true })).toHaveValue('아직 전송하지 않은 초안');
  expect(reads).toBe(settledReads);
});
