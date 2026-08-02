import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from "../e2e/storage-state.js";

// Runs as a really-logged-in user. This spec used to fake that by writing
// localStorage.__bbox_auth, which only worked because the app trusted that
// blob -- the offline-login auth bypass. With that hole closed, the fake is
// just a logged-out browser; the real session comes from auth.setup.js.
test.use({ storageState: STORAGE_STATE });

test.describe('Enterprise screens', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('enterprise dashboards screen renders', async ({ page }) => {
    const navrail = page.locator('.navrail');
    await navrail.locator('.nav-item').filter({ hasText: 'Dashboards' }).first().click();
    await page.waitForTimeout(2000);
    const content = page.locator('#main-content');
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test('service BOM screen has create button', async ({ page }) => {
    await page.getByRole('button', { name: 'Service BOMs', exact: true }).click();
    await page.waitForTimeout(2000);
    const createBtn = page.locator('button').filter({ hasText: 'New Service BOM' });
    await expect(createBtn).toBeVisible({ timeout: 10000 });
  });

  test('API keys screen shows generate button', async ({ page }) => {
    await page.getByRole('button', { name: 'API Keys', exact: true }).click();
    await page.waitForTimeout(2000);
    // The API Keys screen surfaces a "Generate Key" action in both the header
    // and the empty-state CTA; assert the first is visible.
    const genBtn = page.locator('button').filter({ hasText: 'Generate Key' }).first();
    await expect(genBtn).toBeVisible({ timeout: 10000 });
  });
});
