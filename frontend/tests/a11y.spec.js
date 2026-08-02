import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from "../e2e/storage-state.js";

// Runs as a really-logged-in user. This spec used to fake that by writing
// localStorage.__bbox_auth, which only worked because the app trusted that
// blob -- the offline-login auth bypass. With that hole closed, the fake is
// just a logged-out browser; the real session comes from auth.setup.js.
test.use({ storageState: STORAGE_STATE });
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility (axe-core)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('dashboard page has no critical a11y violations', async ({ page }) => {
    await page.locator('.screen-wrap[data-screen-label="Dashboard"]').waitFor({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
