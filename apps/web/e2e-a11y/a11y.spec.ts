import AxeBuilder from '@axe-core/playwright';
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
    if (url.includes('/reports/dashboard')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionsToday: 1, closedSessions: 0, openSessions: 1, attendanceCoveragePercent: 75, openFlags: 0, gateTapCount: 4 }) });
    if (url.includes('/reports/trend')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ label: 'Hari ini', coveragePercent: 75 }]) });
    if (url.includes('/reports/my-attendance')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    if (url.includes('/attendance/class-sessions')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
  });
}

async function seedUser(page: Page, user: { id: string; username: string; fullName: string; role: string }) {
  await page.addInitScript((args: { key: string; value: unknown }) => localStorage.setItem(args.key, JSON.stringify(args.value)), { key: USER_KEY, value: user });
}

async function assertNoSeriousA11y(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const violations = results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact || ''));
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test('login page has no critical/serious WCAG violations and supports keyboard focus', async ({ page }) => {
  await page.goto('/login');
  await assertNoSeriousA11y(page);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});

test('admin dashboard has skip link and no critical/serious WCAG violations', async ({ page }) => {
  await mockApi(page);
  await seedUser(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
  await page.goto('/admin/dashboard');
  const skipLink = page.getByText('Lompat ke konten');
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await assertNoSeriousA11y(page);
});

test('teacher dashboard has no critical/serious WCAG violations at 200 percent zoom equivalent', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 900 });
  await mockApi(page);
  await seedUser(page, { id: 'guru-1', username: 'guru.matematika', fullName: 'Guru Demo', role: 'GURU_MAPEL' });
  await page.goto('/guru/dashboard');
  await assertNoSeriousA11y(page);
});
