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
  await setup(page); await page.goto('/app-install-test'); await expect(panel(page)).toBeVisible(); await expect(page.getByRole('button', { name: '아이콘 추가하기' })).toHaveCount(0);
  await page.getByRole('button', { name: '시험 내 클래스' }).click(); expect(await offer(page, 'dismissed')).toBe(true); await page.getByRole('button', { name: '시험 마이페이지' }).click();
  await expect(page.getByRole('button', { name: '아이콘 추가하기' })).toBeVisible(); expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(0);
  await page.getByRole('button', { name: '아이콘 추가하기' }).click(); await expect(panel(page)).toContainText('설치를 취소했습니다'); expect(await page.evaluate(() => (window as TestWindow).eduGesture)).toBe(true);
  await offer(page, 'accepted'); await page.getByRole('button', { name: '아이콘 추가하기' }).click(); await expect(panel(page)).toContainText('설치를 요청했습니다');
  await expect(panel(page)).not.toContainText('설치 완료'); await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('app-install-desktop.png'), fullPage: false });
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled'))); await expect(panel(page)).toHaveCount(0); await page.getByRole('button', { name: '시험 회원 정보' }).click(); await expect(page.getByRole('region', { name: '앱 사용 상태' })).toContainText('설치가 확인되었습니다');
  expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0); expect(writes).toHaveLength(0);
});
for (const device of ['ios', 'ipad'] as const) test(`${device} gets manual Home Screen instructions and no automatic permission prompt`, async ({ page }, info) => {
  await setup(page, { [device]: true }); await page.goto('/app-install-test'); await panel(page).getByRole('button', { name: '앱 추가 방법 보기' }).click(); await expect(panel(page)).toContainText('Safari'); await panel(page).getByRole('button', { name: '다음 단계' }).click(); await expect(panel(page)).toContainText('공유 버튼'); await panel(page).getByRole('button', { name: '다음 단계' }).click(); await expect(panel(page)).toContainText('동작 편집'); await panel(page).getByRole('button', { name: '다음 단계' }).click(); await expect(panel(page)).toContainText('웹 앱으로 열기');
  await expect(panel(page)).toContainText('인터넷 연결'); await expect(page.getByRole('button', { name: '아이콘 추가하기' })).toHaveCount(0);
  await expect(panel(page).locator('.app-install-heading img')).toHaveJSProperty('naturalWidth', 192); await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('app-install-apple.png'), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth)); expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0);
});
test('embedded browser shows a clean launch URL and copy failure leaves manual instructions available', async ({ page }) => {
  await setup(page, { embedded: true }); await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('Not permitted'); } } }); });
  await page.goto('/app-install-test?token=synthetic-only'); await expect(panel(page)).toContainText('외부 브라우저로 열기'); await panel(page).getByRole('button', { name: '앱 추가 방법 보기' }).click(); await expect(panel(page)).toContainText('Chrome');
  await expect(page.getByLabel('설치할 사이트 주소')).toHaveValue(new URL('/my', page.url()).href); await page.getByRole('button', { name: '사이트 주소 복사' }).click(); await expect(panel(page)).toContainText('직접 복사');
  await offer(page, 'accepted'); await expect(page.getByRole('button', { name: '아이콘 추가하기' })).toHaveCount(0);
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
  await setup(page, { blockedStorage: true }); await page.goto('/app-install-test'); await expect(panel(page)).toBeVisible(); await offer(page, 'error'); await page.getByRole('button', { name: '아이콘 추가하기' }).click(); await expect(panel(page)).toContainText('설치 창을 열지 못했어요');
  await expect(panel(page).getByRole('button', { name: '앱 추가 방법 보기' })).toBeVisible(); expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(1);
  await panel(page).getByRole('button', { name: '나중에 · 7일 동안 접기' }).click(); await expect(panel(page)).toHaveCount(0); await page.getByRole('button', { name: '시험 내 클래스' }).click(); await expect(page.getByRole('heading', { name: '내 클래스', exact: true })).toBeVisible();
});

test('one action at a time, device changes restart and completion explains finding the icon without claiming installation', async ({ page }, info) => {
  await setup(page); await page.goto('/app-install-test');
  const help = panel(page).getByRole('button', { name: '앱 추가 방법 보기' });
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page)).toContainText('앱스토어·플레이스토어에서 찾지 마세요');
  await help.focus(); await page.keyboard.press('Enter');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await panel(page).getByRole('button', { name: '아이폰·아이패드' }).click();
  const next = panel(page).getByRole('button', { name: '다음 단계' });
  await expect(panel(page).getByRole('heading', { level: 3 })).toHaveText('사파리로 브랜디에듀를 열어요');
  await expect(panel(page).getByRole('button', { name: '이전', exact: true })).toBeDisabled();
  await next.click(); await expect(panel(page).getByRole('heading', { level: 3 })).toHaveText('공유 버튼을 눌러요');
  await expect(panel(page).getByRole('heading', { level: 3 })).toBeFocused();
  await panel(page).screenshot({ path: info.outputPath('simple-iphone-share.png'), animations: 'disabled' });
  await panel(page).getByRole('button', { name: '이전', exact: true }).click();
  await expect(panel(page)).toContainText('1 / 4');
  await next.click(); await next.click(); await expect(panel(page)).toContainText('동작 편집');
  await panel(page).getByRole('button', { name: '갤럭시·안드로이드' }).click();
  await expect(panel(page)).toContainText('1 / 4'); await expect(panel(page)).toContainText('Chrome(크롬)');
  for (let i = 0; i < 3; i++) await next.click();
  await expect(panel(page)).toContainText('작은 창에서 ‘설치’를 눌러요');
  await panel(page).getByRole('button', { name: '아이콘 찾는 법 보기' }).click();
  await expect(panel(page)).toContainText('내 강의는 ‘내 클래스’');
  await expect(panel(page)).toContainText('앱 목록에서도 찾아보세요');
  await expect(page.getByRole('region', { name: '앱 사용 상태' })).toHaveCount(0);
  await panel(page).getByRole('button', { name: '처음부터 다시 보기' }).click(); await expect(panel(page)).toContainText('1 / 4');
  await help.click(); await expect(help).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(0);
  expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0);
});

test('actual desktop photo enlarges with keyboard and Escape restores focus, browser changes reset the steps', async ({ page }, info) => {
  await setup(page); await page.goto('/app-install-test'); await panel(page).getByRole('button', { name: '앱 추가 방법 보기' }).click();
  const next = panel(page).getByRole('button', { name: '다음 단계' });
  await next.click(); await next.click();
  const enlarge = panel(page).getByRole('button', { name: 'Chrome에서 ‘페이지를 앱으로 설치’ 찾기 크게 보기', exact: true });
  await expect.poll(() => enlarge.locator('img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 1100)).toBe(true);
  await enlarge.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Chrome에서 ‘페이지를 앱으로 설치’ 찾기', exact: true });
  await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(enlarge).toBeFocused();
  await next.click(); await panel(page).getByRole('button', { name: 'Chrome 설치 창에서 사이트 확인하기 크게 보기' }).click();
  await page.getByRole('button', { name: '사진 닫기', exact: true }).click();
  await panel(page).getByLabel('사용할 인터넷 앱').selectOption('edge'); await expect(panel(page)).toContainText('1 / 4');
  await next.click(); await next.click(); await expect(panel(page)).toContainText('이 사이트를 앱으로 설치');
  await panel(page).getByLabel('사용할 인터넷 앱').selectOption('safari'); await expect(panel(page)).toContainText('1 / 4');
  await next.click(); await next.click(); await expect(panel(page)).toContainText('Dock에 추가');
  await panel(page).screenshot({ path: info.outputPath('simple-install-computer.png'), animations: 'disabled' });
});

test('store, account and connection questions are explained without overwhelming the guide or leaking URL parameters', async ({ page }) => {
  await setup(page); await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
  await page.goto('/app-install-test?token=synthetic-only'); await panel(page).getByRole('button', { name: '앱 추가 방법 보기' }).click();
  await panel(page).getByRole('button', { name: '주소 복사', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(new URL('/my', page.url()).href);
  await panel(page).getByText('앱스토어에서 검색해도 안 나와요', { exact: true }).click(); await expect(panel(page)).toContainText('다운로드하는 앱이 아니에요');
  await panel(page).getByText('새로 가입하거나 결제해야 하나요?', { exact: true }).click(); await expect(panel(page)).toContainText('수강 신청할 때 쓴 계정');
  await panel(page).getByText('아이콘을 추가하면 인터넷 없이도 볼 수 있나요?', { exact: true }).click(); await expect(panel(page)).toContainText('인터넷 연결이 필요해요');
});

test('small phone width keeps actions readable and removes oversized illustrative share graphics', async ({ page }, info) => {
  await setup(page, { ios: true }); await page.setViewportSize({ width: 320, height: 740 }); await page.goto('/app-install-test');
  await panel(page).getByRole('button', { name: '앱 추가 방법 보기' }).click(); await panel(page).getByRole('button', { name: '다음 단계' }).click();
  await expect(panel(page).locator('img[src$=".svg"]')).toHaveCount(0);
  await panel(page).screenshot({ path: info.outputPath('simple-install-320.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(panel(page).getByRole('button', { name: '다음 단계' })).toBeVisible();
});
