const { chromium } = require('playwright-core');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../qa-screenshots');
const fs = require('fs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✓ ${name}.png`);
}

async function run() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--disable-web-security'] });

  // Desktop Dark
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto('https://preferences-nail-division-needle.trycloudflare.com/login');
    await page.waitForTimeout(2500);
    await screenshot(page, 'prod-login-dark');
    await context.close();
  }

  // Desktop Light
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('schoolhub_theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await page.goto('https://preferences-nail-division-needle.trycloudflare.com/login');
    await page.waitForTimeout(2500);
    await screenshot(page, 'prod-login-light');
    await context.close();
  }

  // Mobile Dark
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('https://preferences-nail-division-needle.trycloudflare.com/login');
    await page.waitForTimeout(2500);
    await screenshot(page, 'prod-login-mobile-dark');
    await context.close();
  }

  await browser.close();
  console.log(`\n✅ Screenshots saved to ${OUT_DIR}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
