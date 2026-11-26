import { test, expect } from '@playwright/test';

test('login offers both recovery paths before opening the login form', async ({ page }) => {
  await page.goto('/public-data-test?publicScreen=login');
  await page.getByRole('button', { name: '비밀번호 찾기', exact: true }).click();
  await expect(page.getByLabel('이메일', { exact: true })).toBeFocused();
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
  await expect(page.getByLabel('주문번호')).toBeFocused();
  await expect(page.getByRole('button', { name: '재설정 메일 받기' })).toHaveCount(0);
  await page.route('**/api/auth/find-email', async route => {
    expect(route.request().postDataJSON()).toEqual({ order: 'BAE-20261113100000000-ABCDEF12', phone: '010-1234-5678' });
    await route.fulfill({ json: { hint: 's***@example.test' } });
  });
  await page.getByLabel('주문번호', { exact: true }).fill('BAE-20261113100000000-ABCDEF12');
  await page.getByLabel('결제할 때 입력한 전화번호').fill('010-1234-5678');
  await page.getByRole('button', { name: '이메일 확인하기' }).click();
  await expect(page.getByRole('status')).toContainText('s***@example.test');
  await expect(page.getByRole('status').filter({ hasText: 's***@example.test' })).toBeFocused();
  await page.getByRole('button', { name: '이메일로 로그인' }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
});

test('a returning student sees the masked hint without entering an order and can remove it', async ({ page }) => {
  await page.goto('/member-header-test');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('edu-recent-login-hint-v1'))).toContain('q***@example.test');
  await page.goto('/public-data-test?publicScreen=login');
  await page.getByRole('button', { name: '이메일 찾기', exact: true }).click();
  await expect(page.getByText('q***@example.test', { exact: true })).toBeVisible();
  await expect(page.locator('#email-hint-form p').filter({ hasText: 'q***@example.test' })).toBeFocused();
  await page.getByRole('button', { name: '이 기기에서 힌트 지우기' }).click();
  await expect(page.getByLabel('주문번호')).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: '이메일 찾기', exact: true }).click();
  await expect(page.getByText('q***@example.test', { exact: true })).toHaveCount(0);
});

test('email login can retry a rejected password and return to the selected destination', async ({ page }) => {
  let attempts = 0;
  await page.route('**/synthetic-auth/sign-in', route => route.fulfill({ json: ++attempts === 1
    ? { data: {}, error: { code: 'invalid_credentials' } }
    : { data: { user: { user_metadata: { terms_version: 'qa', privacy_version: 'qa' } } }, error: null },
  }));
  const next = '/member-header-test';
  await page.goto('/public-data-test?publicScreen=login&next=' + encodeURIComponent(next));
  await page.getByRole('button', { name: '이메일로 로그인' }).press('Enter');
  const email = page.getByLabel('이메일', { exact: true });
  await expect(email).toBeFocused();
  await email.fill('qa@example.test');
  const password = page.getByLabel('비밀번호', { exact: true });
  await password.fill('fixture-wrong');
  const submit = page.locator('#email-auth-form').getByRole('button', { name: '로그인', exact: true });
  await submit.click();
  await expect(page.getByRole('alert')).toBeFocused();
  await password.fill('fixture-correct');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await submit.click();
  await expect(page).toHaveURL(/\/member-header-test$/);
  expect(attempts).toBe(2);
});

test('signup points to a mismatched confirmation and preserves entries on retry', async ({ page }) => {
  let submitted = 0;
  await page.route('**/synthetic-auth/sign-up', route => {
    submitted++;
    return route.fulfill({ json: { data: { user: {}, session: null }, error: null } });
  });
  await page.goto('/public-data-test?publicScreen=signup');
  await page.getByRole('button', { name: '이메일로 회원가입' }).click();
  const name = page.getByLabel('이름', { exact: true });
  await expect(name).toBeFocused();
  await expect(name).toBeInViewport({ ratio: 1 });
  await name.fill('합성 회원');
  await page.getByLabel('이메일', { exact: true }).fill('qa@example.test');
  const signupPassword = page.getByLabel('비밀번호', { exact: true });
  await expect(signupPassword).toHaveAccessibleDescription('8자 이상이며 영문과 숫자를 각각 포함해 주세요.');
  await signupPassword.fill('Example1234');
  const confirm = page.getByLabel('비밀번호 확인', { exact: true });
  await confirm.fill('Another1234');
  const submit = page.getByRole('button', { name: '인증 메일 받고 가입하기' });
  await submit.click();
  await expect(confirm).toBeFocused();
  await expect(confirm).toHaveAccessibleDescription('비밀번호가 일치하지 않습니다.');
  expect(submitted).toBe(0);
  await confirm.fill('Example1234');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(name).toHaveValue('합성 회원');
  await submit.click();
  await expect(page.getByRole('status')).toContainText('인증 메일');
  expect(submitted).toBe(1);
});
