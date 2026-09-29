import { expect, test, type Page } from '@playwright/test';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
async function backend(page: Page, options: { consentFailure?: boolean; marketingFailure?: boolean; readFailure?: boolean; responseLost?: boolean; existing?: boolean } = {}) {
  let consentFailure = options.consentFailure, marketingFailure = options.marketingFailure, readFailure = options.readFailure, responseLost = options.responseLost;
  let stored = options.existing ? { publicName: '기존 공개 별명', message: '기존 응원', revision: id(1) as string | null } : { publicName: '', message: '', revision: null as string | null };
  const operations: string[] = [], writes: { publicName: string; message: string; requestId: string; expectedRevision: string | null }[] = [];
  await page.route('**/synthetic-auth/**', async route => { const signout = route.request().url().endsWith('/signout'); operations.push(signout ? 'signout' : 'consent'); await route.fulfill({ status: !signout && consentFailure ? 503 : 200, json: { ok: true } }); });
  await page.route('**/api/account/marketing-consent', async route => { operations.push('marketing'); await route.fulfill({ status: marketingFailure ? 503 : 200, json: { ok: true } }); });
  await page.route('**/api/platform/encouragement**', async route => {
    if (route.request().method() === 'GET') { operations.push('read'); await route.fulfill(readFailure ? { status: 503, json: { error: '응원 조회 실패' } } : { json: stored }); return; }
    const body = route.request().postDataJSON(); writes.push(body); operations.push('encouragement');
    if (body.requestId !== stored.revision && body.expectedRevision !== stored.revision) { await route.fulfill({ status: 409, json: { error: '다른 화면에서 메시지를 변경했습니다. 저장된 메시지를 다시 불러와 주세요.' } }); return; }
    stored = { publicName: body.publicName, message: body.message, revision: body.requestId };
    if (responseLost) { responseLost = false; await route.abort(); return; }
    await route.fulfill({ json: stored });
  });
  await page.route('**/my?signup=done', route => route.fulfill({ contentType: 'text/html', body: '<h1>가입 완료 목적지</h1>' }));
  await page.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<h1>로그인 화면</h1>' }));
  return { operations, writes, setConsentFailure: (v: boolean) => { consentFailure = v; }, setMarketingFailure: (v: boolean) => { marketingFailure = v; }, setReadFailure: (v: boolean) => { readFailure = v; }, replace: () => { stored = { publicName: '다른 화면 별명', message: '다른 화면 응원', revision: id(50) }; } };
}
const open = (page: Page) => page.goto('/signup-consent-test?next=%2Fmy%3Fsignup%3Ddone');
async function agree(page: Page) {
  await page.getByRole('checkbox', { name: '[필수] 이용약관 동의', exact: true }).check();
  await page.getByRole('checkbox', { name: '[필수] 개인정보처리방침 동의', exact: true }).check();
}
async function write(page: Page) {
  await page.getByRole('checkbox', { name: '[선택] 참가자들에게 응원 메시지 남기기' }).check();
  await page.getByRole('textbox', { name: '공개 별명' }).fill('새 학습 친구');
  await page.getByRole('textbox', { name: '응원 메시지', exact: true }).fill('우리 함께 꾸준히 배워요.');
}
test('optional encouragement waits for required consent and both consent saves before publication', async ({ page }, info) => {
  const server = await backend(page); await open(page); await write(page);
  await expect(page.getByRole('button', { name: '동의하고 가입 완료' })).toBeDisabled(); expect(server.writes).toHaveLength(0);
  await agree(page); expect(server.operations).toEqual(['read']);
  await page.screenshot({ path: info.outputPath('signup-encouragement.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(server.operations).toEqual(['read', 'consent', 'marketing', 'encouragement']); expect(server.writes[0]).toMatchObject({ publicName: '새 학습 친구', message: '우리 함께 꾸준히 배워요.', expectedRevision: null });
});
test('skipping optional message completes signup without reading or publishing an encouragement', async ({ page }) => {
  const server = await backend(page); await open(page); await agree(page); await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible(); expect(server.operations).toEqual(['consent', 'marketing']);
});
test('validation and consent/marketing failures retain input and prevent early publication', async ({ page }) => {
  const server = await backend(page, { consentFailure: true, marketingFailure: true }); await open(page); await write(page); await agree(page);
  await page.getByRole('textbox', { name: '공개 별명' }).fill(''); await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('alert')).toContainText('공개 별명'); expect(server.operations).toEqual(['read']);
  await page.getByRole('textbox', { name: '공개 별명' }).fill('새 친구'); await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('alert')).toContainText('약관 동의를 저장하지 못했습니다'); expect(server.writes).toHaveLength(0);
  server.setConsentFailure(false); await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('alert')).toContainText('마케팅 수신 동의 정보를 저장하지 못했습니다'); expect(server.writes).toHaveLength(0);
  await expect(page.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('우리 함께 꾸준히 배워요.'); server.setMarketingFailure(false);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible(); expect(server.writes).toHaveLength(1);
});
test('publication response loss keeps the form and retries the same request', async ({ page }) => {
  const server = await backend(page, { responseLost: true }); await open(page); await write(page); await agree(page);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page).toHaveURL(/signup-consent-test/); await expect(page.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('우리 함께 꾸준히 배워요.');
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible(); expect(server.writes).toHaveLength(2); expect(server.writes[0]).toEqual(server.writes[1]);
});
test('optional read outage may be skipped; existing saved message is never overwritten by unchanged consent', async ({ page }) => {
  const server = await backend(page, { readFailure: true, existing: true }); await open(page);
  await page.getByRole('checkbox', { name: '[선택] 참가자들에게 응원 메시지 남기기' }).check(); await expect(page.getByRole('alert')).toContainText('응원 조회 실패'); await agree(page);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('alert').last()).toContainText('선택을 해제'); expect(server.operations).toEqual(['read']);
  server.setReadFailure(false); await page.getByRole('button', { name: '저장된 응원 다시 불러오기' }).click(); await expect(page.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('기존 응원');
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible(); expect(server.writes).toHaveLength(0);
});
test('draft survives opt-out and back; cancelling signup never publishes the optional message', async ({ page }) => {
  const server = await backend(page); await open(page); await write(page); const optional = page.getByRole('checkbox', { name: '[선택] 참가자들에게 응원 메시지 남기기' });
  await optional.uncheck(); await optional.check(); await expect(page.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('우리 함께 꾸준히 배워요.');
  await page.getByRole('button', { name: '동의하지 않고 나가기' }).click(); await expect(page.getByRole('heading', { name: '로그인 화면' })).toBeVisible(); expect(server.writes).toHaveLength(0); expect(server.operations).toEqual(['read', 'signout']);
});
test('concurrent save conflict preserves draft until explicit reload or optional skip', async ({ page }) => {
  const server = await backend(page); await open(page); await write(page); await agree(page); server.replace();
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('alert')).toContainText('다른 화면');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: '저장된 응원 다시 불러오기' }).click(); await expect(page.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('우리 함께 꾸준히 배워요.');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '저장된 응원 다시 불러오기' }).click(); await expect(page.getByRole('textbox', { name: '응원 메시지', exact: true })).toHaveValue('다른 화면 응원');
  await page.getByRole('checkbox', { name: '[선택] 참가자들에게 응원 메시지 남기기' }).uncheck(); await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible(); expect(server.writes).toHaveLength(1);
});
