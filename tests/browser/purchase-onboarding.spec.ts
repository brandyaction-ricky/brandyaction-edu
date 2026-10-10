import { expect, test } from '@playwright/test';

const order = '11111111-1111-4111-8111-111111111111';
const cohort = '22222222-2222-4222-8222-222222222222';

const initialProgress = () => ({ telegram: false, app: false, orientation: false, learning: false,
  orientationAt: '2026-11-06T20:00:00+09:00', lesson: { id: 'guide', title: '운영 가이드와 규정', url: '/learn/enrollment/guide', completed: false }, comment: '' });
test('four steps persist across reload and require schedule, real learning and comment', async ({ page }, testInfo) => {
  const progress = initialProgress();
  let fail = false;
  const actions: string[] = [];
  await page.route('https://t.me/+ExampleCode123', route => route.fulfill({ body: 'Synthetic Telegram destination' }));
  await page.route('**/api/purchase-onboarding*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, telegramOnly: true, orderId: order, itemName: '문샷 챌린지 4기', roomName: '4기 교육생 공지방', supportUrl: '', progress } });
    const body = route.request().postDataJSON(); actions.push(body.action);
    if (body.action === 'link') return route.fulfill({ json: { ok: true, url: 'https://t.me/+ExampleCode123' } });
    if (fail) return route.fulfill({ status: 503, json: { error: '저장하지 못했습니다.' } });
    if (body.step === 'learning') { progress.learning = true; progress.comment = body.comment; }
    else if (body.step === 'orientation') { expect(body.orientationAt).toBe(progress.orientationAt); progress.orientation = true; }
    else if (body.step === 'telegram') progress.telegram = true;
    else if (body.step === 'app') progress.app = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/purchase-onboarding?order=${order}`);
  await page.getByRole('button', { name: '텔레그램이 처음이에요' }).click();
  await expect(page.getByRole('link', { name: 'iPhone 앱 설치' })).toHaveAttribute('href', 'https://telegram.org/dl/ios');
  const [room] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: '텔레그램 공지방 입장' }).click()]);
  await expect(room).toHaveURL('https://t.me/+ExampleCode123'); await room.close();
  await expect(page.getByRole('checkbox', { name: /공지방에 입장했어요/ })).not.toBeChecked();
  fail = true; await page.getByRole('checkbox', { name: /공지방에 입장했어요/ }).click();
  await expect(page.getByRole('alert')).toContainText('저장하지 못했습니다');
  fail = false; await page.getByRole('checkbox', { name: /공지방에 입장했어요/ }).click();
  await expect(page.getByRole('heading', { name: '브랜디에듀 앱을 설치해 주세요' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: '브랜디에듀 앱을 설치해 주세요' })).toBeVisible();
  await page.getByRole('button', { name: '그림 보며 따라 하기' }).click();
  await page.getByRole('checkbox', { name: /브랜디에듀 아이콘을 추가하고 열어 봤어요/ }).click();
  await expect(page.getByText(/2026년 11월 6일/)).toBeVisible();
  await expect(page.getByText(/OT 시청은 필요하지 않아요/)).toBeVisible();
  await page.screenshot({path: `/tmp/edu-onboarding-${testInfo.project.name}.png`, fullPage: true});
  await page.getByRole('checkbox', { name: 'OT 일정을 확인했어요' }).click();
  const save = page.getByRole('button', { name: '댓글 저장하고 시작 준비 완료' });
  await page.getByRole('textbox', { name: '확인 댓글' }).fill('운영 가이드와 규정을 읽고 확인했습니다.');
  await expect(save).toBeDisabled();
  await expect(page.getByRole('link', { name: '운영 가이드 학습 열기' })).toHaveAttribute('href', '/learn/enrollment/guide');
  progress.lesson.completed = true; await page.getByRole('button', { name: '학습 완료 다시 확인' }).click();
  await expect(save).toBeEnabled(); await save.click();
  await expect(page.getByRole('heading', { name: '시작 준비를 모두 마쳤어요!' })).toBeVisible();
  await page.reload(); await expect(page.getByText('저장한 댓글: 운영 가이드와 규정을 읽고 확인했습니다.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(actions).toContain('confirm');
});

test('missing OT date stays pending instead of pretending onboarding is complete', async ({ page }) => {
 const progress = {...initialProgress(), telegram: true, app: true, orientationAt: ''};
 await page.route('**/api/purchase-onboarding*', route => route.fulfill({json:{available:true,telegramOnly:true,orderId:order,itemName:'합성 기수',roomName:'공지방',supportUrl:'',progress}}));
 await page.goto(`/purchase-onboarding?order=${order}`);
 await expect(page.getByText(/운영자가 OT 일정을 준비 중/)).toBeVisible();
 await expect(page.getByRole('checkbox')).toHaveCount(0);
 await expect(page.getByRole('button', {name:/4단계/})).toBeDisabled();
});

test('customer answers once, then sees the Telegram guide without exposing the invite URL early', async ({ page }) => {
  let room: string | null = null;
  let path: string | null = null;
  await page.route('**/api/purchase-onboarding*', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, orderId: order, orderNumber: 'QA-1', itemName: '문샷 챌린지 4기', roomName: 'AI Moonshot project #4기', surveyRoom: room, telegramPath: path, profileImage: '', supportUrl: 'https://example.com/help' } });
    const body = route.request().postDataJSON();
    expect(body.order).toBe(order);
    if (body.action === 'answer') room = body.room;
    if (body.action === 'path') path = body.path;
    return route.fulfill({ json: { ok: true, surveyRoom: room, telegramPath: path } });
  });
  await page.goto(`/purchase-onboarding?order=${order}`);
  await expect(page.getByRole('heading', { name: '어떤 경로로 참여하셨나요?' })).toBeVisible();
  await expect(page.getByRole('button', { name: '텔레그램 방 입장' })).toHaveCount(0);
  await page.getByRole('button', { name: '광고 방에서 참여했어요' }).click();
  await expect(page.getByRole('heading', { name: '텔레그램 방에 입장해 주세요' })).toBeVisible();
  await expect(page.getByText('AI Moonshot project #4기')).toBeVisible();
  await page.getByRole('button', { name: '텔레그램이 처음이에요' }).click();
  await expect(page.getByRole('button', { name: '텔레그램 방 입장' })).toBeVisible();
  await expect(page.getByText('텔레그램 앱을 설치하고 계정을 만든 뒤')).toBeVisible();
});

test('operator can save a disabled draft before images or invite link are ready', async ({ page }) => {
  const saved: unknown[] = [];
  await page.route('**/api/admin/purchase-onboarding*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); saved.push(body); return route.fulfill({ json: { ok: true, settings: body.settings } }); }
    return route.fulfill({ json: url.searchParams.has('cohort')
      ? { settings: { roomName: 'AI Moonshot project #4기', inviteUrl: '', paidImage: '', organicImage: '', enabled: false }, cohorts: [], telegramOnly: true }
      : { settings: {}, cohorts: [{ id: cohort, name: '4기', courses: { title: '문샷 챌린지' } }] } });
  });
  await page.goto('/admin/purchase-onboarding-test');
  await page.getByLabel('안내할 기수').selectOption(cohort);
  await expect(page.getByLabel('텔레그램 방 이름')).toHaveValue('AI Moonshot project #4기');
  await expect(page.getByLabel('결제 완료 수강생에게 안내 화면 열기')).not.toBeChecked();
  await expect(page.getByText('광고 방 프로필 이미지')).toHaveCount(0);
  await expect(page.getByText(/웹 유입 설문 없이/)).toBeVisible();
  await page.getByRole('button', { name: '설정 저장' }).click();
  await expect(page.getByText('결제 후 안내는 아직 꺼져 있습니다.')).toBeVisible();
  expect(saved).toHaveLength(1);
  expect((saved[0] as { settings: { enabled: boolean; paidImage: string } }).settings).toMatchObject({ enabled: false, paidImage: '' });
});

test('paid completion offers onboarding only when the cohort guide is enabled', async ({ page }) => {
  let enabled = false;
  await page.route('**/api/purchase-onboarding*', route => route.fulfill({ status: enabled ? 200 : 404, json: enabled ? { available: true } : { available: false } }));
  await page.goto(`/order-complete-test?orderId=${order}`);
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveCount(0);
  enabled = true;
  await page.reload();
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
});

test('Toss order number resolves to the internal order ID before onboarding lookup', async ({ page }) => {
  const lookups: string[] = [];
  const confirmations: string[] = [];
  await page.route('**/api/platform/payment', route => {
    confirmations.push(route.request().postDataJSON().orderId);
    return route.fulfill({ json: { status: 'paid' } });
  });
  await page.route('**/api/purchase-onboarding*', route => {
    lookups.push(new URL(route.request().url()).searchParams.get('order') || '');
    return route.fulfill({ json: { available: true, orderId: order } });
  });
  await page.goto('/order-complete-test?orderId=BAE-QA-1&paymentKey=qa-key&amount=1650000&fixtureStatus=pending');
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
  expect(confirmations).toContain('BAE-QA-1');
  expect(lookups).toContain(order);
  expect(lookups).not.toContain('BAE-QA-1');
});

test('free completion and order-history reentry use the same internal order ID', async ({ page }) => {
  const lookups: string[] = [];
  await page.route('**/api/purchase-onboarding*', route => {
    lookups.push(new URL(route.request().url()).searchParams.get('order') || '');
    return route.fulfill({ json: { available: true, orderId: order } });
  });
  await page.goto(`/order-complete-test?order=${order}&free=1`);
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
  await page.goto(`/order-complete-test?order=${order}`);
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
  // StrictMode may replay the effect, so assert the order identity rather than the fetch count.
  expect(lookups.length).toBeGreaterThanOrEqual(2);
  expect(lookups.every(value => value === order)).toBe(true);
});

test('cancelled orders do not request purchase onboarding', async ({ page }) => {
  const lookups: string[] = [];
  await page.route('**/api/purchase-onboarding*', route => {
    lookups.push(route.request().url());
    return route.fulfill({ status: 404, json: { available: false } });
  });
  await page.goto(`/order-complete-test?order=${order}&fixtureStatus=cancelled`);
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveCount(0);
  expect(lookups).toHaveLength(0);
});

test('onboarding lookup failure is visible and can be retried', async ({ page }) => {
  let retryAllowed = false;
  await page.route('**/api/purchase-onboarding*', route => {
    return route.fulfill({ status: retryAllowed ? 200 : 503, json: retryAllowed ? { available: true, orderId: order } : { error: '일시적인 오류' } });
  });
  await page.goto(`/order-complete-test?order=${order}`);
  await expect(page.getByRole('alert')).toContainText('시작 안내를 불러오지 못했습니다');
  retryAllowed = true;
  await page.getByRole('button', { name: '시작 안내 다시 확인' }).click();
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
});
