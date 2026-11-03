import { expect, test } from '@playwright/test';

test('orders filter the full set before paging and retain filters across 100-row pages', async ({ page, isMobile }) => {
  const user = { id: 'synthetic-admin', full_name: '합성 관리자', role: 'admin' };
  const orders = Array.from({ length: 150 }, (_, index) => ({
    id: `order-${index}`, order_number: `QA-${index}`, customer_name: `회원 ${index}`,
    customer_email: `member${index}@example.test`, status: index < 30 ? 'payment_failed' : 'paid',
    total_amount: 1000, created_at: '2026-09-30T00:00:00Z',
  }));
  await page.route('**/api/platform?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    const current = Number(params.get('page') || 1);
    let filtered = orders.filter(order => (!params.get('status') || order.status === params.get('status')) && (!params.get('q') || order.order_number === params.get('q')));
    const counts = { id: 'counts', all: filtered.length, failed: filtered.filter(order => order.status === 'payment_failed').length, refund: 0, access: 0 };
    if (params.get('quick') === 'failed') filtered = filtered.filter(order => order.status === 'payment_failed');
    await route.fulfill({ json: { user, data: { orders: filtered.slice((current - 1) * 100, current * 100), order_filter_counts: [counts], order_summary: [{ id: 'summary', approvedRevenue: 120000 }] }, pagination: { page: current, pageSize: 100, total: filtered.length } } });
  });
  await page.goto('/public-data-test?publicScreen=admin/orders');
  const table = page.getByRole('table', { name: '주문·결제·환불·수강권 연결 목록' });
  await expect(table.locator('tbody tr')).toHaveCount(100);
  const failureBadge = table.getByLabel('상태: 결제 실패').first();
  await expect(failureBadge).toHaveCSS('color', 'rgb(167, 25, 34)');
  await expect(failureBadge).toHaveCSS('background-color', 'rgb(255, 240, 241)');
  await page.getByRole('combobox', { name: '결제 상태', exact: true }).selectOption('paid');
  await expect(page.getByText('검색 결과 120건 중 100건 표시 · 한 페이지 최대 100건')).toBeVisible();
  await expect(table.getByText('QA-30', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(20);
  await expect(page.getByRole('combobox', { name: '결제 상태', exact: true })).toHaveValue('paid');
  await page.getByRole('button', { name: isMobile ? '이전' : '첫 페이지', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(100);
  await expect(page.getByRole('combobox', { name: '결제 상태', exact: true })).toHaveValue('paid');
  const search = page.getByRole('searchbox', { name: '주문 검색', exact: true });
  await search.fill('QA-149');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByText('QA-149', { exact: true })).toBeVisible();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('QA-149');
});
