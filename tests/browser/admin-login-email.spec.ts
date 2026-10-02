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
test('malformed email response leaves member details usable and can be retried', async ({ page }) => {
  let valid = false;
  await page.route('**/api/admin/member-login-email**', route => route.fulfill({ json: valid ? { currentEmail: 'old@example.test', pendingEmail: '', history: [] } : { rows: [], total: 0 } }));
  await page.goto('/member-operations-test'); await page.getByRole('button', { name: '회원 상세 열기', exact: true }).click();
  const area = page.getByRole('region', { name: '관리자 로그인 이메일 변경' });
  await expect(area.getByRole('alert')).toContainText('다시 시도');
  await expect(page.getByRole('tab', { name: '프로필', exact: true })).toBeVisible();
  await expect(page.getByTestId('saved-member')).toHaveText('{}');
  valid = true; await area.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(area.getByText('old@example.test', { exact: true })).toBeVisible();
  await expect(area.getByRole('alert')).toHaveCount(0);
});
test('latest failed request stays visible after refresh and reopening without expanding history, then clears for a newer request', async ({ page }) => {
  const failure = '이미 다른 계정에서 사용하는 이메일입니다. 다른 주소를 입력하거나 고객센터에 문의해 주세요.';
  let history = [{ id: 1, created_at: '2026-10-02T08:00:00Z', actor_user_id: 'synthetic-admin', before_data: { email: 'old@example.test' }, after_data: { new_email: 'taken@example.test', reason: '회원 요청', status: 'failed', error: failure } }];
  await page.route('**/api/admin/member-login-email**', route => route.fulfill({ json: { currentEmail: 'old@example.test', pendingEmail: 'earlier@example.test', history } }));
  await page.goto('/member-operations-test');
  const open = page.getByRole('button', { name: '회원 상세 열기', exact: true });
  await open.click();
  const area = page.getByRole('region', { name: '관리자 로그인 이메일 변경' });
  const alert = area.getByRole('alert');
  await expect(alert).toContainText('최근 이메일 변경 요청이 실패했어요');
  await expect(alert).toContainText('taken@example.test');
  await expect(alert).toContainText(failure);
  await expect(area.locator('details')).not.toHaveAttribute('open');
  await expect(area.getByRole('status')).toContainText('앞선 요청의 확인 대기');
  await area.getByRole('button', { name: '변경 상태 확인', exact: true }).click();
  await expect(alert).toContainText(failure);
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).first().click();
  await open.click(); await expect(alert).toContainText(failure);
  history = [{ ...history[0], id: 2, after_data: { new_email: 'earlier@example.test', reason: '새 요청', status: 'waiting', error: '' } }, ...history];
  await area.getByRole('button', { name: '변경 상태 확인', exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect(area.getByRole('status')).toContainText('확인 대기: earlier@example.test');
});
test('rejected send brings the failure reason into view and retains entered addresses', async ({ page }) => {
  const failure = '이미 다른 계정에서 사용하는 이메일입니다. 다른 주소를 입력하거나 고객센터에 문의해 주세요.';
  await page.route('**/api/admin/member-login-email**', route => route.fulfill(route.request().method() === 'POST'
    ? { status: 400, json: { error: failure } }
    : { json: { currentEmail: 'old@example.test', pendingEmail: '', history: [] } }));
  await page.goto('/member-operations-test'); await page.getByRole('button', { name: '회원 상세 열기', exact: true }).click();
  const area = page.getByRole('region', { name: '관리자 로그인 이메일 변경' });
  await area.getByLabel('1. 회원이 사용할 새 이메일', { exact: true }).fill('taken@example.test');
  await area.getByLabel('새 이메일 한 번 더 입력', { exact: true }).fill('taken@example.test');
  await area.getByLabel('2. 변경 사유', { exact: true }).fill('회원 요청');
  await area.getByRole('checkbox').check();
  await area.getByRole('button', { name: '3. 새 이메일로 확인 메일 보내기' }).click();
  await expect(area.getByRole('alert')).toContainText(failure);
  await expect(area.getByRole('alert')).toBeInViewport();
  await expect(area.locator('[data-email-error-feedback]')).toBeFocused();
  await expect(area.getByLabel('1. 회원이 사용할 새 이메일', { exact: true })).toHaveValue('taken@example.test');
  await expect(area.getByRole('status')).toHaveCount(0);
});
