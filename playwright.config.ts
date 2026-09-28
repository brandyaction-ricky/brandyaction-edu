import { defineConfig } from '@playwright/test';

const fixturePort = Number(process.env.FIXTURE_PORT || 4173);
const fixtureURL = `http://127.0.0.1:${fixturePort}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  use: { baseURL: fixtureURL, browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 834, height: 1112 }, hasTouch: true } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: 'node tests/browser/fixture/server.mjs', url: fixtureURL, reuseExistingServer: !process.env.CI },
});
