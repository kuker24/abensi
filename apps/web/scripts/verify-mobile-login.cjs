const { chromium } = require('playwright-core');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../qa-screenshots');
const URL = process.env.PROD_URL || 'https://preferences-nail-division-needle.trycloudflare.com';
const fs = require('fs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function screenshot(page, name, fullPage = false) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log(`✓ ${name}.png`);
}

async function run() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--disable-web-security'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  
  await page.addInitScript(() => {
    localStorage.setItem('schoolhub_theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  
  await page.goto(`${URL}/login`);
  await page.waitForTimeout(3000);
  
  // Screenshot full page untuk lihat form login juga
  await screenshot(page, 'mobile-login-full-dark', true);
  
  await browser.close();
  console.log(`\n✅ Mobile full page screenshot saved`);
}

run().catch(err => { console.error(err); process.exit(1); });
