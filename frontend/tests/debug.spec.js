import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from "../e2e/storage-state.js";

// Runs as a really-logged-in user. This spec used to fake that by writing
// localStorage.__bbox_auth, which only worked because the app trusted that
// blob -- the offline-login auth bypass. With that hole closed, the fake is
// just a logged-out browser; the real session comes from auth.setup.js.
test.use({ storageState: STORAGE_STATE });

test('debug: capture errors and page state', async ({ page }) => {
  const errors = [];
  const consoleLogs = [];

  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));


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
