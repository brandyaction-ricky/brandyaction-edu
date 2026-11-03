import { expect, test } from '@playwright/test';
test('completed refund ledger is shown even when no administrator refund request exists', async ({ page }) => {
  await page.route('**/api/platform?**', route => route.fulfill({ json: {
    user: { id: 'synthetic-admin', role: 'admin' },
    data: {
      orders: [{ id: 'order-qa', order_number: 'QA-REFUND', user_id: 'member-qa', customer_name: '합성 회원', customer_email: 'refund@example.test', status: 'refunded', total_amount: 1100000, created_at: '2026-09-28T15:00:00Z' }],
      payments: [{ id: 'payment-qa', order_id: 'order-qa', status: 'cancelled', method: '카드', approved_amount: 1100000, cancelled_amount: 1100000, created_at: '2026-09-28T15:00:00Z' }],
      refunds: [{ id: 'refund-qa', payment_id: 'payment-qa', amount: 1100000, status: 'done', reason: '합성 취소 완료 사유', requested_at: '2026-10-02T04:00:00Z', completed_at: '2026-10-02T05:00:00Z' }],
      edu_refund_requests: [],
    }, pagination: { page: 1, pageSize: 100, total: 1 },
  } }));
  await page.goto('/public-data-test?publicScreen=admin/orders');
  await page.getByRole('button', { name: '상세', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('결제 취소·환불 완료', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/합성 취소 완료 사유/)).toBeVisible();
});
