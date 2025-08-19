import { test, expect } from '@playwright/test';

function uniqueEmail() {
  const ts = Date.now();
  return `playwright_${ts}@example.com`;
}

test('Newsletter subscription flow', async ({ page }) => {
  await page.goto('/blog');

  // Find a newsletter form (footer or inline). Prefer one with an email input.
  const emailInput = page.locator('form.signup-form input[type="email"]').first();
  await expect(emailInput).toBeVisible();

  const email = uniqueEmail();
  await emailInput.fill(email);

  // Click submit on the same form
  const form = emailInput.locator('xpath=ancestor::form[1]');
  await form.locator('button[type="submit"]').click();

  // Expect redirect to welcome page
  await page.waitForURL(/\/newsletter-welcome\?email=/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/newsletter-welcome\?email=/);

  // A success header or description should be visible
  await expect(page.locator('h1:has-text("Thank You for Subscribing!")')).toBeVisible();
});
