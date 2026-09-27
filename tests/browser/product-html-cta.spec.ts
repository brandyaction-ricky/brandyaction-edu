import { test, expect } from '@playwright/test';

test('the free webinar HTML CTA uses the configured join link while in-page links stay local', async ({ page }) => {
  await page.route('**/join/synthetic/organic', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>합성 오가닉 모집 링크</h1>' }));
  await page.goto('/product-html-cta-test');
  const frame = page.frameLocator('iframe[title="상품 HTML 상세페이지"]');
  await frame.getByRole('link', { name: '자주 묻는 질문' }).click();
  await expect(page).toHaveURL(/\/product-html-cta-test$/);
  await frame.getByRole('link', { name: /무료강의 대기방 입장/ }).click();
  await expect(page).toHaveURL(/\/join\/synthetic\/organic$/);
  await expect(page.getByRole('heading', { name: '합성 오가닉 모집 링크' })).toBeVisible();
});
