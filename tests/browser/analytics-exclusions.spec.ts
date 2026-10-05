import { test, expect } from '@playwright/test';

test('analytics exclusion needs a reason, preserves expected state and handles a concurrent edit', async ({ page }, info) => {
  let excluded = false, stale = false;
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/admin/analytics-exclusions**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { excluded, forced: false } });
    const body = route.request().postDataJSON(); writes.push(body);
    if (stale) return route.fulfill({ status: 409, json: { error: '다른 관리자가 표시를 변경했습니다. 새로 확인한 뒤 다시 저장해 주세요.' } });
    excluded = body.excluded;
    return route.fulfill({ json: { excluded, changed: true } });
  });
  await page.goto('/analytics-exclusion-test');
  const section = page.getByRole('region', { name: '시험 주문 집계 설정' });
  await expect(section).toContainText('결제·환불 내역과 수강권은 그대로 유지됩니다.');
  const toggle = section.getByRole('checkbox', { name: '시험 주문 · 집계에서 제외' });
  await toggle.check();
  const save = section.getByRole('button', { name: '집계 표시 저장' });
  await expect(save).toBeDisabled();
  await section.getByRole('textbox', { name: '표시 사유' }).fill('합성 내부 검수');
  await expect(save).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  await page.screenshot({ path: info.outputPath('analytics-exclusion.png'), fullPage: true });
  await save.click(); await expect(section.getByRole('status')).toContainText('저장했습니다');
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ kind: 'order', excluded: true, expected: false, reason: '합성 내부 검수' });
  await toggle.uncheck(); await section.getByRole('textbox', { name: '표시 사유' }).fill('일반 고객 주문 확인');
  stale = true; await save.click(); await expect(section.getByRole('alert')).toContainText('다른 관리자가');
  await section.getByRole('button', { name: '다시 시도' }).click(); await expect(toggle).toBeChecked();
  expect(writes[1]).toMatchObject({ excluded: false, expected: true });
});

test('staff never sees a classification control', async ({ page }) => {
  await page.route('**/api/admin/analytics-exclusions**', route => route.fulfill({ status: 403, json: { error: '관리자 전용' } }));
  await page.goto('/analytics-exclusion-test');
  await expect(page.getByRole('region', { name: '시험 주문 집계 설정' })).toHaveCount(0);
});
