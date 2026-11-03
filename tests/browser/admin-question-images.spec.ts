import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const question = '00000000-0000-4000-8000-000000000040';
const url = `/admin/questions?question=${question}`;
const png = readFileSync('public/brandy-action-logo.png');

test('question inbox displays the private attachment and keeps it available in the answer dialog', async ({ page }, info) => {
  await page.context().route('**/api/platform/question-images?**', route => {
    expect(new URL(route.request().url()).searchParams.get('question')).toBe(question);
    return route.fulfill({ contentType: 'image/png', body: png });
  });
  await page.goto(`${url}&questionImage=1`);
  const card = page.locator('.question-admin-card');
  const image = card.getByAltText('질문 첨부 이미지');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const link = card.getByRole('link', { name: '질문 이미지 크게 보기' });
  await expect(link).toHaveAttribute('href', `/api/platform/question-images?question=${question}&attempt=0`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const popupReady = page.waitForEvent('popup');
  await link.click();
  const popup = await popupReady;
  await popup.waitForLoadState();
  expect(new URL(popup.url()).searchParams.get('question')).toBe(question);
  await expect.poll(() => popup.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await popup.close();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('admin-question-image.png'), fullPage: true });
  await card.getByRole('button', { name: '답변 수정', exact: true }).click();
  await expect(page.getByRole('dialog').getByAltText('질문 첨부 이미지')).toBeVisible();
});

test('question inbox offers a retry for an unavailable image without hiding the question', async ({ page }) => {
  let broken = true;
  await page.route('**/api/platform/question-images?**', route => route.fulfill(broken
    ? { status: 403, body: 'forbidden' }
    : { contentType: 'image/png', body: png }));
  await page.goto(`${url}&questionImage=1`);
  const card = page.locator('.question-admin-card');
  await expect(card.getByRole('alert')).toContainText('질문 이미지를 불러오지 못했습니다.');
  await expect(card.getByRole('heading', { name: '합성 보관 질문' })).toBeVisible();
  broken = false;
  await card.getByRole('button', { name: '이미지 다시 보기' }).click();
  await expect.poll(() => card.getByAltText('질문 첨부 이미지').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('questions without an attachment do not show an empty image or request a file', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/platform/question-images?**', route => { reads++; return route.abort(); });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: '합성 보관 질문' })).toBeVisible();
  await expect(page.locator('.question-admin-card figure')).toHaveCount(0);
  expect(reads).toBe(0);
});
