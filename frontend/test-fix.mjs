import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'pageerror') errors.push(msg.text());
});

await page.goto('http://localhost:3003/', { waitUntil: 'networkidle', timeout: 30000 });
console.log('1. Page loaded, URL:', page.url());
await page.waitForTimeout(2000);

let bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
console.log('2. Body:', bodyText.replace(/\n/g, ' | '));

const emailInput = await page.$('input[type="email"], input[placeholder*="EMAIL"], input[name="email"]');
if (emailInput) {
  await emailInput.fill('admin@blackbox-bom.io');
  const pwInput = await page.$('input[type="password"], input[placeholder*="PASSWORD"], input[name="password"]');
  if (pwInput) await pwInput.fill('admin123');
  const signInBtn = await page.$('button:has-text("Sign in")');
  if (signInBtn) { await signInBtn.click(); await page.waitForTimeout(3000); }
  console.log('3. Signed in');
}

bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
console.log('4. After sign in:', bodyText.replace(/\n/g, ' | '));

const finishBtn = await page.$('button:has-text("Finish")');
if (finishBtn) { await finishBtn.click(); await page.waitForTimeout(2000); console.log('5. Completed onboarding'); }

bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
console.log('6. After onboarding:', bodyText.replace(/\n/g, ' | '));

const atlasCard = await page.$('text=ATLAS');
if (atlasCard) { await atlasCard.click(); await page.waitForTimeout(3000); console.log('7. Clicked ATLAS'); }

bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
console.log('8. After BOM click:', bodyText.replace(/\n/g, ' | '));

console.log('\n=== CONSOLE ERRORS ===');
errors.forEach(e => console.log(e));

await browser.close();
