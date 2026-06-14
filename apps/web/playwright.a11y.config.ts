import { defineConfig, devices } from '@playwright/test';

const useSystemChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
  : {};

export default defineConfig({
  testDir: './e2e-a11y',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-a11y', open: 'never' }],
    ['junit', { outputFile: 'test-results/a11y-junit.xml' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Jakarta',
    locale: 'id-ID',
    ...useSystemChromium
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: 'desktop-a11y', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-a11y', use: { ...devices['Pixel 5'] } }
  ]
});
