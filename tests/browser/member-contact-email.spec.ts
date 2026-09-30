import { expect, test } from '@playwright/test';

test('member can save, reload and clear a delivery preference while login stays readonly', async ({ page }, testInfo) => {
  const user = { id:'synthetic-member', full_name:'합성 회원', email:'login@example.test', contact_email:null as string | null, phone:'01000000000', role:'student' };
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/platform**', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); writes.push(body);
      user.contact_email = body.contact_email?.trim().toLowerCase() || null;
      await route.fulfill({ json:{ ok:true } });
    } else await route.fulfill({ json:{ user, data:{}, support:{} } });
  });
  await page.goto('/public-data-test?publicScreen=my/profile');
  await expect(page.getByLabel('로그인 이메일', { exact:true })).toHaveValue('login@example.test');
  await expect(page.getByLabel('로그인 이메일', { exact:true })).toHaveAttribute('readonly', '');
  const email = page.getByLabel('안내받을 이메일', { exact:true });
  await expect(email).toHaveValue('');
  await email.fill('notice@example.test');
  await page.getByRole('button', { name:'변경 내용 저장', exact:true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ action:'profile', contact_email:'notice@example.test' });
  expect(writes[0]).not.toHaveProperty('email');
  await page.reload();
  await expect(email).toHaveValue('notice@example.test');
  await page.locator('form').filter({ has:email }).screenshot({ path:testInfo.outputPath('member-contact-email.png') });
  await email.fill('');
  await page.getByRole('button', { name:'변경 내용 저장', exact:true }).click();
  await expect.poll(() => writes.length).toBe(2);
  await page.reload();
  await expect(email).toHaveValue('');
  await expect(page.getByLabel('로그인 이메일', { exact:true })).toHaveValue('login@example.test');
});

test('admin can save a delivery preference without any login email field', async ({ page }, testInfo) => {
  await page.goto('/member-operations-test');
  await page.getByRole('button', { name:'회원 상세 열기', exact:true }).click();
  await expect(page.getByRole('dialog')).toContainText('로그인 이메일 · operations-fixture@example.test');
  await page.getByLabel('안내받을 이메일', { exact:true }).fill('admin-notice@example.test');
  await page.getByRole('button', { name:'저장하기', exact:true }).click();
  const output = page.getByTestId('saved-member');
  await expect(output).toContainText('admin-notice@example.test');
  const saved = JSON.parse(await output.textContent() || '{}');
  expect(saved.contact_email).toBe('admin-notice@example.test');
  expect(saved).not.toHaveProperty('email');
  await page.getByRole('button', { name:'회원 상세 열기', exact:true }).click();
  await expect(page.getByLabel('안내받을 이메일', { exact:true })).toHaveValue('admin-notice@example.test');
  await page.getByRole('dialog').screenshot({ path:testInfo.outputPath('admin-contact-email.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
