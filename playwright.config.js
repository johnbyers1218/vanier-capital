// Playwright configuration (ESM)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'node scripts/start-test-server.mjs',
    url: (process.env.E2E_BASE_URL || 'http://localhost:3000') + '/',
    reuseExistingServer: true,
    timeout: 90000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
