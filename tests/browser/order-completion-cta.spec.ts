import { expect, test } from '@playwright/test';

const order = '11111111-1111-4111-8111-111111111111';
const completion = `/order-complete-test?order=${order}`;

test('completed payment has one next step while loading and after the guide is ready', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/purchase-onboarding*', async route => {
    await gate;
    await route.fulfill({ json: { available: true, orderId: order } });
  });
  await page.goto(completion);
  await expect(page.getByRole('button', { name: '시작 안내 확인 중' })).toBeDisabled();
  await expect(page.locator('.completion a')).toHaveCount(0);
  release();
  const next = page.getByRole('link', { name: '결제 후 시작 안내' });
  await expect(next).toHaveAttribute('href', `/purchase-onboarding?order=${order}`);
  await expect(page.locator('.completion a')).toHaveCount(1);
  await expect(page.getByText('아래 버튼을 눌러 교육 시작 안내를 확인해 주세요.')).toBeVisible();
  const buttonBox = await next.boundingBox();
  const groupBox = await page.locator('.completion .grid2').boundingBox();
  expect(Math.abs(buttonBox!.width - groupBox!.width)).toBeLessThan(2);
});

test('guide lookup failure keeps only retry, then restores the single guide link', async ({ page }) => {
  let recovered = false;
  await page.route('**/api/purchase-onboarding*', route => route.fulfill({
    status: recovered ? 200 : 503,
    json: recovered ? { available: true } : { error: 'temporary failure' },
  }));
  await page.goto(completion);
  await expect(page.getByRole('alert')).toContainText('시작 안내를 불러오지 못했습니다');
  await expect(page.locator('.completion a')).toHaveCount(0);
  recovered = true;
  await page.getByRole('button', { name: '시작 안내 다시 확인' }).click();
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toBeVisible();
  await expect(page.locator('.completion a')).toHaveCount(1);
});

test('a product without a guide still provides exactly one class destination', async ({ page }) => {
  await page.route('**/api/purchase-onboarding*', route => route.fulfill({ status: 404, json: { available: false } }));
  await page.goto(completion);
  await expect(page.getByRole('link', { name: '내 클래스 보기' })).toHaveAttribute('href', '/my/classes');
  await expect(page.locator('.completion a')).toHaveCount(1);
  await expect(page.getByRole('link', { name: '클래스 둘러보기' })).toHaveCount(0);
});

test('failed payment confirmation retains retry and order-history destinations', async ({ page }) => {
  await page.route('**/api/platform/payment', route => route.fulfill({ status: 503, json: { error: '결제 확인 일시 오류' } }));
  await page.goto('/order-complete-test?orderId=BAE-QA-1&paymentKey=qa-key&amount=1650000&fixtureStatus=pending');
  await expect(page.getByRole('button', { name: '결제 결과 다시 확인' })).toBeVisible();
  await expect(page.getByRole('link', { name: '신청 내역 확인' })).toHaveAttribute('href', '/my/orders');
  await expect(page.getByRole('link', { name: '클래스 둘러보기' })).toBeVisible();
});

test('waiting for bank transfer retains deposit details and order-history destination', async ({ page }) => {
  await page.route('**/api/platform/payment', route => route.fulfill({ json: {
    status: 'waiting_for_deposit', virtualAccount: { bankCode: 'QA', accountNumber: 'synthetic-account', dueDate: '2099-10-01T00:00:00+09:00' },
  } }));
  await page.goto('/order-complete-test?orderId=BAE-QA-1&paymentKey=qa-key&amount=1650000&fixtureStatus=pending&fixtureRefreshStatus=pending');
  await expect(page.getByRole('heading', { name: '가상계좌가 발급되었습니다.' })).toBeVisible();
  await expect(page.getByText('synthetic-account')).toBeVisible();
  await expect(page.getByRole('link', { name: '신청 내역 확인' })).toHaveAttribute('href', '/my/orders');
  await expect(page.getByRole('link', { name: '결제 후 시작 안내' })).toHaveCount(0);
});
