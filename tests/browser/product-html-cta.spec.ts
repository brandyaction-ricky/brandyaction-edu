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


test('stored HTML keeps anchors and the configured CTA after an asynchronous download', async ({ page }) => {
  await page.route('**/api/platform/product-html?*', route => route.fulfill({ json: { url: '/stored-document.txt' } }));
  await page.route('**/stored-document.txt', route => route.fulfill({ contentType: 'text/plain', body: '<h1>서버 저장 문서</h1><a href="#faq">목차</a><a href="#pp">등록된 신청 버튼</a><p id="faq">자주 묻는 내용</p>' }));
  await page.route('**/join/synthetic/organic', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>합성 모집 링크</h1>' }));
  await page.goto('/product-html-cta-test?stored=1');
  const frame = page.frameLocator('iframe[title="상품 HTML 상세페이지"]');
  await frame.getByRole('link', { name: '목차' }).click();
  await expect(page).toHaveURL(/product-html-cta-test\?stored=1$/);
  await frame.getByRole('link', { name: '등록된 신청 버튼' }).click();
  await expect(page.getByRole('heading', { name: '합성 모집 링크' })).toBeVisible();
});
