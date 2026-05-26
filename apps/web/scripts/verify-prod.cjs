const { chromium } = require('playwright-core');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../qa-screenshots');
const URL = process.env.PROD_URL || 'https://preferences-nail-division-needle.trycloudflare.com';
const fs = require('fs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✓ ${name}.png`);
}

async function testTheme(browser, theme, viewport, filename) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  
  // Set theme BEFORE navigating
  await page.addInitScript((t) => {
    localStorage.setItem('schoolhub_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  
  await page.goto(`${URL}/login`);
  await page.waitForTimeout(3000);
  
  // Verify theme applied
  const appliedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log(`  Theme applied: ${appliedTheme}`);
  
  await screenshot(page, filename);
  await context.close();
}

async function run() {
  const browser = await chromium.launch({ 
    executablePath: '/usr/bin/chromium', 
    args: ['--disable-web-security', '--force-dark-mode=false'] 
  });

  console.log(`Testing: ${URL}\n`);

  // Login - 5 themes (desktop)
  for (const theme of ['dark', 'light', 'midnight', 'ocean', 'warm']) {
    console.log(`Screenshot: login-${theme}`);
    await testTheme(browser, theme, { width: 1280, height: 800 }, `final-login-${theme}`);
  }

  // Login - dark (mobile)
  console.log(`Screenshot: login-mobile-dark`);
  await testTheme(browser, 'dark', { width: 390, height: 844 }, `final-login-mobile-dark`);

  await browser.close();
  console.log(`\n✅ All screenshots saved to ${OUT_DIR}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
