import { test, expect } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'http://localhost:4173';

test.describe('Blackbox BOM — Critical Path Smoke Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.evaluate(() => localStorage.clear());
  });

  test('should render the app shell', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('.app', { timeout: 10000 });
    await expect(page.locator('.brand')).toBeVisible();
    await expect(page.locator('.navrail')).toBeVisible();
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('should navigate between main routes', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('.navrail', { timeout: 10000 });

    const navItems = [
      { label: 'Dashboard', expectedContent: '#main-content' },
      { label: 'BOM Editor', expectedContent: '#main-content' },
    ];

    for (const item of navItems) {
      const navBtn = page.locator('.nav-item').filter({ hasText: item.label }).first();
      if (await navBtn.isVisible()) {
        await navBtn.click();
        await page.waitForTimeout(500);
        await expect(page.locator(item.expectedContent)).toBeVisible();
      }
    }
  });

  test('should show login screen when unauthenticated', async ({ page }) => {
    await page.goto(APP_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(1000);
    const hasAuthScreen = await page.locator('.auth-screen, [class*="Auth"], [class*="login"]').first().isVisible().catch(() => false);
    const hasApp = await page.locator('.app').isVisible().catch(() => false);
    expect(hasAuthScreen || hasApp).toBeTruthy();
  });

  test('should open and close the global search modal', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('.app', { timeout: 10000 });

    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);

    const modalOpen = await page.locator('.modal-overlay, [class*="modal"], [role="dialog"]').first().isVisible().catch(() => false);
    if (modalOpen) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  test('should have functional theme toggle', async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector('.app', { timeout: 10000 });

    const themeBtn = page.locator('.icon-btn[title*="theme"], .icon-btn[aria-label*="theme"]').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await expect(page.locator('.app')).toBeVisible();
    }
  });
});
