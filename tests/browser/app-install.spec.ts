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
  await setup(page); await page.goto('/app-install-test'); await expect(panel(page)).toBeVisible(); await expect(page.getByRole('button', { name: '앱 설치하기' })).toHaveCount(0);
  await page.getByRole('button', { name: '시험 내 클래스' }).click(); expect(await offer(page, 'dismissed')).toBe(true); await page.getByRole('button', { name: '시험 마이페이지' }).click();
  await expect(page.getByRole('button', { name: '앱 설치하기' })).toBeVisible(); expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(0);
  await page.getByRole('button', { name: '앱 설치하기' }).click(); await expect(panel(page)).toContainText('설치를 취소했습니다'); expect(await page.evaluate(() => (window as TestWindow).eduGesture)).toBe(true);
  await offer(page, 'accepted'); await page.getByRole('button', { name: '앱 설치하기' }).click(); await expect(panel(page)).toContainText('설치를 요청했습니다');
  await expect(panel(page)).not.toContainText('설치 완료'); await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('app-install-desktop.png'), fullPage: false });
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled'))); await expect(panel(page)).toHaveCount(0); await page.getByRole('button', { name: '시험 회원 정보' }).click(); await expect(page.getByRole('region', { name: '앱 사용 상태' })).toContainText('설치가 확인되었습니다');
  expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0); expect(writes).toHaveLength(0);
});
for (const device of ['ios', 'ipad'] as const) test(`${device} gets manual Home Screen instructions and no automatic permission prompt`, async ({ page }, info) => {
  await setup(page, { [device]: true }); await page.goto('/app-install-test'); await panel(page).getByRole('button', { name: '앱 추가 방법 보기' }).click(); await expect(panel(page)).toContainText('Safari'); await expect(panel(page)).toContainText('동작 편집'); await expect(panel(page)).toContainText('웹 앱으로 열기');
  await expect(panel(page)).toContainText('인터넷 연결'); await expect(page.getByRole('button', { name: '앱 설치하기' })).toHaveCount(0);
  await expect(panel(page).locator('img')).toHaveJSProperty('naturalWidth', 192); await panel(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('app-install-apple.png'), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth)); expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0);
});
test('embedded browser shows a clean launch URL and copy failure leaves manual instructions available', async ({ page }) => {
  await setup(page, { embedded: true }); await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw Error('Not permitted'); } } }); });
  await page.goto('/app-install-test?token=synthetic-only'); await expect(panel(page)).toContainText('외부 브라우저로 열기'); await panel(page).getByRole('button', { name: '앱 추가 방법 보기' }).click(); await expect(panel(page)).toContainText('Chrome');
  await expect(page.getByLabel('설치할 사이트 주소')).toHaveValue(new URL('/my', page.url()).href); await page.getByRole('button', { name: '사이트 주소 복사' }).click(); await expect(panel(page)).toContainText('직접 복사');
  await offer(page, 'accepted'); await expect(page.getByRole('button', { name: '앱 설치하기' })).toHaveCount(0);
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
  await setup(page, { blockedStorage: true }); await page.goto('/app-install-test'); await expect(panel(page)).toBeVisible(); await offer(page, 'error'); await page.getByRole('button', { name: '앱 설치하기' }).click(); await expect(panel(page)).toContainText('설치 창을 열지 못했어요');
  await expect(panel(page).getByRole('button', { name: '앱 추가 방법 보기' })).toBeVisible(); expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(1);
  await panel(page).getByRole('button', { name: '나중에 · 7일 동안 접기' }).click(); await expect(panel(page)).toHaveCount(0); await page.getByRole('button', { name: '시험 내 클래스' }).click(); await expect(page.getByRole('heading', { name: '내 클래스', exact: true })).toBeVisible();
});

test('manual guide remains reachable without an install event, supports each device, and never claims installation', async ({ page }, info) => {
  await setup(page); await page.goto('/app-install-test');
  const help = panel(page).getByRole('button', { name: '앱 추가 방법 보기' });
  await expect(help).toBeVisible(); await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page).getByRole('group', { name: '앱을 추가할 기기' })).toBeHidden();
  await expect(panel(page)).toContainText('다시 추가하지 않아도 돼요');
  await help.focus(); await page.keyboard.press('Enter');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await expect(panel(page).getByRole('button', { name: '컴퓨터', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page).getByRole('listitem')).toHaveCount(4);
  await expect(panel(page).getByRole('list')).toContainText('전송, 저장 및 공유');
  await panel(page).getByLabel('사용할 인터넷 앱').selectOption('edge');
  await expect(panel(page).getByRole('list')).toContainText('이 사이트를 앱으로 설치');
  await panel(page).getByLabel('사용할 인터넷 앱').selectOption('safari');
  await expect(panel(page).getByRole('list')).toContainText('Dock에 추가');
  await panel(page).getByRole('button', { name: '갤럭시·안드로이드' }).click();
  await expect(panel(page).getByRole('listitem')).toHaveCount(4);
  await expect(panel(page).getByRole('list')).toContainText('홈 화면에 추가');
  await panel(page).getByRole('button', { name: '아이폰·아이패드' }).click();
  await expect(panel(page).getByRole('list')).toContainText('공유 버튼');
  await expect(panel(page).getByRole('list')).toContainText('웹 앱으로 열기');
  await expect(panel(page).getByRole('button', { name: '아이폰·아이패드' })).toHaveCSS('background-color', 'rgb(187, 30, 47)');
  await panel(page).screenshot({ path: info.outputPath('install-guide-iphone.png'), animations: 'disabled' });
  await panel(page).getByRole('button', { name: '컴퓨터', exact: true }).click();
  await panel(page).getByLabel('사용할 인터넷 앱').selectOption('chrome');
  await expect(panel(page).getByRole('button', { name: '컴퓨터', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)');
  await panel(page).screenshot({ path: info.outputPath('install-guide-computer.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  await help.click(); await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page).getByRole('group', { name: '앱을 추가할 기기' })).toBeHidden();
  expect(await page.evaluate(() => (window as TestWindow).eduPromptCalls)).toBe(0);
  expect(await page.evaluate(() => (window as TestWindow).eduPermissionCalls)).toBe(0);
  await expect(page.getByRole('region', { name: '앱 사용 상태' })).toHaveCount(0);
});

test('actual Chrome screenshots load, enlarge with keyboard, close with Escape and never prompt installation',async({page},info)=>{
 await setup(page);await page.goto('/app-install-test');await panel(page).getByRole('button',{name:'앱 추가 방법 보기'}).click();
 const photos=panel(page).locator('.app-install-shot-button img');await expect(photos).toHaveCount(2);
 for(const photo of await photos.all()){await photo.scrollIntoViewIfNeeded();await expect.poll(()=>photo.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);}
 const enlarge=panel(page).getByRole('button',{name:'Chrome에서 ‘페이지를 앱으로 설치’ 찾기 크게 보기',exact:true});
 await enlarge.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog',{name:'Chrome에서 ‘페이지를 앱으로 설치’ 찾기',exact:true});await expect(dialog).toBeVisible();
 expect(await dialog.locator('img').getAttribute('alt')).toContain('실제 컴퓨터 Chrome');
 await page.screenshot({path:info.outputPath('actual-chrome-menu-enlarged.png'),fullPage:false});
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(enlarge).toBeFocused();
 await panel(page).getByRole('button',{name:'Chrome 설치 창에서 사이트 확인하기 크게 보기',exact:true}).click();await page.getByRole('button',{name:'사진 닫기'}).click();
 await panel(page).getByRole('button',{name:'아이폰·아이패드'}).click();await expect(panel(page).locator('.app-install-shot')).toHaveCount(0);await expect(panel(page).getByText('이 기기의 설치 사진은 준비 중이에요. 지금은 아래 글을 따라 추가해 주세요.')).toBeVisible();
 expect(await page.evaluate(()=>(window as TestWindow).eduPromptCalls)).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
