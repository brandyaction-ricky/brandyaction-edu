import { test, expect, type Page } from '@playwright/test';
async function backend(page: Page, opts: { lost?: boolean; conflict?: boolean; unavailable?: boolean; termsMissing?: boolean; handled?: boolean } = {}) {
  const writes: { requestId: string; payload: { choices: { analysis: boolean; overseas: boolean; kakao: boolean } } }[] = [];
  let lost = opts.lost, handled = opts.handled;
  await page.route('**/api/account/consent-reward', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: {
      available: !opts.unavailable, handled, awarded: false, analysisAvailable: !opts.termsMissing,
      personalRevision: null, marketingRevision: null, reward: { days: 30, minimum: 0 },
      terms: opts.termsMissing ? null : { version: 'qa-v1', analysis: '합성 검수용 분석 고지입니다. 실제 운영 안내가 아닙니다.', overseas: '합성 검수용 국외 이전 고지입니다. 실제 운영 안내가 아닙니다.' },
    } });
    const body = route.request().postDataJSON(); writes.push(body);
    if (opts.conflict) return route.fulfill({ status: 409, json: { error: '설정이나 안내가 바뀌었어요. 다시 불러온 뒤 선택해 주세요.' } });
    handled = true;
    if (lost) { lost = false; return route.abort(); }
    return route.fulfill({ json: { saved: true, awarded: body.payload.choices.kakao } });
  });
  await page.goto('/consent-reward-test');
  return writes;
}
const all = (page: Page) => page.getByRole('checkbox', { name: /선택 항목 모두 동의하기/ });
const kakao = (page: Page) => page.getByRole('checkbox', { name: /카카오톡 혜택 소식/ });
test('all optional choices take two clicks, without preselection or overflow', async ({ page }, info) => {
  const writes = await backend(page);
  await expect(all(page)).toBeVisible();
  for (const box of await page.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  expect(writes).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('reward-card.png'), fullPage: true });
  await all(page).check(); expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: '동의하고 1만원 쿠폰 받기' }).click();
  await expect(page.getByRole('status')).toContainText('1만원 쿠폰');
  expect(writes[0].payload.choices).toEqual({ analysis: true, overseas: true, kakao: true });
  await expect(page.getByRole('link', { name: /내 쿠폰 보기/ })).toHaveAttribute('href', '/my/coupons');
  await page.reload(); await expect(all(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('Kakao only earns the coupon, details need no navigation', async ({ page }) => {
  const writes = await backend(page);
  await page.getByLabel('[선택] 카카오톡 혜택 소식 받기(광고) 자세히', { exact: true }).click();
  await expect(page.getByText(/이메일·문자 수신을 추가로 신청하지/)).toBeVisible();
  await kakao(page).check(); await expect(all(page)).toHaveAttribute('aria-checked', 'mixed');
  await page.getByRole('button', { name: '동의하고 1만원 쿠폰 받기' }).click();
  expect(writes[0].payload.choices).toEqual({ analysis: false, overseas: false, kakao: true });
  await expect(page.getByRole('status')).toContainText('1만원 쿠폰');
});
test('skip causes no write and suppresses subsequent dashboard prompts', async ({ page }) => {
  const writes = await backend(page); await page.getByRole('button', { name: '지금은 괜찮아요' }).click();
  await expect(all(page)).toHaveCount(0); await page.reload(); await expect(all(page)).toHaveCount(0);
  expect(writes).toHaveLength(0); await expect(page.getByRole('button', { name: '이어서 학습하기' })).toBeVisible();
});
test('uncertain save freezes the chosen payload and retries exactly once without a new request ID', async ({ page }) => {
  const writes = await backend(page, { lost: true }); await kakao(page).check();
  await page.getByRole('button', { name: '동의하고 1만원 쿠폰 받기' }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(kakao(page)).toBeDisabled();
  await page.getByRole('button', { name: '저장 결과 다시 확인하기' }).click();
  await expect(page.getByRole('status')).toContainText('1만원 쿠폰'); expect(writes[0]).toEqual(writes[1]);
});
test('conflict needs reload and a fresh explicit choice', async ({ page }) => {
  const writes = await backend(page, { conflict: true }); await kakao(page).check();
  await page.getByRole('button', { name: '동의하고 1만원 쿠폰 받기' }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('button', { name: '저장 결과 다시 확인하기' })).toBeDisabled();
  await page.getByRole('button', { name: '다시 불러오기' }).click(); await expect(kakao(page)).not.toBeChecked(); expect(writes).toHaveLength(1);
});
test('analysis alone saves without promising a coupon; missing disclosures hide analysis but allow Kakao', async ({ page }) => {
  const writes = await backend(page); await page.getByRole('checkbox', { name: /구매·학습 기록 분석/ }).check();
  await page.getByRole('button', { name: '선택한 내용에 동의하기' }).click();
  await expect(page.getByRole('status')).toContainText('선택한 내용을 저장'); await expect(page.getByRole('link', { name: /내 쿠폰 보기/ })).toHaveCount(0);
  expect(writes[0].payload.choices.kakao).toBe(false);
  await backend(page, { termsMissing: true }); await expect(all(page)).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await expect(kakao(page)).not.toBeChecked();
  await expect(page.getByText('교육·할인 소식을 받아보세요')).toBeVisible();
  await expect(page.getByText(/구매·학습 기록 분석|해외 분석 서버 이용|안내를 준비 중/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: '회원 정보', exact: true })).toHaveAttribute('href', '/my/profile#consent-settings');
  await kakao(page).check();
  await page.getByRole('button', { name: '동의하고 1만원 쿠폰 받기' }).click(); await expect(page.getByRole('status')).toContainText('1만원 쿠폰');
});
test('disabled or previously handled campaign never blocks learning', async ({ page }) => {
  await backend(page, { unavailable: true }); await expect(all(page)).toHaveCount(0); await expect(page.getByRole('button', { name: '이어서 학습하기' })).toBeVisible();
  await backend(page, { handled: true }); await expect(all(page)).toHaveCount(0);
});

test('Kakao-only coupon card is readable on the current viewport', async ({ page }, info) => {
  await backend(page, { termsMissing: true });
  await expect(kakao(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('kakao-only-coupon.png'), fullPage: true });
});
