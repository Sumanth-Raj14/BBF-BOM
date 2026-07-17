import { test, expect } from '@playwright/test';

test.describe('PWA', () => {
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

  test('manifest link is present', async ({ page }) => {
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toBeAttached({ timeout: 10000 });
    const href = await manifestLink.getAttribute('href');
    expect(href).toContain('manifest');
  });

  test('apple-touch-icon link is present', async ({ page }) => {
    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toBeAttached({ timeout: 10000 });
    const href = await appleIcon.getAttribute('href');
    expect(href).toContain('icon');
  });

  test('theme-color meta is set', async ({ page }) => {
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#e85d1f');
  });

  test('manifest.json content is valid', async ({ page }) => {
    const manifestLink = page.locator('link[rel="manifest"]');
    const href = await manifestLink.getAttribute('href');
    const resp = await page.request.get(href);
    expect(resp.ok()).toBeTruthy();
    const json = await resp.json();
    expect(json.name).toBe('Blackbox BOM Scanner');
    expect(json.icons.length).toBeGreaterThanOrEqual(2);
  });

  test('service worker file is available', async ({ page }) => {
    const resp = await page.request.get('/sw.js');
    expect(resp.ok()).toBeTruthy();
    const text = await resp.text();
    expect(text).toContain('self.addEventListener');
  });
});
