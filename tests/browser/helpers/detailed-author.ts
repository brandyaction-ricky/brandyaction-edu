import type { Page } from '@playwright/test';
export async function detailedAuthor(page: Page) {
  await page.addLocatorHandler(page.getByRole('button', { name: '항목별 상세 설정', exact: true }), async button => { await button.click(); });
}
