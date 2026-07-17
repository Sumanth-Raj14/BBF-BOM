import { test, expect } from '@playwright/test';

test.describe('App smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set auth & onboarding state before navigating to bypass login screen
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

  test('app loads and renders content into #root', async ({ page }) => {
    const topbar = page.locator('.topbar');
    await expect(topbar).toBeVisible({ timeout: 10000 });
  });

  test('navrail is visible with navigation groups', async ({ page }) => {
    const navrail = page.locator('.navrail');
    await expect(navrail).toBeVisible({ timeout: 10000 });
    const navItems = navrail.locator('[class*="nav-item"]');
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('main content area is rendered', async ({ page }) => {
    const main = page.locator('#main-content');
    await expect(main).toBeAttached({ timeout: 10000 });
  });

  test('dashboard screen is visible by default', async ({ page }) => {
    const dashboard = page.locator('.screen-wrap[data-screen-label="Dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 10000 });
    await expect(dashboard.locator('h1')).toHaveText('Dashboard');
  });
});

test.describe('Navigation', () => {
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

  test('clicking BOM Editor nav item switches screen', async ({ page }) => {
    await page.locator('.navrail').locator('[class*="nav-item"]').filter({ hasText: 'BOM Editor' }).click();
    const subheader = page.locator('.subheader');
    await expect(subheader).toBeVisible({ timeout: 10000 });
  });

  test('clicking Dashboard nav item from another screen returns to dashboard', async ({ page }) => {
    await page.locator('.navrail').locator('[class*="nav-item"]').filter({ hasText: 'BOM Editor' }).click();
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    const dashboard = page.locator('.screen-wrap[data-screen-label="Dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 10000 });
  });
});
