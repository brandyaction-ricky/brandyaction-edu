import { expect, test } from '@playwright/test';

test('missing sales fields mark every affected tab, focus the first field, and save after correction', async ({ page }) => {
  await page.goto('/product-sale-test?missing=1');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  for (const tab of ['기본·판매', '상세페이지', '수강·권한']) await expect(page.getByRole('tab', { name: tab })).toHaveClass(/has-error/);
  await expect(page.getByLabel('고객에게 보이는 수강 기간', { exact: true })).toBeFocused();
  await page.getByLabel('고객에게 보이는 수강 기간', { exact: true }).fill('6주 과정');
  await expect(page.getByRole('tab', { name: '수강·권한' })).not.toHaveClass(/has-error/);
  await page.getByRole('button', { name: '교육 일정을 입력해 주세요. 예: 10월 5일 시작' }).click();
  await expect(page.getByLabel('일정 안내', { exact: true })).toBeFocused();
  await page.getByLabel('일정 안내', { exact: true }).fill('10월 5일 시작');
  await page.getByRole('button', { name: '상세페이지 이미지 또는 HTML 파일을 등록해 주세요.' }).click();
  await expect(page.locator('[data-validation-field="detail_content"]')).toHaveClass(/product-invalid-group/);
  await page.getByRole('tab', { name: 'HTML 상세페이지', exact: true }).click();
  await page.locator('input[type=file][accept=".html,.htm,text/html"]').setInputFiles({ name: 'detail.html', mimeType: 'text/html', buffer: Buffer.from('<!doctype html><html><body><h1>합성 상품 소개</h1></body></html>') });
  await expect(page.getByRole('tab', { name: '상세페이지', exact: true })).not.toHaveClass(/has-error/);
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
  await expect(page.locator('.product-validation-summary')).toHaveCount(0);
});

test('switching to draft allows incomplete content but still requires a product name', async ({ page }) => {
  await page.goto('/product-sale-test?missing=1');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await page.getByRole('tab', { name: '기본·판매' }).click();
  await page.getByLabel('판매 상태', { exact: true }).selectOption('draft');
  await page.getByLabel('상품명', { exact: true }).fill('   ');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('상품명', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await page.getByLabel('상품명', { exact: true }).fill('작성 중 상품');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
});

test('expired recruitment is blocked and corrected without any save or confirm before correction', async ({ page }) => {
  await page.goto('/product-sale-test?expired=1');
  page.on('dialog', async dialog => { await dialog.dismiss(); throw new Error('누락은 확인창 대신 입력칸에 표시해야 합니다.'); });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('모집 마감 · KST', { exact: true })).toBeFocused();
  await expect(page.getByLabel('모집 마감 · KST', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await page.getByLabel('모집 마감 · KST', { exact: true }).fill('2099-10-01T23:59');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
});

test('an invalid date range is blocked for drafts too', async ({ page }) => {
  await page.goto('/product-sale-test?draft=1');
  await page.getByLabel('모집 시작 · KST', { exact: true }).fill('2099-10-02T10:00');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('모집 마감 · KST', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
});

test('closed cohort points to its status and allows product save after the separate cohort save', async ({ page }) => {
  await page.goto('/product-sale-test?closed=1');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('기수 상태', { exact: true })).toBeFocused();
  await expect(page.getByLabel('기수 상태', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
  await page.getByLabel('기수 상태', { exact: true }).selectOption('recruiting');
  await page.getByRole('button', { name: '기수 저장', exact: true }).click();
  await expect(page.getByLabel('합성 기수 저장 횟수')).toHaveText('1');
  await expect(page.getByRole('tab', { name: '기수·회차' })).not.toHaveClass(/has-error/);
  await page.getByRole('tab', { name: '기본·판매' }).click();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
});

test('invalid format in a hidden tab is highlighted and focused', async ({ page }) => {
  await page.goto('/product-sale-test');
  await page.getByRole('tab', { name: '공개·검색' }).click();
  await page.getByLabel('Meta Pixel ID (Optional)', { exact: true }).fill('abc');
  await page.getByRole('tab', { name: '기본·판매' }).click();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('Meta Pixel ID (Optional)', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Meta Pixel ID (Optional)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
});

test('new published product validates against its automatically created cohort', async ({ page }) => {
  await page.goto('/product-sale-test?new=1');
  await page.getByLabel('상품명', { exact: true }).fill('새 판매 상품');
  await page.getByLabel('상품 유형', { exact: true }).selectOption('paid_class');
  await page.getByLabel('판매 상태', { exact: true }).selectOption('published');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('상품 기본 판매가 · 원', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('상품 기본 판매가 · 원', { exact: true }).fill('100000');
  await page.getByLabel('모집 마감 · KST', { exact: true }).fill('2099-10-01T23:59');
  await page.getByRole('button', { name: '교육 일정을 입력해 주세요. 예: 10월 5일 시작' }).click();
  await page.getByLabel('일정 안내', { exact: true }).fill('10월 5일 시작');
  await page.getByRole('button', { name: '수강 기간을 입력해 주세요. 예: 6주 과정' }).click();
  await page.getByLabel('고객에게 보이는 수강 기간', { exact: true }).fill('6주');
  await page.getByRole('button', { name: '상세페이지 이미지 또는 HTML 파일을 등록해 주세요.' }).click();
  await page.getByRole('tab', { name: 'HTML 상세페이지', exact: true }).click();
  await page.locator('input[type=file][accept=".html,.htm,text/html"]').setInputFiles({ name: 'detail.html', mimeType: 'text/html', buffer: Buffer.from('<html><body>새 상품 소개</body></html>') });
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('1');
});


test('a deadline that passes while the editor is open is checked again at save time', async ({ page }) => {
  await page.clock.install({ time: new Date('2099-10-01T14:58:58Z') });
  await page.goto('/product-sale-test');
  await expect(page.locator('aside').getByText('판매 중', { exact: true }).first()).toBeVisible();
  await page.clock.setFixedTime(new Date('2099-10-01T14:59:01Z'));
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByLabel('모집 마감 · KST', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
});
