import { expect, test } from '@playwright/test';

const id = '11111111-1111-4111-8111-111111111111';
const rows = [1, 2, 3].map(n => ({ id: n === 1 ? id : `${n}2222222-2222-4222-8222-222222222222`, title: `합성 상품 ${n}`, slug: `synthetic-${n}`, category: 'digital', status: 'draft', price: 0, description: '' }));
const user = { id: 'operator-fixture', full_name: '합성 관리자', role: 'admin', permissions: { products: true } };

for (const outcome of ['success', 'error', 'denied'] as const) {
  test(`editor return never paints the one-record result as a catalog: ${outcome}`, async ({ page }) => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    let listReads = 0;
    await page.route('**/api/platform?**', async route => {
      const params = new URL(route.request().url()).searchParams;
      if (params.get('record')) {
        await route.fulfill({ json: { user, data: { courses: rows.filter(row => row.id === params.get('record')), cohorts: [] }, pagination: null } });
        return;
      }
      listReads++;
      if (listReads === 1) await ready;
      if (outcome === 'denied') { await route.fulfill({ status: 403, json: { user, error: '접근 권한이 없습니다.' } }); return; }
      if (outcome === 'error' && listReads === 1) { await route.fulfill({ status: 503, json: { error: '합성 목록 조회 실패' } }); return; }
      await route.fulfill({ json: { user, data: { courses: rows, cohorts: [], product_summary: [{ id: 'summary', total: 3, draft: 3 }] }, pagination: { page: 1, pageSize: 100, total: 3 } } });
    });
    await page.goto(`/admin/product-editor?id=${id}&navigationFixture=1`);
    await expect(page.getByRole('textbox', { name: '상품명 *', exact: true })).toHaveValue('합성 상품 1');
    await page.getByRole('button', { name: '목록으로', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await expect(page.locator('strong').filter({ hasText: '메뉴 내용을 불러오는 중입니다.' })).toBeVisible();
    await expect(page.getByRole('table', { name: '상품 관리 목록', exact: true })).toHaveCount(0);
    release();
    if (outcome === 'denied') {
      await expect(page.getByText('이 메뉴에 접근할 운영 권한이 없습니다.', { exact: true })).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
      return;
    }
    if (outcome === 'error') {
      await expect(page.getByText('화면 정보를 불러오지 못했습니다. 연결 상태를 확인해 주세요.', { exact: true })).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
      await page.getByRole('button', { name: /다시 시도/ }).click();
    }
    await expect(page.getByText('3개 표시 · 전체 3개 · 현재 페이지에서 검색', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '합성 상품 3', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '합성 상품 2 수정', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '상품명 *', exact: true })).toHaveValue('합성 상품 2');
    await page.getByRole('button', { name: '목록으로', exact: true }).click();
    await expect(page.getByText('3개 표시 · 전체 3개 · 현재 페이지에서 검색', { exact: true })).toBeVisible();
  });
}
