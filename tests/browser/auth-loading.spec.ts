import { expect, test } from '@playwright/test';

const member = { id: 'synthetic-member', full_name: '합성 회원', email: 'member@example.test', role: 'member' };

test('member dashboard waits for the identity response before deciding whether to show login', async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/platform?**', async route => {
    await pending;
    await route.fulfill({ json: { user: member, data: { enrollments: [], courses: [] }, support: {} } });
  });
  await page.goto('/public-data-test?publicScreen=my');
  try {
    await expect(page.locator('.member-loading-skeleton')).toBeVisible();
    await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator('.member-loading-skeleton')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '마이페이지' })).toBeVisible();
  await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
});

test('completed unauthenticated read shows login only after the pending state', async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/platform?**', async route => {
    await pending;
    await route.fulfill({ status: 401, json: { user: null, error: '로그인이 필요합니다.' } });
  });
  await page.goto('/public-data-test?publicScreen=my');
  try {
    await expect(page.locator('.member-loading-skeleton')).toBeVisible();
    await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed member read offers retry instead of a false login decision', async ({ page }) => {
  await page.route('**/api/platform?**', route => route.fulfill({ status: 503, json: { error: '합성 조회 오류' } }));
  await page.goto('/public-data-test?publicScreen=my');
  await expect(page.getByRole('alert')).toContainText('합성 조회 오류');
  await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
});

for (const screen of ['my/missions', 'learn/synthetic-enrollment']) {
  test(`${screen} waits for its own member data before showing a decision`, async ({ page }) => {
    let release = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/platform?**', async route => {
      await pending;
      await route.fulfill({ json: { user: member, data: { enrollments: [], courses: [] }, support: {} } });
    });
    await page.goto(`/public-data-test?publicScreen=${encodeURIComponent(screen)}`);
    try {
      await expect(page.locator('.member-loading-skeleton')).toBeVisible();
      await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
      await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
    } finally {
      release();
    }
    await expect(page.locator('.member-loading-skeleton')).toHaveCount(0);
    await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
  });
}
