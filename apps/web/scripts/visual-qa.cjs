const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../qa-screenshots');
const fs = require('fs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function waitForServer(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Server did not start in time');
}

async function screenshot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✓ ${name}.png`);
}

const MOCK_USER = {
  id: 1,
  name: 'Ahmad Fauzi',
  role: 'GURU_MAPEL',
  email: 'ahmad@man1rokanhulu.sch.id'
};

async function run() {
  console.log('Starting dev server...');
  const server = spawn('npx', ['vite', '--port', '5173'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    env: { ...process.env, BROWSER: 'none' }
  });
  server.stdout.on('data', d => process.stdout.write(d));
  server.stderr.on('data', d => process.stderr.write(d));

  try {
    await waitForServer('http://localhost:5173');
    console.log('Server ready');

    const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'] });

    // ========== DESKTOP: DARK ==========
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.addInitScript((t) => {
        localStorage.setItem('schoolhub_theme', t);
        document.documentElement.setAttribute('data-theme', t);
      }, 'dark');

      // Login page
      await page.goto('http://localhost:5173/login');
      await page.waitForTimeout(1200);
      await screenshot(page, 'login-dark');

      // Inject mock user and go to dashboard
      await page.evaluate((u) => {
        localStorage.setItem('schoolhub_user', JSON.stringify(u));
        localStorage.setItem('schoolhub_token', 'mock-token');
      }, MOCK_USER);
      await page.goto('http://localhost:5173/');
      await page.waitForTimeout(1500);
      await screenshot(page, 'dashboard-dark');

      // Class attendance page (critical flow)
      await page.goto('http://localhost:5173/guru/absensi');
      await page.waitForTimeout(1500);
      await screenshot(page, 'guru-absensi-dark');

      await context.close();
    }

    // ========== DESKTOP: LIGHT ==========
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.addInitScript((t) => {
        localStorage.setItem('schoolhub_theme', t);
        document.documentElement.setAttribute('data-theme', t);
      }, 'light');

      await page.goto('http://localhost:5173/login');
      await page.waitForTimeout(1200);
      await screenshot(page, 'login-light');

      await page.evaluate((u) => {
        localStorage.setItem('schoolhub_user', JSON.stringify(u));
        localStorage.setItem('schoolhub_token', 'mock-token');
      }, MOCK_USER);
      await page.goto('http://localhost:5173/');
      await page.waitForTimeout(1500);
      await screenshot(page, 'dashboard-light');

      await page.goto('http://localhost:5173/guru/absensi');
      await page.waitForTimeout(1500);
      await screenshot(page, 'guru-absensi-light');

      await context.close();
    }

    // ========== MOBILE: DARK ==========
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' });
      const page = await context.newPage();
      await page.addInitScript((t) => {
        localStorage.setItem('schoolhub_theme', t);
        document.documentElement.setAttribute('data-theme', t);
      }, 'dark');

      await page.goto('http://localhost:5173/login');
      await page.waitForTimeout(1200);
      await screenshot(page, 'login-mobile-dark');

      await page.evaluate((u) => {
        localStorage.setItem('schoolhub_user', JSON.stringify(u));
        localStorage.setItem('schoolhub_token', 'mock-token');
      }, MOCK_USER);
      await page.goto('http://localhost:5173/');
      await page.waitForTimeout(1500);
      await screenshot(page, 'dashboard-mobile-dark');

      await page.goto('http://localhost:5173/guru/absensi');
      await page.waitForTimeout(1500);
      await screenshot(page, 'guru-absensi-mobile-dark');

      await context.close();
    }

    await browser.close();
    console.log(`\n✅ All screenshots saved to ${OUT_DIR}`);
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
