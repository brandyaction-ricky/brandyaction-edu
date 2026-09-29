import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
let sample: Buffer;
test.beforeAll(async () => { sample = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#05784e' } }).png().toBuffer(); });
const state = (custom = false, revision: string | null = null) => ({ revision, custom, icon: custom ? '/test-custom-icon.png' : '/icons/edu-192.png', apple: '/icons/edu-apple-180.png', icons: [{ src: '/icons/edu-192.png' }, { src: '/icons/edu-512.png' }, { src: custom ? '/test-custom-icon.png' : '/icons/edu-maskable-512.png' }] });
async function fixture(page: Page, options: { custom?: boolean; failOnce?: boolean; conflict?: boolean; forbidden?: boolean; outage?: boolean } = {}) {
  let stored = state(options.custom, options.custom ? id(1) : null), failed = false, outage = options.outage;
  const writes: { id: string; expected: string; action: string; filename: string }[] = [];
  await page.route('**/test-custom-icon.png', route => route.fulfill({ contentType: 'image/png', body: sample }));
  await page.route('**/api/admin/app-branding', async route => {
    if (options.forbidden) { await route.fulfill({ status: 403, json: { error: '앱 아이콘은 관리자만 변경할 수 있습니다.' } }); return; }
    if (route.request().method() === 'GET') { if (outage) { await route.fulfill({ status: 503, json: { error: '아이콘을 불러오지 못했습니다.' } }); } else await route.fulfill({ json: stored }); return; }
    const body = await new Response(Uint8Array.from(route.request().postDataBuffer() || []), { headers: { 'content-type': route.request().headers()['content-type'] } }).formData();
    const file = body.get('file') as File | null;
    writes.push({ id: String(body.get('requestId')), expected: String(body.get('expectedRevision')), action: String(body.get('action')), filename: file?.name || '' });
    if (options.conflict) { stored = state(true, id(9)); await route.fulfill({ status: 409, json: { error: '다른 화면에서 아이콘을 변경했습니다. 최신 설정을 다시 불러와 주세요.' } }); return; }
    stored = state(body.get('action') === 'replace', String(body.get('requestId')));
    if (options.failOnce && !failed) { failed = true; await route.abort('failed'); return; }
    await route.fulfill({ json: stored });
  });
  return { writes, recover: () => { outage = false; }, saved: () => stored };
}
const select = (page: Page) => page.getByLabel('새 아이콘 이미지').setInputFiles({ name: 'new-icon.png', mimeType: 'image/png', buffer: sample });
test('image selection previews without a write; explicit save persists across reopen and reset waits for save', async ({ page }, info) => {
  const h = await fixture(page); await page.goto('/app-branding-test'); await expect(page.getByRole('button', { name: '앱 아이콘 저장', exact: true })).toBeDisabled();
  await select(page); await expect(page.getByText('미리보기입니다.', { exact: false })).toBeVisible(); expect(h.writes).toHaveLength(0);
  expect(await page.getByLabel('새 아이콘 이미지').evaluate(input => (input as HTMLInputElement).files?.[0]?.name)).toBe('new-icon.png');
  await expect(page.getByAltText('사각형 앱 아이콘 미리보기')).toHaveAttribute('src', /^blob:/); await expect(page.getByAltText('사각형 앱 아이콘 미리보기')).toHaveJSProperty('naturalWidth', 512);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('app-branding-preview.png'), fullPage: true });
  await page.getByRole('button', { name: '앱 아이콘 저장', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('새 앱 아이콘을 저장했습니다.'); expect(h.writes[0]).toMatchObject({ action: 'replace', expected: '', filename: 'new-icon.png' });
  await page.reload(); await expect(page.getByText('등록한 아이콘을 사용 중입니다.')).toBeVisible(); await expect(page.getByAltText('사각형 앱 아이콘 미리보기')).toHaveAttribute('src', '/test-custom-icon.png');
  await page.getByRole('button', { name: '기본 아이콘으로 되돌리기' }).click(); expect(h.writes).toHaveLength(1); await page.getByRole('button', { name: '앱 아이콘 저장', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('기본 앱 아이콘으로 되돌렸습니다.'); expect(h.writes[1].action).toBe('reset'); expect(h.writes[1].expected).toBe(h.writes[0].id); expect(h.writes[1].filename).toBe('');
});
test('invalid type and size cannot save; cancel keeps the currently stored icon and emits no write', async ({ page }) => {
  const h = await fixture(page, { custom: true }); await page.goto('/app-branding-test'); await expect(page.getByText('등록한 아이콘을 사용 중입니다.')).toBeVisible();
  await select(page); await page.getByLabel('새 아이콘 이미지').setInputFiles({ name: 'icon.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') }); await expect(page.getByRole('alert')).toContainText('PNG, JPG, WEBP'); await expect(page.getByRole('button', { name: '앱 아이콘 저장', exact: true })).toBeDisabled();
  await page.getByLabel('새 아이콘 이미지').setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) }); await expect(page.getByRole('alert')).toContainText('2MB');
  await select(page); await page.getByRole('button', { name: '변경 취소', exact: true }).click(); await expect(page.getByAltText('사각형 앱 아이콘 미리보기')).toHaveAttribute('src', '/test-custom-icon.png'); expect(h.writes).toHaveLength(0);
});
test('lost save response preserves the chosen image and retries the same request ID', async ({ page }) => {
  const h = await fixture(page, { failOnce: true }); await page.goto('/app-branding-test'); await expect(page.getByLabel('새 아이콘 이미지')).toBeEnabled(); await select(page);
  await page.getByRole('button', { name: '앱 아이콘 저장', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByAltText('사각형 앱 아이콘 미리보기')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: '앱 아이콘 저장', exact: true }).click(); await expect(page.getByRole('status')).toContainText('저장했습니다'); expect(h.writes).toHaveLength(2); expect(h.writes[0].id).toBe(h.writes[1].id);
});
test('concurrent admin change stays visible as a conflict and reload can be cancelled without losing the preview', async ({ page }) => {
  const h = await fixture(page, { conflict: true }); await page.goto('/app-branding-test'); await expect(page.getByLabel('새 아이콘 이미지')).toBeEnabled(); await select(page);
  await page.getByRole('button', { name: '앱 아이콘 저장', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('다른 화면');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: '저장된 아이콘 다시 불러오기' }).click(); await expect(page.getByAltText('사각형 앱 아이콘 미리보기')).toHaveAttribute('src', /^blob:/);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '저장된 아이콘 다시 불러오기' }).click(); await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByText('등록한 아이콘을 사용 중입니다.')).toBeVisible(); expect(h.saved().revision).toBe(id(9)); expect(h.writes).toHaveLength(1);
});
test('read failure has a retry and a non-admin cannot select or save files', async ({ page }) => {
  const h = await fixture(page, { outage: true }); await page.goto('/app-branding-test'); await expect(page.getByRole('alert')).toContainText('불러오지 못했습니다'); await expect(page.getByLabel('새 아이콘 이미지')).toBeDisabled();
  h.recover(); await page.getByRole('button', { name: '저장된 아이콘 다시 불러오기' }).click(); await expect(page.getByLabel('새 아이콘 이미지')).toBeEnabled();
  await page.unroute('**/api/admin/app-branding'); await fixture(page, { forbidden: true }); await page.reload(); await expect(page.getByRole('alert')).toContainText('관리자만'); await expect(page.getByLabel('새 아이콘 이미지')).toBeDisabled();
});
