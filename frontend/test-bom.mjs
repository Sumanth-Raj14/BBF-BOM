import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'pageerror') errors.push(msg.text());
});

await page.goto('http://localhost:3003/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Login
const emailInput = await page.$('input[type="email"]');
if (emailInput) {
  await emailInput.fill('admin@blackbox-bom.io');
  const pwInput = await page.$('input[type="password"]');
  if (pwInput) await pwInput.fill('admin123');
  const signInBtn = await page.$('button:has-text("Sign in")');
  if (signInBtn) await signInBtn.click();
  await page.waitForTimeout(3000);
}
console.log('1. Signed in');

// Complete onboarding wizard (5 steps)
for (let step = 1; step <= 5; step++) {
  // Check if we see the onboarding
  const stepText = await page.evaluate(() => document.body.innerText);
  if (stepText.includes('Workspace') || stepText.includes('ROLE') || stepText.includes('TEAM') || stepText.includes('INTEGRATIONS') || stepText.includes('FIRST BOM')) {
    // Click continue or Finish
    const contBtn = await page.$('button:has-text("Continue")');
    if (contBtn) { await contBtn.click(); await page.waitForTimeout(1000); continue; }
    const finBtn = await page.$('button:has-text("Finish")');
    if (finBtn) { await finBtn.click(); await page.waitForTimeout(2000); break; }
    // Skip button
    const skipBtn = await page.$('button:has-text("Skip")');
    if (skipBtn) { await skipBtn.click(); await page.waitForTimeout(2000); break; }
  }
}
console.log('2. Onboarding done');

await page.waitForTimeout(2000);
let bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
console.log('3. After onboarding:', bodyText.replace(/\n/g, ' | '));

// Navigate to BOM via dashboard card
const atlasCard = await page.$('text=ATLAS');
if (atlasCard) {
  await atlasCard.click();
  await page.waitForTimeout(5000);
  console.log('4. Clicked ATLAS project card');
}

bodyText = await page.evaluate(() => document.body.innerText.substring(0, 800));
console.log('5. BOM screen text:', bodyText.replace(/\n/g, ' | '));

// Check for BOM-specific content
const hasBOMContent = bodyText.includes('Mainframe') || bodyText.includes('Parts') || bodyText.includes('hierarchy') || bodyText.includes('BOM');
console.log('6. BOM content visible:', hasBOMContent);

console.log('\n=== CONSOLE ERRORS ===');
errors.forEach(e => console.log(e));

await browser.close();
