import { test, expect } from '@playwright/test';

test.describe('App smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('app loads and renders content into #root', async ({ page }) => {
    const topbar = page.locator('.topbar');
    await expect(topbar).toBeVisible({ timeout: 10000 });
  });

  test('navrail is visible with navigation groups', async ({ page }) => {
    const navrail = page.locator('.navrail');
    await expect(navrail).toBeVisible({ timeout: 10000 });
    const navItems = navrail.locator('.nav-item');
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
    await page.goto('/');
  });

  test('clicking BOM Editor nav item switches screen', async ({ page }) => {
    await page.locator('.navrail').locator('.nav-item').filter({ hasText: 'BOM Editor' }).first().click();
    // #main-content carries data-screen-label of the active screen (set in
    // App.jsx from the nav label); navigating to BOM Editor sets it to
    // "BOM Editor". (The old ".subheader" element this test used is gone, and
    // the BOM Editor screen doesn't use the per-screen ".screen-wrap".)
    await expect(
      page.locator('#main-content[data-screen-label="BOM Editor"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('clicking Dashboard nav item from another screen returns to dashboard', async ({ page }) => {
    await page.locator('.navrail').locator('.nav-item').filter({ hasText: 'BOM Editor' }).first().click();
    // Exact ^Dashboard$ so it doesn't also match the "Dashboards" nav item, and
    // scope to the navrail so it doesn't collide with other "Dashboard" buttons.
    await page.locator('.navrail').locator('.nav-item').filter({ hasText: /^Dashboard$/ }).first().click();
    const dashboard = page.locator('.screen-wrap[data-screen-label="Dashboard"]');
    await expect(dashboard).toBeVisible({ timeout: 10000 });
  });
});
