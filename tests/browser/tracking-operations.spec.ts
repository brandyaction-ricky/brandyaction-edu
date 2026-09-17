import { expect, test, type Page } from '@playwright/test';

// Exercise the actual React screen with deterministic transport failures and
// responses. These tests never write to DEV/Production, Auth or Meta.
async function fixture(page: Page, failClassification = false, metaOnly = false) {
  let campaign = { id: 'bbbbbbbb-bbbb-4000-8000-000000000002', landing_id: 'aaaaaaaa-aaaa-4000-8000-000000000001', name: '운영 검증 캠페인', utm_campaign: 'qa', start_day: '2026-09-01', end_day: '2026-09-30', new_customer_price: 1650000, existing_customer_price: 1100000, live_peak: null, uses_ads: metaOnly, meta_ad_account_id: metaOnly ? 'act_245402678098216' : null, meta_campaign_ids: metaOnly ? ['120252432290300270'] : [], meta_sync_status: metaOnly ? 'success' : 'not_configured', meta_last_synced_at: null, meta_sync_error: null };
  const sourceRows = metaOnly ? Array.from({ length: 8 }, (_, index) => ({ creative: `cr${String(index + 1).padStart(2, '0')}`, sessions: 0, visitors: 0, cta_click_sessions: 0, cta_clicks: 0 })) : [
    { creative: '소재 60', sessions: 60, visitors: 30, cta_click_sessions: 20, cta_clicks: 60 },
    { creative: '소재 40', sessions: 40, visitors: 20, cta_click_sessions: 4, cta_clicks: 12 },
    { creative: '소재 2', sessions: 2, visitors: 1, cta_click_sessions: 2, cta_clicks: 6 },
  ];
  const rows = sourceRows.map((row, index) => ({ ...row, campaign: metaOnly ? 'META_Cold_카톡방입장_2609' : 'qa', adset: metaOnly ? 'A_메인_브로드_25-54' : '광고세트', ad_type: 'unclassified', impressions: metaOnly ? 1000 + index : 0, link_clicks: metaOnly ? 50 + index : 0, spend: metaOnly ? 10000 + index : 0, registrations: metaOnly ? 5 + index : 0, avg_scroll_depth: metaOnly ? null : 50, avg_dwell_ms: metaOnly ? null : 60000 }));
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
    const devices = url.searchParams.getAll('device'), creatives = url.searchParams.getAll('creative');
    const performance = creatives.length ? rows.filter(row => creatives.includes(row.creative)) : devices.length === 1 ? rows.slice(0, 1) : rows;
    await route.fulfill({ json: {
      campaign, performance, summary_b: { has_data: true, sessions: metaOnly ? 0 : devices.length === 1 ? 60 : 102, visitors: metaOnly ? 0 : 51, cta_click_sessions: metaOnly ? 0 : 26, cta_clicks: metaOnly ? 0 : 78, converted_visitors: metaOnly ? 0 : 13, meta_impressions: metaOnly ? 8028 : 0, meta_link_clicks: metaOnly ? 428 : 0, spend: metaOnly ? 80028 : 0 }, summary_a: null,
      actuals: [], daily: [], options: { campaigns: [metaOnly ? 'META_Cold_카톡방입장_2609' : 'qa'], adsets: [metaOnly ? 'A_메인_브로드_25-54' : '광고세트'], creatives: rows.map(r => r.creative), devices: metaOnly ? [] : ['mobile', 'desktop'], layouts: metaOnly ? [] : [1], ad_types: metaOnly ? ['unclassified'] : ['unclassified', 'cold', 'retarget'] },
      data_state: { sessions_exist: !metaOnly, filtered_sessions_exist: !metaOnly, meta_exists: metaOnly },
      campaign_summary: { kakao_members: 100, kakao_delta: 20, new_payments: 31, existing_payments: 7, revenue: 58850000, spend: 0, roas: null, live_peak: null },
      ui: { errors: {}, daily_a: null, last_collected_at: null, actual_presence: { new_payments: true, existing_payments: true }, previous_day_members: {}, period_actuals: { kakao_members: 80, kakao_day: '2026-09-10', payments: 3 } },
      range: { startDay: url.searchParams.get('start'), endDay: url.searchParams.get('end'), compareStartDay: null, compareEndDay: null },
    } });
  });
  await page.goto('/admin/landing?preset=custom&start=2026-09-15&end=2026-09-15');
  await expect(page.getByRole('region', { name: '소재별 성과표' })).toBeVisible();
  return { requests: () => classificationRequests };
}

test('Meta-only dimensions populate all supported filters and reset without web-only options', async ({ page }) => {
  await fixture(page, false, true);
  const filters = page.getByRole('region', { name: '무료클래스 조회 조건' });
  await filters.getByRole('button', { name: /^상세 필터/ }).click();
  for (const [name, value] of [['캠페인', 'META_Cold_카톡방입장_2609'], ['광고 유형', '미분류'], ['광고세트', 'A_메인_브로드_25-54']] as const) {
    await filters.getByRole('button', { name, exact: true }).click();
    await expect(filters.getByRole('checkbox', { name: value, exact: true })).toBeVisible();
  }
  await filters.getByRole('button', { name: '소재', exact: true }).click();
  await expect(filters.getByRole('group', { name: '소재 다중 선택' }).getByRole('checkbox')).toHaveCount(8);
  await filters.getByRole('checkbox', { name: 'cr08', exact: true }).check();
  await expect(page).toHaveURL(/creative=cr08/);
  await expect(page.getByRole('region', { name: '소재별 성과표' }).locator('tbody tr')).toHaveCount(1);
  for (const name of ['기기', '레이아웃 버전']) {
    await filters.getByRole('button', { name, exact: true }).click();
    await expect(filters.getByRole('group', { name: `${name} 다중 선택` })).toContainText('수집된 항목이 없습니다.');
  }
  await page.getByRole('button', { name: '전체 초기화', exact: true }).click();
  await expect(page).not.toHaveURL(/creative=/);
  await expect(page.getByRole('region', { name: '소재별 성과표' }).locator('tbody tr')).toHaveCount(8);
});

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
