import { expect, test, type Page } from '@playwright/test';

// Exercise the actual React screen with deterministic transport failures and
// responses. These tests never write to DEV/Production, Auth or Meta.
async function fixture(page: Page, failClassification = false) {
  let campaign = { id: 'bbbbbbbb-bbbb-4000-8000-000000000002', landing_id: 'aaaaaaaa-aaaa-4000-8000-000000000001', name: '운영 검증 캠페인', utm_campaign: 'qa', start_day: '2026-09-01', end_day: '2026-09-30', new_customer_price: 1650000, existing_customer_price: 1100000, live_peak: null, uses_ads: false, meta_ad_account_id: null, meta_campaign_ids: [], meta_sync_status: 'not_configured', meta_last_synced_at: null, meta_sync_error: null };
  const rows = [
    { creative: '소재 60', sessions: 60, visitors: 30, cta_click_sessions: 20, cta_clicks: 60 },
    { creative: '소재 40', sessions: 40, visitors: 20, cta_click_sessions: 4, cta_clicks: 12 },
    { creative: '소재 2', sessions: 2, visitors: 1, cta_click_sessions: 2, cta_clicks: 6 },
  ].map(row => ({ ...row, campaign: 'qa', adset: '광고세트', ad_type: 'unclassified', impressions: 0, link_clicks: 0, spend: 0, avg_scroll_depth: 50, avg_dwell_ms: 60000 }));
  let classificationRequests = 0;
  await page.route('**/api/landing/performance**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'classification') {
        classificationRequests++;
        if (failClassification && classificationRequests === 1) { await route.fulfill({ status: 503, json: { error: '광고 유형을 저장하지 못했습니다.' } }); return; }
        for (const row of rows) if (row.creative === body.creative) row.ad_type = body.ad_type;
        await route.fulfill({ json: { ok: true } }); return;
      }
      if (body.action === 'campaign') { campaign = { ...campaign, ...body.values }; await route.fulfill({ json: { ok: true, campaign } }); return; }
      await route.fulfill({ status: 405, json: { error: '이 검증에서는 저장하지 않습니다.' } }); return;
    }
    if (!url.searchParams.has('start')) {
      await route.fulfill({ json: { can_manage_campaign: true, courses: [{ id: campaign.landing_id, title: '운영 검증 클래스', status: 'published', tracking: 'active', campaigns: [campaign] }] } }); return;
    }
    const devices = url.searchParams.getAll('device');
    const performance = devices.length === 1 ? rows.slice(0, 1) : rows;
    await route.fulfill({ json: {
      campaign, performance, summary_b: { has_data: true, sessions: devices.length === 1 ? 60 : 102, visitors: 51, cta_click_sessions: 26, cta_clicks: 78, converted_visitors: 13, meta_impressions: 0, meta_link_clicks: 0, spend: 0 }, summary_a: null,
      actuals: [], daily: [], options: { campaigns: ['qa'], adsets: ['광고세트'], creatives: rows.map(r => r.creative), devices: ['mobile', 'desktop'], layouts: [1], ad_types: ['unclassified', 'cold', 'retarget'] },
      data_state: { sessions_exist: true, filtered_sessions_exist: true, meta_exists: false },
      campaign_summary: { kakao_members: 100, kakao_delta: 20, new_payments: 31, existing_payments: 7, revenue: 58850000, spend: 0, roas: null, live_peak: null },
      ui: { errors: {}, daily_a: null, last_collected_at: null, actual_presence: { new_payments: true, existing_payments: true }, previous_day_members: {}, period_actuals: { kakao_members: 80, kakao_day: '2026-09-10', payments: 3 } },
      range: { startDay: url.searchParams.get('start'), endDay: url.searchParams.get('end'), compareStartDay: null, compareEndDay: null },
    } });
  });
  await page.goto('/admin/landing?preset=custom&start=2026-09-15&end=2026-09-15');
  await expect(page.getByRole('region', { name: '소재별 성과표' })).toBeVisible();
  return { requests: () => classificationRequests };
}

test('sample threshold persists and conversion sorting keeps insufficient rows last in both directions', async ({ page }) => {
  await fixture(page);
  const table = page.getByRole('region', { name: '소재별 성과표' });
  const header = table.getByRole('columnheader', { name: '방문 전환율', exact: true });
  await header.getByRole('button').click(); await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect(table.locator('tbody tr').last()).toContainText('소재 2');
  await header.getByRole('button').click(); await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(table.locator('tbody tr').first()).toContainText('소재 40');
  await expect(table.locator('tbody tr').last()).toContainText('표본 부족');
  await page.getByRole('spinbutton', { name: '표본 기준 · 방문' }).fill('1');
  await expect(page).toHaveURL(/sample_min=1(?:&|$)/);
  await page.reload(); await expect(page.getByRole('spinbutton', { name: '표본 기준 · 방문' })).toHaveValue('1');
  await expect(table.getByText('100.0%', { exact: true })).toBeVisible();
});

test('classification failure retains draft and saved baseline, retry persists across reload', async ({ page }) => {
  const state = await fixture(page, true);
  const row = page.getByRole('region', { name: '소재별 성과표' }).locator('tbody tr').filter({ hasText: '소재 60' });
  await row.getByRole('combobox').selectOption('cold');
  await expect(row.getByRole('alert')).toHaveText('저장 실패 · 저장값: 미분류');
  await expect(row.getByRole('combobox')).toHaveValue('cold');
  await row.getByRole('button', { name: '다시 저장' }).click();
  await expect(row.getByRole('status')).toHaveText('저장됨 · 콜드');
  expect(state.requests()).toBe(2);
  await page.reload(); await expect(row.getByRole('combobox')).toHaveValue('cold');
});

test('filters toggle without reset, update chips and hide non-attributed manual conversion', async ({ page }) => {
  await fixture(page);
  const toggle = page.getByRole('button', { name: /^상세 필터/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false'); await toggle.click();
  await page.getByRole('button', { name: '기기', exact: true }).click();
  await page.getByRole('checkbox', { name: '모바일', exact: true }).check();
  await page.getByRole('checkbox', { name: '데스크톱', exact: true }).check();
  const done = page.getByRole('button', { name: '선택 완료', exact: true });
  if (await done.isVisible()) await done.click(); else await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('실측값은 소재·기기 필터가 적용되지 않습니다.', { exact: false })).toBeVisible();
  const funnel = page.getByRole('region', { name: '선택 기간 전환 퍼널' });
  await expect(funnel).not.toContainText('CTA → 카톡방');
  await page.getByRole('button', { name: '기기 모바일 필터 삭제' }).click();
  await expect(page).not.toHaveURL(/device=mobile/);
  await page.getByRole('button', { name: '전체 초기화', exact: true }).click();
  await expect(page).not.toHaveURL(/device=/);
  await expect(funnel).toContainText('CTA → 카톡방');
});

test('campaign save updates persisted form and legacy settings URL stays closed after reload', async ({ page }) => {
  await fixture(page);
  await page.goto('/admin/landing?tab=settings&preset=custom&start=2026-09-15&end=2026-09-15');
  const drawer = page.getByRole('dialog', { name: '캠페인 설정', exact: true });
  await drawer.getByRole('textbox', { name: '캠페인명', exact: true }).fill('저장된 캠페인');
  await drawer.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(drawer.getByRole('textbox', { name: '캠페인명', exact: true })).toHaveValue('저장된 캠페인');
  await expect(drawer.getByRole('button', { name: '설정 저장', exact: true })).toBeDisabled();
  await drawer.getByRole('button', { name: '닫기', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /운영 검증 클래스/ })).toBeChecked();
  await expect(drawer).toHaveCount(0); await expect(page).toHaveURL(/tab=dashboard/);
});
