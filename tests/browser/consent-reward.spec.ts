import { test, expect, type Page } from '@playwright/test';
import { metaBackend } from './fixture/meta-consent-backend';

const no = { marketingUse: false, sms: false, kakao: false, email: false };
const revision = '11111111-1111-4111-8111-111111111111';
const rewardRevision = '22222222-2222-4222-8222-222222222222';
async function backend(page: Page, options: { existing?: boolean; awarded?: boolean; lost?: boolean; conflict?: boolean; unavailable?: boolean } = {}) {
  const marketing: { requestId: string; expectedRevision: string | null; choices: typeof no }[] = [];
  const rewards: { requestId: string; payload: { marketingRevision: string | null; choices: { analysis: boolean; overseas: boolean; kakao: boolean } } }[] = [];
  const auth: { data: Record<string, string> }[] = [];
  let stored = { choices: options.existing ? { ...no, marketingUse: true, kakao: true } : { ...no }, revision: options.existing ? revision : null as string | null };
  let awarded = !!options.awarded, lost = options.lost, issues = 0;
  const receipts = new Map<string, unknown>();
  const snapshot = () => ({ ...stored, dates: { marketingUse: null, kakao: null, email: null, sms: null }, updatedAt: '2026-10-17T01:00:00Z', legacyRetired: true });
  await page.route('**/synthetic-auth/consent', async route => { auth.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/account/marketing-consent', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: snapshot() });
    const body = route.request().postDataJSON(); marketing.push(body);
    if (!receipts.has(body.requestId)) {
      if (body.expectedRevision !== stored.revision) return route.fulfill({ status: 409, json: { error: '다른 화면에서 수신 설정을 바꿨어요.' } });
      stored = { choices: body.choices, revision: body.requestId }; receipts.set(body.requestId, snapshot());
    }
    return route.fulfill({ json: receipts.get(body.requestId) });
  });
  await page.route('**/api/account/consent-reward', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: {
      available: !options.unavailable, handled: awarded, awarded, analysisAvailable: false,
      personalRevision: null, marketingRevision: stored.revision, terms: null, reward: { days: 30, minimum: 0 },
    } });
    const body = route.request().postDataJSON(); rewards.push(body);
    if (!receipts.has(body.requestId)) {
      if (options.conflict || body.payload.marketingRevision !== stored.revision) return route.fulfill({ status: 409, json: { error: '설정이나 안내가 바뀌었어요. 다시 불러온 뒤 선택해 주세요.' } });
      if (!awarded) issues++;
      awarded = true; stored = { choices: { ...stored.choices, marketingUse: true, kakao: true }, revision: rewardRevision };
      receipts.set(body.requestId, { saved: true, awarded: true });
    }
    if (lost) { lost = false; return route.abort(); }
    return route.fulfill({ json: receipts.get(body.requestId) });
  });
  return { marketing, rewards, auth, issues: () => issues };
}
const required = (page: Page) => page.getByRole('checkbox', { name: '[필수] 이용약관 및 개인정보처리방침 동의', exact: true });
const kakao = (page: Page) => page.getByRole('checkbox', { name: '카카오톡 광고 받기', exact: true });
async function signup(page: Page) {
  await page.goto('/optional-signup-test');
  await expect(page.getByText('카카오톡 광고 수신 동의 시 1만원 쿠폰', { exact: true })).toBeVisible();
  await required(page).check();
}
async function chooseKakao(page: Page) {
  await page.getByRole('checkbox', { name: '맞춤 소식에 내 정보를 사용하는 데 동의해요', exact: true }).check();
  await kakao(page).check();
}

test('one required checkbox preserves both policy texts and both recorded versions; all optional choices can be skipped', async ({ page }) => {
  const b = await backend(page); await signup(page);
  await expect(page.getByRole('checkbox', { name: /필수/ })).toHaveCount(1);
  await page.getByText('이용약관 전문 보기', { exact: true }).click();
  await expect(page.getByRole('region', { name: '이용약관 전문', exact: true })).toBeVisible();
  await page.getByText('개인정보처리방침 전문 보기', { exact: true }).click();
  await expect(page.getByRole('region', { name: '개인정보처리방침 전문', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(b.auth[0].data.terms_version).toBeTruthy();
  expect(b.auth[0].data.privacy_version).toBe(b.auth[0].data.terms_version);
  expect(b.marketing).toHaveLength(0); expect(b.rewards).toHaveLength(0);
});

test('signup grants one coupon in the same submit, without analysis or overseas consent, and the dashboard never asks again', async ({ page }, info) => {
  const meta = await metaBackend(page);
  const b = await backend(page); await signup(page); await chooseKakao(page);
  await page.getByRole('checkbox', { name: '이메일 광고 받기', exact: true }).check();
  await page.screenshot({ path: info.outputPath('signup-consent-unified.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(b.rewards).toHaveLength(1); expect(b.issues()).toBe(1); expect(meta).toHaveLength(0);
  expect(b.rewards[0].payload.choices).toEqual({ analysis: false, overseas: false, kakao: true });
  expect(b.rewards[0].payload.marketingRevision).toBe(b.marketing[0].requestId);
  expect(b.marketing[0].choices.email).toBe(true);
  await page.goto('/consent-reward-test'); await expect(page.getByRole('region', { name: '쿠폰 혜택 안내' })).toHaveCount(0);
  await page.goto('/optional-consent-test');
  await expect(kakao(page)).toBeChecked(); await expect(page.getByRole('link', { name: '내 쿠폰 보기' })).toBeVisible();
  expect(b.marketing).toHaveLength(1); expect(b.rewards).toHaveLength(1);
});

test('email alone never implies Kakao consent or a coupon', async ({ page }) => {
  const b = await backend(page); await signup(page);
  await page.getByRole('checkbox', { name: '맞춤 소식에 내 정보를 사용하는 데 동의해요', exact: true }).check();
  await page.getByRole('checkbox', { name: '이메일 광고 받기', exact: true }).check();
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(b.marketing[0].choices).toEqual({ ...no, marketingUse: true, email: true }); expect(b.rewards).toHaveLength(0);
});

test('lost signup coupon response retries the identical transaction without repeating marketing consent or issuing twice', async ({ page }) => {
  const b = await backend(page, { lost: true }); await signup(page); await chooseKakao(page);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('alert')).toContainText('쿠폰 발급 결과'); await expect(kakao(page)).toBeDisabled();
  await page.getByRole('button', { name: '쿠폰 발급 다시 확인하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(b.rewards).toHaveLength(2); expect(b.rewards[0]).toEqual(b.rewards[1]);
  expect(b.marketing).toHaveLength(1); expect(b.auth).toHaveLength(1); expect(b.issues()).toBe(1);
});

test('coupon conflict never overwrites another tab and never prevents completing signup', async ({ page }) => {
  const b = await backend(page, { conflict: true }); await signup(page); await chooseKakao(page);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('alert')).toContainText('설정이나 안내가 바뀌었어요');
  await expect(page.getByRole('button', { name: '쿠폰 발급 다시 확인하기', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '가입 계속하기 · 쿠폰과 수신 설정은 회원 정보에서 확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible(); expect(b.issues()).toBe(0); expect(b.rewards).toHaveLength(1);
});

test('existing profile consent is loaded without writes; coupon claim updates the revision used by immediate withdrawal', async ({ page }) => {
  const b = await backend(page, { existing: true }); await page.goto('/optional-consent-test');
  await expect(kakao(page)).toBeChecked(); await expect(page.getByText(/다시 동의할 필요는 없어요/)).toBeVisible();
  await expect(page.getByRole('button', { name: '1만원 쿠폰 받기', exact: true })).toBeVisible(); expect(b.rewards).toHaveLength(0); expect(b.marketing).toHaveLength(0);
  await page.getByRole('button', { name: '1만원 쿠폰 받기', exact: true }).click();
  await expect(page.getByRole('link', { name: '내 쿠폰 보기' })).toBeVisible();
  await kakao(page).uncheck();
  await expect(page.getByRole('status')).toBeVisible();
  expect(b.marketing[0].expectedRevision).toBe(rewardRevision); expect(b.marketing[0].choices.kakao).toBe(false); expect(b.issues()).toBe(1);
});

test('a lost profile coupon response can still be withdrawn without replaying the grant', async ({ page }) => {
  const b = await backend(page, { existing: true, lost: true }); await page.goto('/optional-consent-test');
  await page.getByRole('button', { name: '1만원 쿠폰 받기', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('쿠폰 발급 결과');
  await expect(kakao(page)).toBeEnabled(); await kakao(page).uncheck();
  await expect(page.getByRole('status')).toBeVisible(); expect(b.marketing[0].expectedRevision).toBe(rewardRevision);
  expect(b.marketing[0].choices.kakao).toBe(false); expect(b.rewards).toHaveLength(1);
});

test('dashboard only links to consent management, can be dismissed, and never contains a second consent form', async ({ page }) => {
  const b = await backend(page); await page.goto('/consent-reward-test');
  await expect(page.getByRole('link', { name: '선택 동의·쿠폰 확인' })).toHaveAttribute('href', '/my/profile#consent-settings');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: '지금은 괜찮아요' }).click(); await page.reload();
  await expect(page.getByRole('region', { name: '쿠폰 혜택 안내' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '이어서 학습하기' })).toBeVisible(); expect(b.rewards).toHaveLength(0);
});

test('unavailable coupon offer does not block signup or imply issuance', async ({ page }) => {
  const b = await backend(page, { unavailable: true }); await page.goto('/optional-signup-test'); await required(page).check(); await chooseKakao(page);
  await expect(page.getByText('카카오톡 광고 수신 동의 시 1만원 쿠폰', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(b.marketing).toHaveLength(1); expect(b.rewards).toHaveLength(0);
});

const metaOption = (page: Page) => page.getByRole('checkbox', { name: '[선택] Meta 구매 전환 측정을 위한 정보 제공·국외 이전 동의', exact: true });
test('marketing aggregate never includes Meta; Meta alone saves separately without a coupon or marketing opt-in', async ({ page }) => {
  const meta = await metaBackend(page), b = await backend(page); await signup(page);
  const allNews = page.getByRole('checkbox', { name: '[선택] 교육·할인·행사 소식 받기 (광고)', exact: true });
  await allNews.check(); await expect(metaOption(page)).not.toBeChecked(); await allNews.uncheck();
  await metaOption(page).check();
  await page.getByText('Meta에 보내는 정보와 국외 이전 안내', { exact: true }).click();
  await expect(page.getByText('합성 Meta 수신자', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(b.marketing).toHaveLength(0); expect(b.rewards).toHaveLength(0); expect(meta).toHaveLength(1);
  expect(meta[0]).toMatchObject({ consented: true, surface: 'signup', wordingVersion: 'synthetic-meta-v1' });
  await page.goto('/optional-consent-test'); await expect(metaOption(page)).toBeChecked(); await expect(kakao(page)).not.toBeChecked(); expect(meta).toHaveLength(1);
});

test('Meta response loss retries only Meta after signup and coupon success', async ({ page }) => {
  const meta = await metaBackend(page, { lost: true }), b = await backend(page); await signup(page); await chooseKakao(page); await metaOption(page).check();
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('alert')).toContainText('Meta 동의 저장 결과');
  await page.getByRole('button', { name: 'Meta 동의 저장 다시 확인하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(meta).toHaveLength(2); expect(meta[0]).toEqual(meta[1]); expect(b.marketing).toHaveLength(1); expect(b.auth).toHaveLength(1); expect(b.issues()).toBe(1);
});

test('deselecting Meta after a lost signup response revokes the actual choice while keeping the coupon', async ({ page }) => {
  const meta = await metaBackend(page, { lost: true }), b = await backend(page); await signup(page); await chooseKakao(page); await metaOption(page).check();
  await page.getByRole('button', { name: '동의하고 가입 완료' }).click(); await expect(page.getByRole('alert')).toContainText('Meta 동의 저장 결과');
  await metaOption(page).uncheck(); await page.getByRole('button', { name: 'Meta 동의 저장 다시 확인하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible();
  expect(meta[1].consented).toBe(false); expect(meta[1].expectedRevision).toBe(meta[0].requestId); expect(b.issues()).toBe(1); expect(b.marketing).toHaveLength(1);
});

test('profile withdraws Meta independently and does not renew changed terms by default', async ({ page }) => {
  const meta = await metaBackend(page, { existing: true, renewal: true }), b = await backend(page, { existing: true, awarded: true });
  await page.goto('/optional-consent-test'); await expect(metaOption(page)).not.toBeChecked();
  await expect(page.getByText(/안내가 바뀌어 기존 동의/)).toBeVisible();
  await page.getByRole('button', { name: 'Meta 동의 취소', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Meta 구매 전환 측정 동의를 취소');
  expect(meta[0].consented).toBe(false); expect(meta[0].surface).toBe('profile'); expect(b.marketing).toHaveLength(0); expect(b.rewards).toHaveLength(0);
  await expect(kakao(page)).toBeChecked();
});

test('missing approved Meta disclosure disables new consent without blocking coupon signup', async ({ page }) => {
  const meta = await metaBackend(page, { unavailable: true }), b = await backend(page); await signup(page);
  await expect(metaOption(page)).toBeDisabled(); await chooseKakao(page); await page.getByRole('button', { name: '동의하고 가입 완료' }).click();
  await expect(page.getByRole('heading', { name: '가입 완료 목적지' })).toBeVisible(); expect(meta).toHaveLength(0); expect(b.issues()).toBe(1);
});
