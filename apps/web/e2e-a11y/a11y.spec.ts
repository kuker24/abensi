import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const USER_KEY = 'schoolhub_user';

function paginated(items: unknown[]) {
  return { items, meta: { page: 1, limit: 100, total: items.length, totalPages: 1, hasNext: false, hasPrev: false } };
}

const demoUsers = [
  { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU', cardStatus: 'ACTIVE', active: true },
  { id: 'developer-1', username: 'developer', fullName: 'Developer', role: 'DEVELOPER', cardStatus: 'ACTIVE', active: true },
  { id: 'operator-1', username: 'operator.it', fullName: 'Operator IT', role: 'OPERATOR_IT', cardStatus: 'ACTIVE', active: true },
  { id: 'piket-1', username: 'guru.piket', fullName: 'Guru Piket', role: 'GURU_PIKET', cardStatus: 'ACTIVE', active: true },
  { id: 'guru-1', username: 'guru.matematika', fullName: 'Guru Demo', role: 'GURU_MAPEL', cardStatus: 'ACTIVE', active: true },
  { id: 'siswa-1', username: 'siswa.citra', fullName: 'Citra', role: 'SISWA', cardStatus: 'ACTIVE', active: true }
];
const demoClass = { id: 'class-1', code: 'X-A', name: 'Kelas X A' };
const demoSubject = { id: 'subject-1', name: 'Matematika' };
const demoSession = {
  id: 'session-1',
  startsAt: '2026-06-14T00:00:00.000Z',
  endsAt: '2026-06-14T01:30:00.000Z',
  status: 'OPEN',
  schoolClass: demoClass,
  subject: demoSubject,
  teacher: demoUsers[4],
  teacherPresence: { status: 'HADIR_MENGAJAR', checkInAt: '2026-06-14T00:01:00.000Z' }
};

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/auth/login')) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Kredensial tidak valid.' }) });
    if (url.includes('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: JSON.parse(await page.evaluate((key) => localStorage.getItem(key) || '{}', USER_KEY)) }) });
    if (url.includes('/health/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    if (url.includes('/tutorials/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shouldShow: false, version: 'test' }) });
    if (url.includes('/reports/dashboard')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionsToday: 1, closedSessions: 0, openSessions: 1, attendanceCoveragePercent: 75, openFlags: 1, gateTapCount: 4 }) });
    if (url.includes('/reports/trend')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ label: 'Hari ini', coveragePercent: 75 }]) });
    if (url.includes('/reports/live-monitor')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'event-1', type: 'GATE_IN', title: 'Scan masuk', timestamp: '2026-06-14T00:00:00.000Z' }])) });
    if (url.includes('/reports/my-attendance')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    if (url.includes('/attendance/class-sessions/session-1/roster')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ studentId: 'siswa-1', fullName: 'Citra', username: 'siswa.citra', cardStatus: 'ACTIVE', status: 'HADIR', eligibility: { locked: false, reasons: [] } }]) });
    if (url.includes('/attendance/class-sessions/session-1')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demoSession) });
    if (url.includes('/attendance/class-sessions')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([demoSession])) });
    if (url.includes('/academic/classes')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([demoClass])) });
    if (url.includes('/academic/subjects')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([demoSubject])) });
    if (url.includes('/identity/users')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated(demoUsers)) });
    if (url.includes('/reconciliation/flags')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'flag-1', type: 'BOLOS_KELAS', status: 'OPEN', priority: 'NORMAL', user: demoUsers[5] }])) });
    if (url.includes('/notifications')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'notif-1', title: 'Cek sesi', body: 'Sesi perlu perhatian.', readAt: null }])) });
    if (url.includes('/audit')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'audit-1', createdAt: '2026-06-14T00:00:00.000Z', action: 'auth.login.success', module: 'auth' }])) });
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
  await mockApi(page);
  await page.goto('/login');
  await assertNoSeriousA11y(page);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});

test('login error state is announced accessibly', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await page.getByPlaceholder('Masukkan nama akun').fill('admin.tu');
  await page.getByPlaceholder('Masukkan kata sandi').fill('wrong-password');
  await page.getByRole('button', { name: /Masuk/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await assertNoSeriousA11y(page);
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

const routeMatrix = [
  { path: '/admin/dashboard', user: demoUsers[0], label: 'admin-dashboard' },
  { path: '/admin/sessions', user: demoUsers[0], label: 'admin-sessions' },
  { path: '/admin/master-data', user: demoUsers[0], label: 'admin-master-data' },
  { path: '/admin/devices', user: demoUsers[0], label: 'admin-devices' },
  { path: '/admin/reports', user: demoUsers[0], label: 'admin-reports' },
  { path: '/admin/settings', user: demoUsers[0], label: 'admin-settings' },
  { path: '/admin/live-monitor', user: demoUsers[0], label: 'admin-live-monitor' },
  { path: '/admin/notifications', user: demoUsers[0], label: 'admin-notifications' },
  { path: '/admin/help', user: demoUsers[0], label: 'admin-help' },
  { path: '/admin/it-dashboard', user: demoUsers[2], label: 'operator-dashboard' },
  { path: '/admin/picket-dashboard', user: demoUsers[3], label: 'picket-dashboard' },
  { path: '/admin/developer-control', user: demoUsers[1], label: 'developer-control' },
  { path: '/guru/dashboard', user: demoUsers[4], label: 'teacher-dashboard' },
  { path: '/guru/presensi', user: demoUsers[4], label: 'teacher-class-input' },
  { path: '/guru/koreksi', user: demoUsers[4], label: 'teacher-corrections' },
  { path: '/guru/rekap', user: demoUsers[4], label: 'teacher-recap' },
  { path: '/guru/izin', user: demoUsers[4], label: 'teacher-leave' },
  { path: '/guru/panduan', user: demoUsers[4], label: 'teacher-help' },
  { path: '/siswa/dashboard', user: demoUsers[5], label: 'student-attendance' },
  { path: '/siswa/panduan', user: demoUsers[5], label: 'student-help' }
] as const;

test.describe('major authenticated routes meet WCAG critical/serious zero gate', () => {
  for (const item of routeMatrix) {
    test(`${item.label}`, async ({ page }) => {
      await mockApi(page);
      await seedUser(page, item.user);
      await page.goto(item.path);
      await expect(page.locator('#main-content')).toBeVisible();
      await assertNoSeriousA11y(page);
    });
  }
});

test('authenticated keyboard flow reaches navigation and primary content', async ({ page }) => {
  await mockApi(page);
  await seedUser(page, demoUsers[0]);
  await page.goto('/admin/dashboard');
  const skipLink = page.getByText('Lompat ke konten');
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});
