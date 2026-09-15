import { expect, test, type Page } from '@playwright/test';

const account = 'act_123456789';
const ids = ['120000000000000001', '120000000000000003'];
async function fixture(page: Page, common: string | null = account) {
  let saved: Record<string, unknown> = { meta_ad_account_id: common }, payload: Record<string, unknown> = {}, syncs = 0;
  await page.route('**/api/landing/performance**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      if (new URL(request.url()).pathname.endsWith('/meta')) {
        syncs++;
        await route.fulfill({ status: 503, json: { error: '서버 연동 설정이 필요합니다.' } });
        return;
      }
      payload = request.postDataJSON().values;
      saved = { ...saved, ...payload, meta_ad_account_id: common, meta_sync_status: 'idle' };
      const response = await route.fetch({ method: 'GET' });
      const data = await response.json();
      await route.fulfill({ json: { ok: true, campaign: { ...data.courses[0].campaigns[0], ...saved } } });
      return;
    }
    const response = await route.fetch();
    const data = await response.json();
    if (data.campaign) data.campaign = { ...data.campaign, ...saved };
    if (data.courses) for (const course of data.courses) course.campaigns = course.campaigns.map((campaign: Record<string, unknown>) => ({ ...campaign, ...saved }));
    await route.fulfill({ json: data });
  });
  await page.goto('/admin/landing');
  await page.getByRole('region', { name: '무료클래스 조회 조건' }).getByRole('button', { name: '캠페인 설정', exact: true }).click();
  return { payload: () => payload, syncs: () => syncs };
}

test('shared account cannot be edited; multiple campaign IDs persist and unlock resync after saving', async ({ page }) => {
  const state = await fixture(page);
  const drawer = page.getByRole('dialog', { name: '캠페인 설정', exact: true });
  const accountInput = drawer.getByRole('textbox', { name: /^Meta 광고계정 ID/ });
  const campaignIds = drawer.getByRole('textbox', { name: /^Meta 캠페인 ID/ });
  const save = drawer.getByRole('button', { name: '설정 저장', exact: true });
  const sync = drawer.getByRole('button', { name: 'Meta 재동기화', exact: true });
  await expect(accountInput).toHaveValue(account); await expect(accountInput).not.toBeEditable();
  await accountInput.press('9'); await expect(accountInput).toHaveValue(account); await expect(save).toBeDisabled();
  await expect(sync).toBeDisabled();
  await campaignIds.fill(`${ids[0]}\n${ids[1]},${ids[0]}`); await expect(sync).toBeDisabled();
  await save.click(); await expect(save).toBeDisabled(); await expect(sync).toBeEnabled();
  expect(state.payload()).not.toHaveProperty('meta_ad_account_id'); expect(state.payload().meta_campaign_ids).toEqual(ids);
  await page.reload(); await expect(campaignIds).toHaveValue(ids.join('\n')); await expect(accountInput).toHaveValue(account); await expect(sync).toBeEnabled();
  await sync.click(); await expect(page.getByText('동기화 실패 · 서버 연동 설정이 필요합니다.', { exact: true })).toBeVisible();
  expect(state.syncs()).toBe(1); await expect(campaignIds).toHaveValue(ids.join('\n')); await expect(accountInput).toHaveValue(account);
});

test('missing common configuration directs the operator to shared setup and prevents sync', async ({ page }) => {
  await fixture(page, null);
  const drawer = page.getByRole('dialog', { name: '캠페인 설정', exact: true });
  await expect(drawer.getByRole('textbox', { name: /^Meta 광고계정 ID/ })).not.toBeEditable();
  await expect(drawer.getByText(/공통 광고계정이 설정되지 않았습니다/)).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Meta 재동기화', exact: true })).toBeDisabled();
});
