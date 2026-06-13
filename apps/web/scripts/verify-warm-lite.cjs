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
  await page.addInitScript((t) => {
    localStorage.setItem('schoolhub_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.goto(`${URL}/login`);
  await page.waitForTimeout(2500);
  const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log(`  Theme: ${theme} → ${applied}`);
  await screenshot(page, filename);
  await context.close();
}

async function run() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--disable-web-security'] });
  console.log(`Testing: ${URL}\n`);

  for (const theme of ['dark', 'light', 'warm']) {
    console.log(`Screenshot: login-${theme}`);
    await testTheme(browser, theme, { width: 1280, height: 800 }, `warm-lite-${theme}`);
  }

  console.log(`Screenshot: login-mobile-dark`);
  await testTheme(browser, 'dark', { width: 390, height: 844 }, `warm-lite-mobile-dark`);

  await browser.close();
  console.log(`\n✅ All screenshots saved to ${OUT_DIR}`);
}

run().catch(err => { console.error(err); process.exit(1); });
