import { defineConfig, devices } from '@playwright/test';

const useSystemChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } }
  : {};

const apiPort = Number(process.env.FULL_STACK_API_PORT ?? 3000);
const webPort = Number(process.env.FULL_STACK_WEB_PORT ?? 4174);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './e2e-full-stack',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-full-stack', open: 'never' }],
    ['junit', { outputFile: 'test-results/full-stack-junit.xml' }]
  ],
  use: {
    baseURL: webOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    timezoneId: 'Asia/Jakarta',
    locale: 'id-ID',
    ...useSystemChromium
  },
  webServer: [
    {
      command: `cd ../.. && npx prisma generate --schema prisma/schema.prisma && (cd apps/api && npx prisma generate --schema ../../prisma/schema.prisma) && ADMIN_PASSWORD=Admin#12345678 DEFAULT_USER_PASSWORD=User#12345678 DEVELOPER_PASSWORD=Dev#12345678 npm run prisma:migrate && ADMIN_PASSWORD=Admin#12345678 DEFAULT_USER_PASSWORD=User#12345678 DEVELOPER_PASSWORD=Dev#12345678 npm run prisma:seed && PORT=${apiPort} CORS_ORIGIN=${webOrigin} PUBLIC_APP_ORIGIN=${webOrigin} npm run start:dev --prefix apps/api`,
      url: `${apiOrigin}/health/live`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000
    },
    {
      command: `VITE_API_BASE_URL=${apiOrigin}/api/v1 npm run dev -- --host 127.0.0.1 --port ${webPort}`,
      url: webOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ],
  projects: [
    { name: 'chromium-full-stack', use: { ...devices['Desktop Chrome'] } }
  ]
});
