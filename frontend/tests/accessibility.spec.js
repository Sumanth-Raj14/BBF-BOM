import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from "../e2e/storage-state.js";

// Runs as a really-logged-in user. This spec used to fake that by writing
// localStorage.__bbox_auth, which only worked because the app trusted that
// blob -- the offline-login auth bypass. With that hole closed, the fake is
// just a logged-out browser; the real session comes from auth.setup.js.
test.use({ storageState: STORAGE_STATE });

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('skip link is present', async ({ page }) => {
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeAttached();
  });

  test('dashboard has semantic heading', async ({ page }) => {
    const dashboard = page.locator('.screen-wrap[data-screen-label="Dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 10000 });
    const heading = dashboard.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Dashboard');
  });

  test('topbar role indicator is present', async ({ page }) => {
    const topbar = page.locator('.topbar');
    await expect(topbar).toBeVisible();
    // The topbar wordmark carries the "BOM" product label (.bbf-wordmark-bom);
    // the old flat ".sub" element was refactored into the wordmark structure.
    const sub = topbar.locator('.bbf-wordmark-bom');
    await expect(sub).toContainText('BOM');
  });
});
