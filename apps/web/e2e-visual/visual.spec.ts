import { expect, test, type Page, type Route } from '@playwright/test';

const USER_KEY = 'schoolhub_user';

function paginated(items: unknown[]) {
  return { items, meta: { page: 1, limit: 100, total: items.length, totalPages: 1, hasNext: false, hasPrev: false } };
}

const academicYear = { id: 'year-1', code: '2026/2027', name: 'Tahun Ajaran 2026/2027', active: true };
const schoolClass = { id: 'class-1', code: 'X-A', name: 'Kelas X A', yearLabel: '2026/2027' };
const semester = { id: 'semester-1', academicYearId: academicYear.id, academicYear, code: 'GANJIL', name: 'Semester Ganjil' };
const subject = { id: 'subject-1', code: 'MTK', name: 'Matematika' };
const room = { id: 'room-1', code: 'R-A1', name: 'Ruang A1', active: true };
const users = [
  { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU', cardStatus: 'ACTIVE', active: true },
  { id: 'guru-1', username: 'guru.matematika', fullName: 'Guru Matematika', role: 'GURU_MAPEL', cardStatus: 'ACTIVE', active: true },
  { id: 'siswa-1', username: 'siswa.aisyah', fullName: 'Aisyah Putri', role: 'SISWA', cardStatus: 'ACTIVE', active: true }
];

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: JSON.parse(await page.evaluate((key) => localStorage.getItem(key) || '{}', USER_KEY)) }) });
    if (url.includes('/health/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    if (url.includes('/tutorials/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shouldShow: false, version: 'test' }) });
    if (url.includes('/reports/dashboard')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionsToday: 2, closedSessions: 1, openSessions: 1, attendanceCoveragePercent: 82, openFlags: 0, gateTapCount: 12, studentCompleteness: { completeCount: 1, missingArrivalCount: 1, missingDepartureCount: 1, missingClassAttendanceCount: 1, missingPrayerCount: 1, needsVerificationCount: 0 } }) });
    if (url.includes('/reports/trend')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ label: 'Hari ini', coveragePercent: 82 }]) });
    if (url.includes('/reports/student-daily-completeness')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: { completeCount: 1, missingArrivalCount: 1, missingDepartureCount: 1, missingClassAttendanceCount: 1, missingPrayerCount: 1, needsVerificationCount: 0 }, items: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }) });
    if (url.includes('/reports/my-attendance')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    if (url.includes('/notifications')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...paginated([{ id: 'notif-1', title: 'Cek sesi', body: 'Sesi perlu perhatian.', readAt: null, createdAt: '2026-06-14T02:00:00.000Z' }]), unreadCount: url.includes('unreadOnly=true') ? 1 : 1 }) });
    if (url.includes('/identity/users')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated(users)) });
    if (url.includes('/academic/years')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([academicYear])) });
    if (url.includes('/academic/semesters')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([semester])) });
    if (url.includes('/academic/classes')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([schoolClass])) });
    if (url.includes('/academic/subjects')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([subject])) });
    if (url.includes('/academic/rooms')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([room])) });
    if (url.includes('/academic/students')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'student-1', fullName: 'Aisyah Putri', username: 'siswa.aisyah', classCode: 'X-A', cardStatus: 'ACTIVE' }])) });
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

const masterDataCases = [
  ['/admin/master-data?tab=users', 'master-data-users-one-user'],
  ['/admin/master-data?tab=classes', 'master-data-classes-populated'],
  ['/admin/master-data?tab=semesters', 'master-data-semesters-populated'],
  ['/admin/master-data?tab=student-import', 'master-data-import-siswa'],
  ['/admin/master-data?tab=students', 'master-data-daftar-siswa']
] as const;

for (const [path, name] of masterDataCases) {
  test(`${name} matches committed visual baseline`, async ({ page }) => {
    await stabilizeBrowser(page);
    await mockApi(page);
    await seedUser(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    await page.goto(path);
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.locator('.notif-badge')).toHaveText('1');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await expectStableScreenshot(page, name);
  });
}

test('master-data-classes-empty matches committed visual baseline', async ({ page }) => {
  await stabilizeBrowser(page);
  await mockApi(page);
  await page.route('**/api/v1/academic/classes**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) }));
  await seedUser(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
  await page.goto('/admin/master-data?tab=classes');
  await expect(page.getByText('Belum ada kelas.')).toBeVisible();
  await expectStableScreenshot(page, 'master-data-classes-empty');
});

test('master-data-semesters-empty matches committed visual baseline', async ({ page }) => {
  await stabilizeBrowser(page);
  await mockApi(page);
  await page.route('**/api/v1/academic/semesters**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) }));
  await seedUser(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
  await page.goto('/admin/master-data?tab=semesters');
  await expect(page.getByText('Belum ada semester untuk tahun ajaran yang dipilih.')).toBeVisible();
  await expectStableScreenshot(page, 'master-data-semesters-empty');
});

test('topbar-zero-notifications matches committed visual baseline', async ({ page }) => {
  await stabilizeBrowser(page);
  await mockApi(page);
  await page.route('**/api/v1/notifications**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...paginated([]), unreadCount: 0 }) }));
  await seedUser(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
  await page.goto('/admin/master-data?tab=users');
  await expect(page.locator('.notif-badge')).toHaveCount(0);
  await expect(page.locator('.notif-dot')).toHaveCount(0);
  await expectStableScreenshot(page, 'topbar-zero-notifications');
});
