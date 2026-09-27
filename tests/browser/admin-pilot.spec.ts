import { expect, test } from '@playwright/test';

test('orders surface exceptions, preserve date filtering and open details in a drawer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin-pilot-orders-test');
  await expect(page.getByRole('table', { name: '주문·결제·환불·수강권 연결 목록' })).toBeVisible();
  await expect(page.getByText('PILOT-FAIL')).toBeVisible();
  await page.getByRole('button', { name: '결제 실패 1' }).click();
  await expect(page.getByText('PILOT-FAIL')).toBeVisible();
  await expect(page.getByText('PILOT-REFUND')).toHaveCount(0);
  await page.getByRole('button', { name: '전체 3' }).click();
  await page.getByRole('button', { name: '환불 확인 1' }).click();
  await expect(page.getByText('PILOT-REFUND')).toBeVisible();
  await page.getByRole('button', { name: '전체 3' }).click();
  await page.getByRole('button', { name: '수강권 확인 2' }).click();
  await expect(page.getByText('PILOT-ACCESS')).toBeVisible();
  await page.getByRole('button', { name: '전체 3' }).click();
  await page.getByLabel('주문 검색').fill('PILOT-REFUND');
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: '상세' }).click();
  await expect(page.getByRole('dialog', { name: '주문 상세' })).toContainText('PILOT-REFUND');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '초기화' }).click();
  await page.getByLabel('주문일 시작 · KST').fill('2026-09-25');
  await page.getByLabel('주문일 종료 · KST').fill('2026-09-24');
  await page.getByRole('button', { name: '기간 조회' }).click();
  await expect(page.getByText('조회 종료일은 시작일 이후로 선택해 주세요.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('product CRUD list keeps filters, search, edit, archive and restore', async ({ page }) => {
  await page.goto('/admin-pilot-products-test');
  const table = page.getByRole('table', { name: '상품 관리 목록' });
  await expect(table).toBeVisible();
  await page.getByLabel('상품 관리 목록 검색').fill('디지털');
  await expect(table.getByText('파일럿 디지털 자료')).toBeVisible();
  await expect(table.getByText('파일럿 무료 클래스')).toHaveCount(0);
  await page.getByLabel('상품 관리 목록 검색').fill('');
  await page.getByLabel('판매 상태').selectOption('draft');
  await expect(table.getByRole('row')).toHaveCount(2);
  await page.getByLabel('판매 상태').selectOption('');
  await page.getByRole('button', { name: '파일럿 디지털 자료 수정' }).click();
  await expect(page.getByRole('textbox', { name: '상품명' })).toHaveValue('파일럿 디지털 자료');
  await page.getByRole('button', { name: '목록으로' }).click();
  await page.getByRole('button', { name: '파일럿 디지털 자료 삭제' }).click();
  await expect(table.getByText('파일럿 디지털 자료')).toHaveCount(0);
  await page.getByLabel('상품 표시 범위').selectOption('archived');
  await expect(table.getByText('파일럿 디지털 자료')).toBeVisible();
  await page.getByRole('button', { name: '복원' }).click();
  await expect(table.getByText('파일럿 디지털 자료')).toHaveCount(0);
});

test('product editor keeps required validation, save feedback and form grouping', async ({ page }) => {
  await page.goto('/admin-pilot-editor-test');
  await expect(page.getByRole('heading', { name: '기본 정보' })).toBeVisible();
  const title = page.getByRole('textbox', { name: '상품명' });
  await expect(title).toHaveAttribute('required', '');
  await title.fill('');
  await page.getByRole('button', { name: '저장하기' }).click();
  await expect(title).toBeFocused();
  await title.fill('변경한 파일럿 상품');
  await page.getByRole('button', { name: '저장하기' }).click();
  await expect(page.getByRole('status')).toContainText('합성 상품 저장 완료');
});

test('member mission table sorts, opens the common drawer and restores focus', async ({ page }) => {
  await page.goto('/admin/members');
  const table = page.getByRole('table', { name: '회원별 미션 현황 표' });
  await expect(table).toBeVisible();
  const sort = table.getByRole('button', { name: '회원', exact: true });
  await expect(sort).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await sort.click();
  await expect(table.getByRole('columnheader', { name: '회원' })).toHaveAttribute('aria-sort', 'ascending');
  const row = table.getByRole('row', { name: '운영 동선 QA 회원, 재제출 필요' });
  await row.click();
  await expect(page.getByRole('dialog', { name: '운영 동선 QA 회원' })).toContainText('보완 요청');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toBeFocused();
});
