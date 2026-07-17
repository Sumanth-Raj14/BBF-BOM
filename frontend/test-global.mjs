import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('http://localhost:3003/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// Check if Icon is globally available
const iconType = await page.evaluate(() => typeof Icon);
console.log('typeof Icon:', iconType);

// Check if window.Icon exists
const winIconType = await page.evaluate(() => typeof window.Icon);
console.log('typeof window.Icon:', winIconType);

// Check if Icon equals window.Icon
const iconEq = await page.evaluate(() => typeof Icon !== 'undefined' && Icon === window.Icon);
console.log('Icon === window.Icon:', iconEq);

// Check for Icon in different scopes
const topBarIcon = await page.evaluate(() => {
  // Try to find the TopBar module and check its Icon binding
  // We can't access module scope from here, but we can check if there's any script that makes Icon available
  const scripts = document.querySelectorAll('script[type="module"]');
  return scripts.length;
});
console.log('ES module scripts:', topBarIcon);

// Check if there's a specific error when using Icon from an eval
try {
  const evalTest = await page.evaluate(() => {
    try {
      // This would fail if Icon is not defined in this scope
      return Icon === undefined ? 'undefined' : 'defined';
    } catch(e) {
      return 'error: ' + e.message;
    }
  });
  console.log('Icon in eval scope:', evalTest);
} catch(e) {
  console.log('Icon eval error:', e.message);
}

await browser.close();
