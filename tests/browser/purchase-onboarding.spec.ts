import { expect, test } from '@playwright/test';

const order = '11111111-1111-4111-8111-111111111111';
const cohort = '22222222-2222-4222-8222-222222222222';

test('Moonshot fourth buyer sees install and room guidance without a web survey', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/api/purchase-onboarding*', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, telegramOnly: true, orderId: order,
      orderNumber: 'QA-4', itemName: '문샷 챌린지 4기', roomName: '4기 교육생 공지방', supportUrl: 'http://pf.kakao.com/_ydxjhxj/chat' } });
    actions.push(route.request().postDataJSON().action);
    return route.fulfill({ json: { ok: true, url: 'https://t.me/+ExampleCode123' } });
  });
  await page.goto(`/purchase-onboarding?order=${order}`);
  await expect(page.getByRole('heading', { name: '4기 교육생 공지방에 입장해 주세요' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '어떤 경로로 참여하셨나요?' })).toHaveCount(0);
  await page.getByRole('button', { name: '텔레그램이 처음이에요' }).click();
  await expect(page.getByRole('link', { name: 'iPhone 앱 설치' })).toHaveAttribute('href', 'https://telegram.org/dl/ios');
  await expect(page.getByRole('link', { name: 'Android 앱 설치' })).toHaveAttribute('href', 'https://telegram.org/dl/android');
  await expect(page.getByText('닉네임/4기')).toBeVisible();
  await expect(page.getByText(/고정 게시물/)).toBeVisible();
  await expect(page.getByRole('link', { name: '고객센터 문의' })).toHaveAttribute('href', 'http://pf.kakao.com/_ydxjhxj/chat');
  await page.getByRole('button', { name: '초대 링크 복사' }).click();
  expect(actions).toEqual(['link']);
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
