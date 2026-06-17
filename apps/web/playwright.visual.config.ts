import { defineConfig, devices } from '@playwright/test';

const useSystemChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
  : {};

export default defineConfig({
  testDir: './e2e-visual',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-visual', open: 'never' }],
    ['junit', { outputFile: 'test-results/visual-junit.xml' }]
  ],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4176',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Jakarta',
    locale: 'id-ID',
    ...useSystemChromium
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4176',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-1366', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'tablet-1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'mobile-390', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } }
  ]
});
