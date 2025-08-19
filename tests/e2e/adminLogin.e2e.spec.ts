import { test, expect } from '@playwright/test';

// Contract:
// - Loads /admin/login
// - Fills credentials (seeded admin created on first login in integration tests not available here)
// - We create an admin via the login API if none exists by visiting the login page once and then seeding via a direct POST to our admin creation route if available.
// For now, we assume INITIAL_ADMIN_* env vars create an admin in dev DB.

const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'VerySecurePass123!';

// This test assumes an admin user with the above creds exists; if not, instruct the user in README.

test('admin can log in and see dashboard', async ({ page, baseURL }) => {
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: /administrator login/i })).toBeVisible();

  // CSRF token is embedded in the form; Playwright will just submit like a user.
  await page.getByLabel(/username/i).fill(ADMIN_USER);
  await page.getByLabel(/password/i).fill(ADMIN_PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.getByRole('button', { name: /login/i }).click(),
  ]);

  // Expect redirect to /admin or /admin/dashboard
  const url = page.url();
  expect(url).toMatch(/\/admin(\/dashboard)?$/);
  await expect(page.locator('main >> text=Admin Dashboard').first()).toBeVisible();
});
