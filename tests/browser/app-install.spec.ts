import { test, expect, type Page } from '@playwright/test';
type TestWindow = Window & typeof globalThis & { eduPromptCalls: number; eduPermissionCalls: number; eduGesture: boolean; eduPromptResolve?: (value: { outcome: string }) => void };
async function setup(page: Page, options: { ios?: boolean; ipad?: boolean; embedded?: boolean; standalone?: boolean; blockedStorage?: boolean } = {}) {
  await page.addInitScript(options => {
    const state = window as TestWindow; state.eduPromptCalls = 0; state.eduPermissionCalls = 0;
    if (options.ios || options.ipad) Object.defineProperty(navigator, 'userAgent', { value: options.ios ? 'Mozilla/5.0 (iPhone) Safari/605.1' : 'Mozilla/5.0 (Macintosh) Safari/605.1' });
    if (options.ipad) { Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }); Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 }); }
    if (options.embedded) Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android) KAKAOTALK' });
    if (options.standalone) Object.defineProperty(navigator, 'standalone', { value: true });
    if (options.blockedStorage) { Storage.prototype.getItem = () => { throw Error('Unavailable'); }; Storage.prototype.setItem = () => { throw Error('Unavailable'); }; }
    Notification.requestPermission = async () => { state.eduPermissionCalls++; return 'denied'; };
  }, options);
}
async function offer(page: Page, outcome: 'accepted' | 'dismissed' | 'error' | 'pending') {
  return page.evaluate(outcome => {
    const state = window as TestWindow, event = new Event('beforeinstallprompt', { cancelable: true });
    const choice = outcome === 'pending' ? new Promise(resolve => { state.eduPromptResolve = resolve; }) : Promise.resolve({ outcome });
    Object.defineProperties(event, { userChoice: { value: choice }, prompt: { value: async () => { state.eduPromptCalls++; state.eduGesture = navigator.userActivation.isActive; if (outcome === 'error') throw Error('Unavailable'); } } });
    window.dispatchEvent(event); return event.defaultPrevented;
  }, outcome);
}
const panel = (page: Page) => page.getByRole('region', { name: '브랜디에듀 홈 화면 추가' });
test('install prompt waits for an explicit click, survives menu changes, and completion hides the offer', async ({ page }, info) => {
  const writes: string[] = []; page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()); });
  await setup(page); await page.goto('/app-install-test'); await expect(panel(page)).toBeVisible(); await expect(page.getByRole('button', { name: '브랜디에듀 설치' })).toHaveCount(0);
  await page.getByRole('button', { name: '시험 내 클래스' }).click(); expect(await offer(page, 'dismissed')).toBe(true); await page.getByRole('button', { name: '시험 마이페이지' }).click();
  await expect(page.getByRole('button', { name: '브랜디에듀 설치' })).toBeVisible(); expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(0);
  await page.getByRole('button', { name: '브랜디에듀 설치' }).click(); await expect(panel(page)).toContainText('설치를 취소했습니다'); expect(await page.evaluate(() => (window as TestWindow).eduGesture)).toBe(true);
  await offer(page, 'accepted'); await page.getByRole('button', { name: '브랜디에듀 설치' }).click(); await expect(panel(page)).toContainText('설치를 요청했습니다');
  await expect(panel(page)).not.toContainText('설치 완료'); await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('app-install-desktop.png'), fullPage: false });
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled'))); await expect(panel(page)).toHaveCount(0); await page.getByRole('button', { name: '시험 회원 정보' }).click(); await expect(page.getByRole('region', { name: '앱 사용 상태' })).toContainText('설치가 확인되었습니다');
  expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0); expect(writes).toHaveLength(0);
});
for (const device of ['ios', 'ipad'] as const) test(`${device} gets manual Home Screen instructions and no automatic permission prompt`, async ({ page }, info) => {
  await setup(page, { [device]: true }); await page.goto('/app-install-test'); await expect(panel(page)).toContainText('Safari'); await expect(panel(page)).toContainText('동작 편집'); await expect(panel(page)).toContainText('웹 앱으로 열기');
  await expect(panel(page)).toContainText('인터넷 연결'); await expect(page.getByRole('button', { name: '브랜디에듀 설치' })).toHaveCount(0);
  await expect(panel(page).locator('img')).toHaveJSProperty('naturalWidth', 192); await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('app-install-apple.png'), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth)); expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0);
});
test('embedded browser shows a clean launch URL and copy failure leaves manual instructions available', async ({ page }) => {
  await setup(page, { embedded: true }); await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('Not permitted'); } } }); });
  await page.goto('/app-install-test?token=synthetic-only'); await expect(panel(page)).toContainText('외부 브라우저로 열기'); await expect(panel(page)).toContainText('Chrome');
  await expect(page.getByLabel('설치할 사이트 주소')).toHaveValue(new URL('/my', page.url()).href); await page.getByRole('button', { name: '사이트 주소 복사' }).click(); await expect(panel(page)).toContainText('직접 복사');
  await offer(page, 'accepted'); await expect(page.getByRole('button', { name: '브랜디에듀 설치' })).toHaveCount(0);
});
test('later persists for seven days while settings always retains installation instructions', async ({ page }) => {
  await setup(page); await page.clock.install({ time: new Date('2026-09-29T02:00Z') }); await page.goto('/app-install-test'); await panel(page).getByRole('button', { name: '나중에 · 7일 동안 접기' }).click(); await expect(panel(page)).toHaveCount(0);
  await page.getByRole('button', { name: '시험 회원 정보' }).click(); await expect(panel(page)).toBeVisible(); await page.getByRole('button', { name: '시험 마이페이지' }).click(); await expect(panel(page)).toHaveCount(0);
  await page.reload(); await expect(panel(page)).toHaveCount(0); await page.clock.setSystemTime(new Date('2026-10-07T02:00Z')); await page.reload(); await expect(panel(page)).toBeVisible();
});
test('installed app suppresses the offer and disabled feature does not intercept native install events', async ({ page }) => {
  await setup(page, { standalone: true }); await page.goto('/app-install-test'); await expect(panel(page)).toHaveCount(0); await page.getByRole('button', { name: '시험 회원 정보' }).click(); await expect(page.getByRole('region', { name: '앱 사용 상태' })).toBeVisible();
  await page.goto('/app-install-test?off'); await page.getByRole('button', { name: '시험 회원 정보' }).click(); await expect(panel(page)).toHaveCount(0); await expect(page.getByRole('region', { name: '앱 사용 상태' })).toHaveCount(0); expect(await offer(page, 'accepted')).toBe(false);
});
test('prompt errors and storage denial never block existing learning or cause repeated prompting', async ({ page }) => {
  await setup(page, { blockedStorage: true }); await page.goto('/app-install-test'); await expect(panel(page)).toBeVisible(); await offer(page, 'error'); await page.getByRole('button', { name: '브랜디에듀 설치' }).click(); await expect(panel(page)).toContainText('설치 창을 열지 못했습니다');
  await expect(panel(page).getByText('브라우저 메뉴에서 추가하는 방법')).toBeVisible(); expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(1);
  await panel(page).getByRole('button', { name: '나중에 · 7일 동안 접기' }).click(); await expect(panel(page)).toHaveCount(0); await page.getByRole('button', { name: '시험 내 클래스' }).click(); await expect(page.getByRole('heading', { name: '내 클래스', exact: true })).toBeVisible();
});
