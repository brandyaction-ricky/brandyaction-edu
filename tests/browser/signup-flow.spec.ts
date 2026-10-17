import { expect, test, type Page } from '@playwright/test';

async function backend(page: Page, options: { consentFailure?: boolean } = {}) {
  let consentFailure = options.consentFailure;
  const calls: string[] = [];
  await page.route('**/synthetic-auth/consent', async route => {
    calls.push('required consent');
    await route.fulfill({ status: consentFailure ? 503 : 200, json: { ok: !consentFailure } });
  });
  await page.route('**/api/account/marketing-consent', async route => {
    calls.push('marketing choice');
    await route.fulfill({ status: 503, json: { error: 'Optional choices do not belong to required signup' } });
  });
  await page.route('**/api/platform/encouragement**', async route => {
    calls.push('encouragement');
    await route.fulfill({ status: 503, json: { error: 'Unexpected encouragement request' } });
  });
  return {
    calls,
    setConsentFailure(value: boolean) { consentFailure = value; },
  };
}

async function agree(page: Page) {
  await page.getByRole('checkbox', { name: '[필수] 이용약관 및 개인정보처리방침 동의', exact: true }).check();
}

test('signup omits encouragement and finishes after one submit while saving required choices only', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/signup-consent-test?next=%2Fmy%3Fsignup%3Ddone');
  await expect(page.getByRole('checkbox', { name: '[선택] 참가자들에게 응원 메시지 남기기' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '공개 별명' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '동의하고 가입 완료' })).toBeDisabled();
  await agree(page);
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(server.calls).toEqual(['required consent']);
});

test('a failed consent save stays on the form and does not publish an encouragement', async ({ page }) => {
  const server = await backend(page, { consentFailure: true });
  await page.goto('/signup-consent-test?next=%2Fmy%3Fsignup%3Ddone');
  await agree(page);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('alert')).toContainText('약관 동의를 저장하지 못했습니다');
  expect(server.calls).toEqual(['required consent']);
  server.setConsentFailure(false);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(server.calls).toEqual(['required consent', 'required consent']);
});
