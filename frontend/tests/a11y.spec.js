import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility (axe-core)', () => {
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

  test('dashboard page has no critical a11y violations', async ({ page }) => {
    await page.locator('.screen-wrap[data-screen-label="Dashboard"]').waitFor({ timeout: 10000 });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')).toEqual([]);
  });
});
