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
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { ...devices['iPad Pro 11'], browserName: 'chromium' } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } }
  ]
});
