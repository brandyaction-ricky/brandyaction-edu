import { expect, test } from '@playwright/test';
test('admin member email change requires two addresses, reason and confirmation without saving the profile form', async ({ page }) => {
  let pendingEmail = '', sends = 0;
  await page.route('**/api/admin/member-login-email**', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.email).toBe('new@example.test'); expect(body.confirmEmail).toBe(body.email); expect(body.confirmed).toBe(true); expect(body.reason).toBe('회원 요청');
      expect(body.password).toBeUndefined(); sends++; pendingEmail = body.email;
      await route.fulfill({ json: { message: '새 이메일로 확인 메일을 보냈습니다.' } });
    } else await route.fulfill({ json: { currentEmail: 'old@example.test', pendingEmail, history: [] } });
  });
  await page.goto('/member-operations-test');
  await page.getByRole('button', { name: '회원 상세 열기', exact: true }).click();
  const area = page.getByRole('region', { name: '관리자 로그인 이메일 변경' });
  await expect(area.getByText('old@example.test', { exact: true })).toBeVisible();
  const send = area.getByRole('button', { name: '3. 새 이메일로 확인 메일 보내기' });
  await expect(send).toBeDisabled();
  await area.getByLabel('1. 회원이 사용할 새 이메일', { exact: true }).fill('new@example.test');
  await area.getByLabel('새 이메일 한 번 더 입력', { exact: true }).fill('wrong@example.test');
  await area.getByLabel('2. 변경 사유', { exact: true }).fill('회원 요청');
  await area.getByRole('checkbox').check(); await expect(send).toBeDisabled();
  await area.getByLabel('새 이메일 한 번 더 입력', { exact: true }).fill('new@example.test');
  await expect(area.getByRole('checkbox')).not.toBeChecked();
  await area.getByRole('checkbox').check(); await send.click();
  await expect(area.getByRole('status').filter({ hasText: '확인 대기' })).toContainText('new@example.test');
  await expect(area.getByText('old@example.test', { exact: true })).toBeVisible();
  await expect(page.getByTestId('saved-member')).toHaveText('{}');
  expect(sends).toBe(1);
});
test('staff cannot see the administrator email form', async ({ page }) => {
  await page.route('**/api/admin/member-login-email**', route => route.fulfill({ status: 403, json: { error: '관리자만 사용 가능합니다.' } }));
  await page.goto('/member-operations-test'); await page.getByRole('button', { name: '회원 상세 열기', exact: true }).click();
  await expect(page.getByRole('region', { name: '관리자 로그인 이메일 변경' })).toHaveCount(0);
});
