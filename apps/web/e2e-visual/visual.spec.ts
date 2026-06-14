import { expect, test, type Page, type Route } from '@playwright/test';

const USER_KEY = 'schoolhub_user';

function paginated(items: unknown[]) {
  return { items, meta: { page: 1, limit: 100, total: items.length, totalPages: 1, hasNext: false, hasPrev: false } };
}

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: JSON.parse(await page.evaluate((key) => localStorage.getItem(key) || '{}', USER_KEY)) }) });
    if (url.includes('/health/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    if (url.includes('/tutorials/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shouldShow: false, version: 'test' }) });
    if (url.includes('/reports/dashboard')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionsToday: 2, closedSessions: 1, openSessions: 1, attendanceCoveragePercent: 82, openFlags: 0, gateTapCount: 12 }) });
    if (url.includes('/reports/trend')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ label: 'Hari ini', coveragePercent: 82 }]) });
    if (url.includes('/reports/my-attendance')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    if (url.includes('/attendance/class-sessions')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
  });
}

async function stabilizeBrowser(page: Page) {
  await page.addInitScript(() => {
    const fixed = new Date('2026-06-14T02:00:00.000Z').valueOf();
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(value?: string | number | Date) {
        super(value ?? fixed);
      }
      static now() { return fixed; }
    }
    window.Date = FixedDate as DateConstructor;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function seedUser(page: Page, user: { id: string; username: string; fullName: string; role: string }) {
  await page.addInitScript((args: { key: string; value: unknown }) => localStorage.setItem(args.key, JSON.stringify(args.value)), { key: USER_KEY, value: user });
}

async function expectStableScreenshot(page: Page, name: string) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.005,
    threshold: 0.2
  });
}

const cases = [
  [{ id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' }, '/admin/dashboard', 'admin-dashboard'],
  [{ id: 'guru-1', username: 'guru.matematika', fullName: 'Guru Demo', role: 'GURU_MAPEL' }, '/guru/dashboard', 'guru-dashboard'],
  [{ id: 'siswa-1', username: 'siswa.citra', fullName: 'Citra', role: 'SISWA' }, '/siswa/dashboard', 'siswa-dashboard']
] as const;

for (const [user, path, name] of cases) {
  test(`${name} matches committed visual baseline`, async ({ page }) => {
    await stabilizeBrowser(page);
    await mockApi(page);
    await seedUser(page, user);
    await page.goto(path);
    await expect(page.locator('#main-content')).toBeVisible();
    await expectStableScreenshot(page, name);
  });
}
