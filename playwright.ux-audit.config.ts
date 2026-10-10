import { defineConfig } from '@playwright/test';
const port = Number(process.env.FIXTURE_PORT || 4220);
export default defineConfig({
  testDir: './tests/ux-audit', fullyParallel: true, retries: 0, workers: 2,
  reporter: [['list'], ['json', { outputFile: 'test-results/ux-audit.json' }]],
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'node tests/browser/fixture/server.mjs', url: `http://127.0.0.1:${port}`, reuseExistingServer: true },
});
