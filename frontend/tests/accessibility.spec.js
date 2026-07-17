import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('__bbox_auth', JSON.stringify({
        name: 'Elena Chen',
        email: 'elena@blackbox-bom.com',
        init: 'EC',
        role: 'engineering',
      }));
      localStorage.setItem('__bbox_role', 'Admin');
      localStorage.setItem('__bbox_onb', '1');
    });
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
    const sub = topbar.locator('.sub');
    await expect(sub).toContainText('BOM');
  });
});
