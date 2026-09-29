import { expect, test, type Page } from '@playwright/test';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
async function backend(page: Page, options: { readFailure?: boolean; responseLost?: boolean; paginated?: boolean } = {}) {
  let stored: { publicName: string; message: string; revision: string | null } = { publicName: '', message: '', revision: null };
  let readFailure = options.readFailure, responseLost = options.responseLost;
  const writes: { publicName: string; message: string; requestId: string; expectedRevision: string | null }[] = [];
  await page.route('**/api/platform/encouragement**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET') {
      if (url.searchParams.get('mine') === 'true') {
        await route.fulfill(readFailure ? { status: 503, json: { error: '내 메시지를 불러오지 못했습니다.' } } : { json: stored }); return;
      }
      const rows = url.searchParams.has('cursor') ? [{ id: id(30), publicName: '새 친구', message: '더 불러온 응원입니다.' }] : [{ id: id(1), publicName: '학습 친구', message: '오늘도 함께 배워요.' }, { id: id(2), publicName: '도전 친구', message: '작은 도전을 응원해요.' }, ...(stored.message ? [{ id: id(20), publicName: stored.publicName, message: stored.message }] : [])];
      await route.fulfill({ json: { rows, nextCursor: options.paginated && !url.searchParams.has('cursor') ? id(2) : null } }); return;
    }
    const body = route.request().postDataJSON(); writes.push(body);
    if (body.requestId !== stored.revision && body.expectedRevision !== stored.revision) { await route.fulfill({ status: 409, json: { error: '다른 화면에서 메시지를 변경했습니다. 저장된 메시지를 다시 불러와 주세요.' } }); return; }
    stored = { publicName: body.publicName, message: body.message, revision: body.requestId };
    if (responseLost) { responseLost = false; await route.abort(); return; }
    await route.fulfill({ json: stored });
  });
  return { writes, stored: () => stored, setReadFailure: (value: boolean) => { readFailure = value; }, replace: () => { stored = { publicName: '다른 화면 별명', message: '다른 화면 메시지', revision: id(50) }; } };
}
test('explicit public nickname, literal preview, save, reload and withdrawal update the wall', async ({ page }, info) => {
  const server = await backend(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/member-encouragement-test');
  const editor = page.getByRole('region', { name: '내 응원 메시지' }), wall = page.getByRole('region', { name: '참가자 응원 메시지' });
  const message = editor.getByRole('textbox', { name: '응원 메시지', exact: true }), name = editor.getByRole('textbox', { name: '공개 별명' });
  await expect(message).toBeEnabled(); await message.fill('꾸준히 성장해요. <img src=x onerror=alert(1)>');
  await editor.getByRole('button', { name: '응원 메시지 저장' }).click(); await expect(editor.getByRole('alert')).toContainText('공개 별명'); expect(server.writes).toHaveLength(0);
  await name.fill('공개 학습 친구'); await editor.getByRole('button', { name: '응원 메시지 저장' }).click(); await expect(editor.getByRole('status')).toHaveText('응원 메시지를 공개했습니다.');
  await expect(wall).toContainText('1 / 3'); await wall.getByRole('button', { name: '이전 응원' }).click(); await expect(wall.locator('blockquote')).toContainText('<img src=x onerror=alert(1)>'); await expect(wall.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath('member-encouragement.png'), fullPage: true });
  await page.reload(); await expect(message).toHaveValue(server.stored().message); await message.fill(''); await editor.getByRole('button', { name: '응원 메시지 저장' }).click();
  await expect(editor.getByRole('status')).toHaveText('응원 메시지 공개를 해제했습니다.'); await expect(wall).toContainText('1 / 2'); await expect(wall).not.toContainText('공개 학습 친구');
  await expect(page.getByRole('heading', { name: '기존 학습 본문' })).toBeVisible();
});
test('own read failure blocks writing and response-loss retry keeps the same request identity', async ({ page }) => {
  const server = await backend(page, { readFailure: true, responseLost: true }); await page.goto('/member-encouragement-test');
  const editor = page.getByRole('region', { name: '내 응원 메시지' });
  await expect(editor.getByRole('alert')).toHaveText('내 메시지를 불러오지 못했습니다.'); await expect(editor.getByRole('button', { name: '응원 메시지 저장' })).toBeDisabled();
  server.setReadFailure(false); await editor.getByRole('button', { name: '저장된 메시지 다시 불러오기' }).click();
  await editor.getByRole('textbox', { name: '공개 별명' }).fill('응원 친구'); await editor.getByRole('textbox', { name: '응원 메시지', exact: true }).fill('함께 계속해요'); await editor.getByRole('button', { name: '응원 메시지 저장' }).click();
  await expect(editor.getByRole('alert')).toBeVisible(); await expect(editor.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('함께 계속해요');
  await editor.getByRole('button', { name: '응원 메시지 저장' }).click(); await expect(editor.getByRole('status')).toHaveText('응원 메시지를 공개했습니다.'); expect(server.writes).toHaveLength(2); expect(server.writes[1]).toEqual(server.writes[0]);
});
test('conflict and cancelled reload/navigation preserve draft, explicit reload adopts latest', async ({ page }) => {
  const server = await backend(page); await page.goto('/member-encouragement-test'); const editor = page.getByRole('region', { name: '내 응원 메시지' });
  await editor.getByRole('textbox', { name: '공개 별명' }).fill('내 별명'); await editor.getByRole('textbox', { name: '응원 메시지', exact: true }).fill('작성 중인 문구'); server.replace();
  await editor.getByRole('button', { name: '응원 메시지 저장' }).click(); await expect(editor.getByRole('alert')).toContainText('다른 화면');
  page.once('dialog', dialog => dialog.dismiss()); await editor.getByRole('button', { name: '저장된 메시지 다시 불러오기' }).click(); await expect(editor.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('작성 중인 문구');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('link', { name: '다른 화면', exact: true }).click(); await expect(page).toHaveURL(/member-encouragement-test/);
  page.once('dialog', dialog => dialog.accept()); await editor.getByRole('button', { name: '저장된 메시지 다시 불러오기' }).click(); await expect(editor.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('다른 화면 메시지');
});
test('reduced motion pauses rotation, accessible paging reaches additional messages', async ({ page }) => {
  await backend(page, { paginated: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.install(); await page.goto('/member-encouragement-test');
  const wall = page.getByRole('region', { name: '참가자 응원 메시지' }); await expect(wall.getByRole('button', { name: '자동 넘김 시작' })).toBeVisible();
  await page.clock.fastForward(6000); await expect(wall.locator('blockquote')).toContainText('오늘도 함께 배워요.');
  await wall.getByRole('button', { name: '응원 더 불러오기' }).click(); await expect(wall).toContainText('1 / 3'); await expect(wall.getByRole('button', { name: '응원 더 불러오기' })).toHaveCount(0);
  await wall.getByRole('button', { name: '이전 응원' }).click(); await expect(wall.locator('blockquote')).toContainText('더 불러온 응원입니다.');
  await wall.getByRole('button', { name: '다음 응원' }).click(); await expect(wall.locator('blockquote')).toContainText('오늘도 함께 배워요.');
  await wall.getByRole('button', { name: '자동 넘김 시작' }).click(); await page.getByRole('heading', { name: '기존 학습 본문' }).click(); await page.mouse.move(0, 0); await page.clock.fastForward(5100); await expect(wall.locator('blockquote')).toContainText('작은 도전을 응원해요.');
});
