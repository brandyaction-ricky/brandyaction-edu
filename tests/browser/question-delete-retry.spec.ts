import { test, expect, type Page } from '@playwright/test';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
async function question(page: Page) {
  await page.route('**/api/platform/question-hub?**', route => {
    const mode = new URL(route.request().url()).searchParams.get('mode');
    return route.fulfill({ json: mode === 'contexts' ? { contexts: [] } : { questions: [{ id: id(9), title: '정리할 내 질문', content: '합성 본문', mine: true, status: 'answered' }], hasMore: false } });
  });
  await page.goto('/question-hub-test');
  await expect(page.getByRole('heading', { name: '정리할 내 질문' })).toBeVisible();
}
test('uncertain deletion keeps the same request and ignores repeated clicks while the request is pending', async ({ page }) => {
  const writes: unknown[] = []; let finish: (() => void) | undefined;
  await page.route('**/api/platform/question-delete?**', r => r.fulfill({ json: { supported: true, canDelete: true, headId: id(10) } }));
  await page.route('**/api/platform/question-delete', async r => {
    writes.push(r.request().postDataJSON());
    if (writes.length === 1) { await new Promise<void>(resolve => { finish = resolve; }); return r.fulfill({ status: 503, json: { error: '결과 확인이 필요합니다.' } }); }
    return r.fulfill({ json: { id: id(9), deletedAt: new Date().toISOString() } });
  });
  await question(page); await page.getByRole('button', { name: '질문 삭제', exact: true }).click();
  const dialog = page.getByRole('dialog'), remove = dialog.getByRole('button', { name: '질문 삭제', exact: true });
  await expect(remove).toBeEnabled();
  await remove.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => writes.length).toBe(1); await expect(dialog.getByRole('button', { name: '취소' })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  finish!(); await expect(dialog.getByRole('alert')).toContainText('결과 확인');
  await dialog.getByRole('button', { name: '삭제 결과 다시 확인' }).click();
  expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]); await expect(dialog).not.toBeVisible();
});
test('new answers require a fresh permission read and confirmation before retrying deletion', async ({ page }) => {
  const writes: unknown[] = []; let reads = 0;
  await page.route('**/api/platform/question-delete?**', r => r.fulfill({ json: { supported: true, canDelete: true, headId: id(10 + reads++) } }));
  await page.route('**/api/platform/question-delete', r => {
    writes.push(r.request().postDataJSON());
    return r.fulfill(writes.length === 1 ? { status: 409, json: { error: '새 답변이 등록됐습니다.' } } : { json: { id: id(9), deletedAt: new Date().toISOString() } });
  });
  await question(page); await page.getByRole('button', { name: '질문 삭제', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: '질문 삭제', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('새 답변');
  await dialog.getByRole('button', { name: '다시 확인', exact: true }).click();
  await dialog.getByRole('button', { name: '질문 삭제', exact: true }).click();
  expect(writes).toEqual([{ questionId: id(9), expectedHeadId: id(10) }, { questionId: id(9), expectedHeadId: id(11) }]);
});
test('an older database shows an unavailable deletion control without attempting a mutation', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/platform/question-delete?**', r => r.fulfill({ json: { supported: false, canDelete: false } }));
  await page.route('**/api/platform/question-delete', r => { writes++; return r.fulfill({ status: 500 }); });
  await question(page); await page.getByRole('button', { name: '질문 삭제', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('질문 삭제 기능을 준비하고 있습니다.');
  await expect(dialog.getByRole('button', { name: '질문 삭제', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '취소' }).click(); expect(writes).toBe(0);
});
