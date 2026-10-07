import { test, expect, type Page } from '@playwright/test';
type TestWindow = Window & typeof globalThis & { eduPromptCalls: number; eduPermissionCalls: number; eduGesture: boolean; eduPromptResolve?: (value: { outcome: string }) => void };
async function setup(page: Page, options: { ios?: boolean; ipad?: boolean; embedded?: boolean; standalone?: boolean; blockedStorage?: boolean; ua?: string } = {}) {
  await page.addInitScript(options => {
    const state = window as TestWindow; state.eduPromptCalls = 0; state.eduPermissionCalls = 0; Object.defineProperty(navigator, 'userAgent', { configurable: true, value: options.ua || 'Mozilla/5.0 Chrome/140.0 Safari/537.36' });
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
  const nextIosStep = () => panel(page).getByRole('button', { name: '다음 단계' }).click();
  await setup(page, { [device]: true }); await page.goto('/app-install-test'); await panel(page).getByRole('button', { name: '그림 보며 따라 하기' }).click(); await expect(panel(page)).toContainText('Chrome'); await panel(page).getByRole('button', { name: '다음 단계' }).click(); await expect(panel(page)).toContainText('평소 쓰던 계정'); await panel(page).getByRole('button', { name: '다음 단계' }).click(); await expect(panel(page)).toContainText('공유 버튼'); await panel(page).getByRole('button', { name: '다음 단계' }).click(); await expect(panel(page)).toContainText('공유 창에서 ‘더 보기’'); await nextIosStep(); await expect(panel(page)).toContainText('동작 편집'); await panel(page).getByRole('button', { name: '다음 단계' }).click(); await expect(panel(page)).toContainText('웹 앱으로 열기');
  await expect(panel(page)).toContainText('인터넷 연결'); await expect(page.getByRole('button', { name: '아이콘 추가하기' })).toHaveCount(0);
  await expect(panel(page).locator('.app-install-heading img')).toHaveJSProperty('naturalWidth', 192); await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('app-install-apple.png'), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth)); expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0);
});
test('embedded browser shows a clean launch URL and copy failure leaves manual instructions available', async ({ page }) => {
  await setup(page, { embedded: true }); await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('Not permitted'); } } }); });
  await page.goto('/app-install-test?token=synthetic-only'); await expect(panel(page)).toContainText('먼저 Chrome(크롬)으로 열어 주세요'); await panel(page).getByRole('button', { name: '그림 보며 따라 하기' }).click(); await expect(panel(page)).toContainText('Chrome');
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
  await expect(panel(page).getByRole('button', { name: '그림 보며 따라 하기' })).toBeVisible(); expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(1);
  await panel(page).getByRole('button', { name: '나중에 · 7일 동안 접기' }).click(); await expect(panel(page)).toHaveCount(0); await page.getByRole('button', { name: '시험 내 클래스' }).click(); await expect(page.getByRole('heading', { name: '내 클래스', exact: true })).toBeVisible();
});

test('one action at a time, device changes restart and completion explains finding the icon without claiming installation', async ({ page }, info) => {
  await setup(page); await page.goto('/app-install-test');
  const help = panel(page).getByRole('button', { name: '그림 보며 따라 하기' });
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page)).toContainText('브랜디에듀는 스토어에서 받는 앱이 아니에요');
  await help.focus(); await page.keyboard.press('Enter');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await panel(page).getByRole('button', { name: '아이폰·아이패드' }).click();
  const next = panel(page).getByRole('button', { name: '다음 단계' });
  await expect(panel(page).getByRole('heading', { level: 3 })).toHaveText('크롬으로 브랜디에듀를 열어요');
  await expect(panel(page).getByRole('button', { name: '이전', exact: true })).toBeDisabled();
  await next.click(); await expect(panel(page).getByRole('heading', { level: 3 })).toHaveText('평소 쓰던 계정으로 로그인해요'); await next.click(); await expect(panel(page).getByRole('heading', { level: 3 })).toHaveText('주소 칸 옆의 공유 버튼을 눌러요');
  await expect(panel(page).getByRole('heading', { level: 3 })).toBeFocused();
  await panel(page).screenshot({ path: info.outputPath('simple-iphone-share.png'), animations: 'disabled' });
  await panel(page).getByRole('button', { name: '이전', exact: true }).click(); await panel(page).getByRole('button', { name: '이전', exact: true }).click();
  await expect(panel(page)).toContainText('1 / 6');
  await next.click(); await next.click(); await next.click(); await expect(panel(page)).toContainText('공유 창에서 ‘더 보기’'); await next.click(); await expect(panel(page)).toContainText('동작 편집');
  await panel(page).getByRole('button', { name: '갤럭시·안드로이드' }).click();
  await expect(panel(page)).toContainText('1 / 5'); await expect(panel(page)).toContainText('Chrome(크롬)');
  for (let i = 0; i < 4; i++) await next.click();
  await expect(panel(page)).toContainText('설치 창의 ‘설치’를 눌러요');
  await panel(page).getByRole('button', { name: '아이콘 찾는 법 보기' }).click();
  await expect(panel(page)).toContainText('‘내 클래스’에서 강의를');
  await expect(panel(page)).toContainText('앱 목록에서도 찾아보세요');
  await expect(page.getByRole('region', { name: '앱 사용 상태' })).toHaveCount(0);
  await panel(page).getByRole('button', { name: '처음부터 다시 보기' }).click(); await expect(panel(page)).toContainText('1 / 5');
  await help.click(); await expect(help).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(0);
  expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0);
});

test('actual desktop photo enlarges with keyboard and Escape restores focus; only Chrome is offered', async ({ page }, info) => {
  await setup(page); await page.goto('/app-install-test'); await panel(page).getByRole('button', { name: '그림 보며 따라 하기' }).click();
  const next = panel(page).getByRole('button', { name: '다음 단계' });
  for (let i=0;i<3;i++) await next.click();
  const enlarge = panel(page).getByRole('button', { name: '크롬 설치 메뉴 사진 크게 보기', exact: true });
  await expect.poll(() => enlarge.locator('img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 1100)).toBe(true);
  await enlarge.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '크롬 설치 메뉴', exact: true });
  await expect(dialog).toBeVisible(); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(enlarge).toBeFocused();
  await expect(panel(page)).toContainText('브랜디에듀에서 열기');
  await expect(panel(page).getByRole('combobox')).toHaveCount(0);
  await panel(page).screenshot({ path: info.outputPath('chrome-install-computer.png'), animations: 'disabled' });
});

test('store, account and connection questions are explained without overwhelming the guide or leaking URL parameters', async ({ page }) => {
  await setup(page); await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }); });
  await page.goto('/app-install-test?token=synthetic-only'); await panel(page).getByRole('button', { name: '그림 보며 따라 하기' }).click();
  await panel(page).getByRole('button', { name: '주소 복사', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(new URL('/my', page.url()).href);
  await panel(page).getByText('앱스토어에서 검색해도 안 나와요', { exact: true }).click(); await expect(panel(page)).toContainText('다운로드하는 앱이 아니에요');
  await panel(page).getByText('새로 가입하거나 결제해야 하나요?', { exact: true }).click(); await expect(panel(page)).toContainText('수강 신청할 때 쓴 계정');
  await panel(page).getByText('아이콘을 추가하면 인터넷 없이도 볼 수 있나요?', { exact: true }).click(); await expect(panel(page)).toContainText('인터넷 연결이 필요해요');
});

test('small phone width keeps actions readable and removes oversized illustrative share graphics', async ({ page }, info) => {
  await setup(page, { ios: true }); await page.setViewportSize({ width: 320, height: 740 }); await page.goto('/app-install-test');
  await panel(page).getByRole('button', { name: '그림 보며 따라 하기' }).click(); await panel(page).getByRole('button', { name: '다음 단계' }).click();
  await expect(panel(page).locator('img[src$=".svg"]')).toHaveCount(0);
  await panel(page).screenshot({ path: info.outputPath('simple-install-320.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(panel(page).getByRole('button', { name: '다음 단계' })).toBeVisible();
});

for (const ua of ['Mozilla/5.0 Chrome/140.0 Whale/4.0 Safari/537.36', 'Mozilla/5.0 Chrome/140.0 Edg/140.0 Safari/537.36']) test(`other Chromium browsers do not offer their own install prompt: ${ua}`, async ({ page }) => {
 await setup(page,{ua}); await page.goto('/app-install-test');
 expect(await offer(page,'accepted')).toBe(false);
 await expect(panel(page).getByRole('button',{name:'아이콘 추가하기',exact:true})).toHaveCount(0);
 await expect(panel(page)).toContainText('먼저 Chrome(크롬)으로 열어 주세요');
 await panel(page).getByRole('button',{name:'그림 보며 따라 하기'}).click();
 await panel(page).getByText('기존 아이콘을 누르면 브라우저에 로그인하래요',{exact:true}).click();
 await expect(panel(page)).toContainText('새 아이콘으로 강의가 열리는지 확인한 뒤');
});


test('iPhone captures load across six steps and completion, enlarge and return focus', async ({ page }, info) => {
  await setup(page, { ios: true }); await page.goto('/app-install-test');
  await panel(page).getByRole('button', { name: '그림 보며 따라 하기' }).click();
  for (let step = 0; step < 7; step++) {
    const photo = panel(page).locator('.app-install-iphone-shot .app-install-shot-button');
    await expect.poll(() => photo.locator('img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await photo.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(photo).toBeFocused();
    await panel(page).locator('.app-install-step').screenshot({ path: info.outputPath(`iphone-step-${step + 1}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (step < 6) await panel(page).getByRole('button', { name: step === 5 ? '아이콘 찾는 법 보기' : '다음 단계' }).click();
  }
});
