import { test, expect } from '@playwright/test';

test('debug: capture errors and page state', async ({ page }) => {
  const errors = [];
  const consoleLogs = [];

  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

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
  await page.waitForTimeout(5000);

  console.log('=== CONSOLE LOGS ===');
  consoleLogs.forEach(l => console.log(l));

  console.log('=== PAGE ERRORS ===');
  errors.forEach(e => console.log(e));

  const html = await page.content();
  console.log('=== HTML LENGTH ===', html.length);
  console.log('=== HAS .topbar ===', html.includes('topbar'));
  console.log('=== HAS .navrail ===', html.includes('navrail'));
  console.log('=== HAS Loading ===', html.includes('Loading Blackbox BOM'));

  // App should load (API errors expected since no backend in tests)
  expect(html.includes('Loading Blackbox BOM')).toBe(false);
  expect(html.includes('topbar')).toBe(true);
  expect(html.length).toBeGreaterThan(10000);

  // Only hard JS errors (not API fetch errors) are failures
  const jsErrors = errors.filter(e => !e.includes('Failed to load resource') && !e.includes('Access to fetch'));
  expect(jsErrors.length).toBe(0);
});
