import type { Page } from '@playwright/test';
export const htmlPath = 'edu/product-html/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.txt';
export async function mockProductHtmlStorage(page: Page, options: { failUpload?: boolean; holdUpload?: Promise<void> } = {}) {
  let source = '';
  await page.route('**/api/platform/upload', route => route.fulfill({ json: { bucket: 'course-resources', path: htmlPath, token: 'synthetic-only', contentType: 'text/plain', value: htmlPath, name: 'detail.html' } }));
  await page.route('**/synthetic-storage/upload?*', async route => {
    await options.holdUpload;
    source = route.request().postData() || '';
    await route.fulfill({ status: options.failUpload ? 409 : 200, json: {} });
  });
  await page.route('**/api/platform/product-html?*', route => route.fulfill({ json: { url: '/synthetic-storage/detail.txt' } }));
  await page.route('**/synthetic-storage/detail.txt', route => route.fulfill({ contentType: 'text/plain', body: source }));
}
