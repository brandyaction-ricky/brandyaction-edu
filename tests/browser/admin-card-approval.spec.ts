import { expect, test } from '@playwright/test';

test('order history shows the saved card approval number only for approved payments', async ({ page }) => {
  const cases = [
    { key: 'card', method: '카드', status: 'done', number: '00123456', expected: '00123456' },
    { key: 'easy-card', method: '간편결제', status: 'done', number: '00009876', expected: '00009876' },
    { key: 'partial', method: 'CARD', status: 'partial_cancelled', number: '12345678', expected: '12345678' },
    { key: 'cancelled', method: '카드', status: 'cancelled', number: '87654321', expected: '87654321' },
    { key: 'legacy', method: '카드', status: 'paid', number: '00110022', expected: '00110022' },
    { key: 'missing', method: '카드', status: 'done', number: null, expected: null },
    { key: 'bank', method: '계좌이체', status: 'done', number: null, expected: null },
    { key: 'unapproved', method: '카드', status: 'in_progress', number: '11223344', expected: null },
    { key: 'failed', method: '카드', status: 'aborted', number: '55667788', expected: null },
    { key: 'free', method: '카드', status: 'done', number: '99887766', expected: null },
    { key: 'invalid', method: '카드', status: 'done', number: { invalid: true }, expected: null },
  ];
  const orders = cases.map(entry => ({ id: entry.key, order_number: `QA-${entry.key}`, customer_name: '검수 회원', customer_email: 'card-qa@example.test', status: 'paid', total_amount: 1000, created_at: '2026-10-20T00:00:00Z' }));
  const payments = cases.map(entry => ({ id: `payment-${entry.key}`, order_id: entry.key, method: entry.method, status: entry.status, card_approval_number: entry.number, approved_amount: entry.key === 'free' ? 0 : 1000, cancelled_amount: entry.key === 'cancelled' ? 1000 : entry.key === 'partial' ? 100 : 0, approved_at: '2026-10-20T00:00:00Z' }));
  // A failed attempt belonging to the same order must not supply its approval number.
  payments.push({ id: 'failed-attempt', order_id: 'card', method: '카드', status: 'aborted', card_approval_number: '44556677', approved_amount: 0, cancelled_amount: 0, approved_at: '2026-10-20T00:00:00Z' });
  await page.route('**/api/platform?**', route => route.fulfill({ json: {
    user: { id: 'synthetic-admin', full_name: '합성 관리자', role: 'admin' },
    data: { orders, payments, order_items: [], enrollments: [], refunds: [], edu_refund_requests: [] },
  } }));
  await page.goto('/public-data-test?publicScreen=admin/orders');
  const table = page.getByRole('table', { name: '주문·결제·환불·수강권 연결 목록' });
  for (const entry of cases) {
    await table.getByRole('row').filter({ has: page.getByText(`QA-${entry.key}`, { exact: true }) }).getByRole('button', { name: '상세', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '주문 상세', exact: true });
    const history = drawer.locator('.order-timeline');
    if (entry.expected) {
      await expect(history.getByText(`카드 승인번호: ${entry.expected}`, { exact: true })).toBeVisible();
      await expect(history.getByText('카드 승인번호:', { exact: false })).toHaveCount(1);
    } else {
      await expect(history.getByText('카드 승인번호:', { exact: false })).toHaveCount(0);
    }
    await expect(history).not.toContainText('44556677');
    await expect(history.getByText('주문 생성', { exact: true })).toBeVisible();
    await drawer.getByText('닫기', { exact: true }).click();
  }
});
