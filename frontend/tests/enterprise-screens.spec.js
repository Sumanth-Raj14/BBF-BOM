import { test, expect } from '@playwright/test';

test.describe('Enterprise screens', () => {
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

  test('enterprise dashboards screen renders', async ({ page }) => {
    const navrail = page.locator('.navrail');
    await navrail.locator('[class*="nav-item"]').filter({ hasText: 'Dashboards' }).click();
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
    const genBtn = page.locator('button').filter({ hasText: 'Generate Key' });
    await expect(genBtn).toBeVisible({ timeout: 10000 });
  });
});
