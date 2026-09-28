import { expect, test } from '@playwright/test';

test('home banner indicators have usable hit areas without changing slide navigation', async ({ page }) => {
  await page.goto('/home-hero-touch-test');
  const indicators = page.locator('.hero-slider-dots button');
  await expect(indicators).toHaveCount(2);
  for (const indicator of await indicators.all()) {
    const bounds = await indicator.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await indicators.nth(1).click();
  await expect(page.getByRole('heading', { name: '두 번째 배너' })).toBeVisible();
  await indicators.nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '첫 번째 배너' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('member mission row and drawer actions remain readable and focusable', async ({ page, isMobile }) => {
  await page.goto('/admin/members');
  const action = page.locator('.participant-row-action').first();
  await expect(action).toBeVisible();
  const bounds = await action.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(isMobile ? 44 : 36);
  const fontSize = await action.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(isMobile ? 13 : 12);
  await action.focus();
  await expect(action).toBeFocused();
  expect(await action.evaluate(element => getComputedStyle(element).outlineWidth)).toBe('2px');
  await page.locator('.participant-member-link').first().click();
  const drawerAction = page.locator('.participant-drawer-mission .participant-row-action').first();
  await expect(drawerAction).toBeVisible();
  const drawerBounds = await drawerAction.boundingBox();
  expect(drawerBounds!.height).toBeGreaterThanOrEqual(isMobile ? 44 : 36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('many banner indicators wrap without horizontal page overflow', async ({ page }) => {
  await page.goto('/home-hero-touch-test?many=1');
  await expect(page.locator('.hero-slider-dots button')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
