import { test, expect } from '@playwright/test';

test('login offers both recovery paths before opening the login form', async ({ page }) => {
  await page.goto('/public-data-test?publicScreen=login');
  await page.getByRole('button', { name: '비밀번호 찾기', exact: true }).click();
  await expect(page.getByRole('button', { name: '재설정 메일 받기' })).toBeVisible();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveCount(0);
  await page.route('**/synthetic-auth/reset', async route => {
    const { email, redirectTo } = route.request().postDataJSON();
    expect(email).toBe('student@example.test');
    expect(new URL(redirectTo).searchParams.get('next')).toBe('/auth/reset-password');
    await route.fulfill({ json: {} });
  });
  await page.getByLabel('이메일', { exact: true }).fill('student@example.test');
  await page.getByRole('button', { name: '재설정 메일 받기' }).click();
  await expect(page.getByRole('status')).toContainText('메일함');
  await expect(page.getByRole('button', { name: /초 후 다시 요청/ })).toBeDisabled();
  await page.getByRole('button', { name: '이메일 찾기', exact: true }).click();
  await expect(page.getByRole('button', { name: '재설정 메일 받기' })).toHaveCount(0);
  await page.route('**/api/auth/find-email', async route => {
    expect(route.request().postDataJSON()).toEqual({ order: 'BAE-20261113100000000-ABCDEF12', phone: '010-1234-5678' });
    await route.fulfill({ json: { hint: 's***@example.test' } });
  });
  await page.getByLabel('주문번호', { exact: true }).fill('BAE-20261113100000000-ABCDEF12');
  await page.getByLabel('결제할 때 입력한 전화번호').fill('010-1234-5678');
  await page.getByRole('button', { name: '이메일 확인하기' }).click();
  await expect(page.getByRole('status')).toContainText('s***@example.test');
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
});

test('a returning student sees the masked hint without entering an order and can remove it', async ({ page }) => {
  await page.goto('/member-header-test');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('edu-recent-login-hint-v1'))).toContain('q***@example.test');
  await page.goto('/public-data-test?publicScreen=login');
  await page.getByRole('button', { name: '이메일 찾기', exact: true }).click();
  await expect(page.getByText('q***@example.test', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이 기기에서 힌트 지우기' }).click();
  await page.reload();
  await page.getByRole('button', { name: '이메일 찾기', exact: true }).click();
  await expect(page.getByText('q***@example.test', { exact: true })).toHaveCount(0);
});
