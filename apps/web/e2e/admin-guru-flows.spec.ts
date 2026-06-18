import { expect, test, type Page, type Route } from '@playwright/test';

const USER_KEY = 'schoolhub_user';

async function seedAuth(page: Page, user: { id: string; username: string; fullName: string; role: string }) {
  await page.route('**/api/v1/auth/me', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) }));
  await page.addInitScript(
    ([storedUser, userKey]) => {
      window.localStorage.setItem(userKey, JSON.stringify(storedUser));
    },
    [user, USER_KEY]
  );
}

async function setStoredAuth(page: Page, user: { id: string; username: string; fullName: string; role: string }) {
  await page.unroute('**/api/v1/auth/me').catch(() => undefined);
  await page.route('**/api/v1/auth/me', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) }));
  await page.goto('/login');
  await page.evaluate(
    ([storedUser, userKey]) => {
      window.localStorage.setItem(userKey, JSON.stringify(storedUser));
    },
    [user, USER_KEY]
  );
  await expect.poll(async () => page.evaluate((userKey) => window.localStorage.getItem(userKey), USER_KEY)).not.toBeNull();
}

function paginated(items: unknown[]) {
  return { items, meta: { page: 1, limit: 100, total: items.length, totalPages: 1, hasNext: false, hasPrev: false } };
}

async function routeCommonApi(page: Page) {
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/auth/')) return route.fallback();
    const method = route.request().method();
    if (url.includes('/health/live')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    if (url.includes('/health/detail') || url.includes('/health/ready')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ready', api: 'ok', database: 'ok' }) });
    if (url.includes('/tutorials/me') && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '2026.04.26', shouldShow: false }) });
    if (url.includes('/tutorials/users')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'guru-1', username: 'guru.demo', fullName: 'Guru Demo', role: 'GURU_MAPEL', active: true, tutorial: { shouldShow: false, completedAt: new Date().toISOString() } }])) });
    if (url.includes('/reports/dashboard')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionsToday: 2, closedSessions: 1, openSessions: 1, attendanceCoveragePercent: 80, openFlags: 0, gateTapCount: 12 }) });
    if (url.includes('/reports/trend')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ label: 'Hari ini', coveragePercent: 80 }]) });
    if (url.includes('/access/geofence')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, centerLat: 0, centerLng: 0, radiusMeter: 300, enforceSessionOpen: true, arrivalGraceMinutes: 15, autoMissedGraceMinutes: 15, requireGateTapForOpen: false, allowPicketOverride: true }) });
    if (url.includes('/attendance/policy')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, requireStudentGateInBeforeClass: true, requireStudentDhuha: true, requireStudentDzuhur: true, requireStudentAsharForAfternoon: true, requireStudentClassEligibility: true, requireTeacherGateIn: true, requireTeacherGateOut: true, requireStaffGateIn: true, requireStaffGateOut: true, allowManualOverride: true, allowStudentAsharCheckoutOverride: true, dhuhaStartTime: '07:00', dhuhaEndTime: '10:30', dzuhurStartTime: '11:45', dzuhurEndTime: '13:30', asharStartTime: '15:00', asharEndTime: '16:30', asharRequiredClassEndTime: '15:00', duplicateScanWindowMinutes: 5 }) });
    if (url.includes('/identity/users')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU', active: true, cardStatus: 'ACTIVE' }, { id: 'guru-1', username: 'guru.demo', fullName: 'Guru Demo', role: 'GURU_MAPEL', active: true, cardStatus: 'ACTIVE' }, { id: 'siswa-1', username: 'siswa.demo', fullName: 'Siswa Demo', role: 'SISWA', active: true, cardStatus: 'ACTIVE' }])) });
    if (url.includes('/notifications')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...paginated([]), unreadCount: 0 }) });
    if (url.includes('/attendance/class-sessions')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    if (url.includes('/teacher-leaves') || url.includes('/audit') || url.includes('/devices') || url.includes('/academic') || url.includes('/schedules') || url.includes('/reconciliation') || url.includes('/reports') || url.includes('/attendance')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
  });
}

test.describe('SIAB2 PRD v2.2 flows', () => {
  test('form login memberi jarak lega antara kata sandi dan tombol masuk', async ({ page }) => {
    await page.setViewportSize({ width: 377, height: 457 });
    await page.goto('/login');
    const passwordBox = await page.getByPlaceholder('Masukkan kata sandi').locator('xpath=ancestor::label[contains(@class,"input")]').boundingBox();
    const submitBox = await page.getByRole('button', { name: /^Masuk/ }).boundingBox();
    expect(passwordBox).not.toBeNull();
    expect(submitBox).not.toBeNull();
    const gap = (submitBox?.y || 0) - ((passwordBox?.y || 0) + (passwordBox?.height || 0));
    expect(gap).toBeGreaterThanOrEqual(16);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(377);
  });

  test('status koneksi tampil sederhana untuk Admin, Guru, dan Siswa', async ({ page }) => {
    await page.route('**/api/v1/**', async (route: Route) => {
      const url = route.request().url();
      if (url.includes('/api/v1/auth/')) return route.fallback();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', ...paginated([]) }) });
    });

    const cases = [
      [{ id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' }, '/admin/dashboard', /Admin\/TU Sedang Aktif/],
      [{ id: 'guru-1', username: 'guru.matematika', fullName: 'Guru E2E', role: 'GURU_MAPEL' }, '/guru/dashboard', /Guru Mapel Sedang Aktif/],
      [{ id: 'siswa-1', username: 'siswa.citra', fullName: 'Citra', role: 'SISWA' }, '/siswa/dashboard', /Siswa Sedang Aktif/]
    ] as const;

    for (const [user, url, label] of cases) {
      await setStoredAuth(page, user);
      await page.goto(url);
      await expect(page.locator('.system-ribbon')).toContainText(label);
      await expect(page.locator('.system-ribbon .connection-lamp')).toBeVisible();
      await expect(page.locator('.system-ribbon')).not.toContainText('server /api/v1');
    }
  });

  test('topbar search opens menu without shortcut badge', async ({ page }) => {
    await seedAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    await page.route('**/api/v1/**', async (route: Route) => {
      const url = route.request().url();
      if (url.includes('/api/v1/auth/')) return route.fallback();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    });

    await page.goto('/admin/dashboard');
    await expect(page.getByText('⌘K')).toHaveCount(0);
    await page.getByLabel('Cari menu').fill('piket');
    await page.locator('.search-results').getByRole('button', { name: /Catatan Piket/ }).click();
    await expect(page).toHaveURL(/\/admin\/picket$/);
  });

  test('notification bell only shows a real unread badge and updates after read', async ({ page }) => {
    await seedAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    let unreadCount = 0;
    let failNotifications = false;
    let notificationItems: any[] = [];
    await page.route('**/api/v1/**', async (route: Route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes('/api/v1/auth/')) return route.fallback();
      if (url.includes('/health/live')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      if (url.includes('/tutorials/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 'test', shouldShow: false }) });
      if (url.includes('/notifications') && method === 'GET') {
        if (failNotifications) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'notification service unavailable' }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...paginated(notificationItems), unreadCount }) });
      }
      if (url.includes('/notifications/notif-1/read') && method === 'PATCH') {
        unreadCount = 0;
        notificationItems = notificationItems.map((item) => ({ ...item, readAt: new Date().toISOString() }));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notificationItems[0]) });
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    });

    await page.goto('/admin/dashboard');
    await expect(page.locator('.notif-dot')).toHaveCount(0);
    await expect(page.locator('.notif-badge')).toHaveCount(0);
    await expect(page.getByLabel('Notifikasi', { exact: true })).toBeVisible();

    unreadCount = 1;
    notificationItems = [{ id: 'notif-1', title: 'Cek sesi', body: 'Sesi perlu perhatian.', readAt: null, createdAt: new Date().toISOString() }];
    await page.reload();
    await expect(page.locator('.notif-badge')).toHaveText('1');
    await expect(page.getByLabel('Notifikasi, 1 belum dibaca')).toBeVisible();

    unreadCount = 7;
    await page.reload();
    await expect(page.locator('.notif-badge')).toHaveText('7');
    await expect(page.getByLabel('Notifikasi, 7 belum dibaca')).toBeVisible();

    unreadCount = 150;
    await page.reload();
    await expect(page.locator('.notif-badge')).toHaveText('99+');
    await expect(page.getByLabel('Notifikasi, 150 belum dibaca')).toBeVisible();

    failNotifications = true;
    await page.reload();
    await expect(page.locator('.notif-badge')).toHaveCount(0);
    await expect(page.getByLabel('Notifikasi', { exact: true })).toBeVisible();

    failNotifications = false;
    unreadCount = 1;
    notificationItems = [{ id: 'notif-1', title: 'Cek sesi', body: 'Sesi perlu perhatian.', readAt: null, createdAt: new Date().toISOString() }];
    await page.goto('/admin/notifications');
    await expect(page.locator('.notif-badge')).toHaveText('1');
    await page.getByRole('button', { name: 'Tandai dibaca' }).click();
    await expect(page.locator('.notif-badge')).toHaveCount(0);
    await expect(page.locator('.notif-dot')).toHaveCount(0);
  });

  test('master data tabs use URL state, keyboard navigation, contextual help, and wide layouts', async ({ page }) => {
    await seedAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    const years = [{ id: 'year-1', code: '2026/2027', name: 'Tahun Ajaran 2026/2027', active: true }];
    const classes = [{ id: 'class-1', code: 'X-A', name: 'Kelas X A', yearLabel: '2026/2027' }];
    const users = [{ id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU', active: true, cardStatus: 'ACTIVE' }];
    await page.route('**/api/v1/**', async (route: Route) => {
      const url = route.request().url();
      if (url.includes('/api/v1/auth/')) return route.fallback();
      if (url.includes('/health/live')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      if (url.includes('/tutorials/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 'test', shouldShow: false }) });
      if (url.includes('/notifications')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...paginated([]), unreadCount: 0 }) });
      if (url.includes('/identity/users')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated(users)) });
      if (url.includes('/academic/years')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated(years)) });
      if (url.includes('/academic/semesters')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'sem-1', academicYearId: 'year-1', academicYear: years[0], code: 'GANJIL', name: 'Semester Ganjil' }])) });
      if (url.includes('/academic/classes')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated(classes)) });
      if (url.includes('/academic/students')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/admin/master-data?tab=users');
    await expect(page.getByRole('tab', { name: 'Buat/Edit Akun' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Kelola akun aman')).toBeVisible();
    await expect(page.getByText('Upload CSV siswa di tab Import Siswa.')).toHaveCount(0);
    const userLayout = await page.locator('.master-data-user-layout').evaluate((node) => {
      const form = node.querySelector('.master-data-form-panel')?.getBoundingClientRect();
      const list = node.querySelector('.master-data-list-panel')?.getBoundingClientRect();
      return { formWidth: Math.round(form?.width || 0), listWidth: Math.round(list?.width || 0), overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(userLayout.overflow).toBe(false);
    expect(userLayout.formWidth).toBeGreaterThanOrEqual(360);
    expect(userLayout.listWidth).toBeGreaterThan(540);
    await expect(page.getByLabel('Status akun')).toBeVisible();
    await expect(page.getByRole('search', { name: 'Filter daftar pengguna' }).getByLabel('Peran')).toBeVisible();

    await page.getByRole('tab', { name: 'Kelas' }).click();
    await expect(page).toHaveURL(/tab=classes/);
    await expect(page.getByText('Data kelas')).toBeVisible();
    await expect(page.getByLabel('Label Tahun Ajaran')).toBeVisible();
    const classLayout = await page.locator('.master-data-layout').evaluate((node) => {
      const form = node.querySelector('.master-data-form-panel')?.getBoundingClientRect();
      const list = node.querySelector('.master-data-list-panel')?.getBoundingClientRect();
      return { formWidth: Math.round(form?.width || 0), listWidth: Math.round(list?.width || 0), overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(classLayout.overflow).toBe(false);
    expect(classLayout.formWidth).toBeGreaterThanOrEqual(300);
    expect(classLayout.listWidth).toBeGreaterThan(540);

    await page.getByRole('tab', { name: 'Mapel' }).click();
    await expect(page).toHaveURL(/tab=subjects/);
    await page.goBack();
    await expect(page.getByRole('tab', { name: 'Kelas' })).toHaveAttribute('aria-selected', 'true');
    await page.goForward();
    await expect(page.getByRole('tab', { name: 'Mapel' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: 'Semester' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Ruang' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'Import Siswa' })).toHaveAttribute('aria-selected', 'true');

    await page.goto('/admin/master-data?tab=semesters');
    await expect(page.getByRole('tab', { name: 'Semester' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Tahun Ajaran')).toBeVisible();
    await expect(page.getByText('ID Tahun Ajaran')).toHaveCount(0);
    await expect(page.locator('select[aria-label="Tahun Ajaran"] option')).toContainText(['Pilih tahun ajaran', /Tahun Ajaran 2026\/2027/]);

    await page.goto('/admin/master-data?tab=unknown-tab');
    await expect(page.getByRole('tab', { name: 'Import Siswa' })).toHaveAttribute('aria-selected', 'true');
  });

  test('master data stacks responsively without page overflow on mobile', async ({ page }) => {
    await routeCommonApi(page);
    await seedAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/master-data?tab=users');
    const layout = await page.locator('.master-data-user-layout').evaluate((node) => {
      const form = node.querySelector('.master-data-form-panel')?.getBoundingClientRect();
      const list = node.querySelector('.master-data-list-panel')?.getBoundingClientRect();
      return { formTop: Math.round(form?.top || 0), listTop: Math.round(list?.top || 0), overflow: document.documentElement.scrollWidth > window.innerWidth };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.listTop).toBeGreaterThan(layout.formTop);
    await expect(page.getByRole('tab', { name: 'Buat/Edit Akun' })).toBeVisible();
    await expect(page.locator('.notif-dot')).toHaveCount(0);
  });

  test('semua role melihat menu sesuai tugas dan setiap menu utama bisa dibuka tanpa error tampilan', async ({ page }) => {
    await routeCommonApi(page);
    const uiErrors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') uiErrors.push(msg.text()); });
    page.on('pageerror', (error) => uiErrors.push(error.message));
    const cases = [
      { user: { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' }, start: '/admin/dashboard', menus: ['Ringkasan Hari Ini', 'Cek Sesi Kelas', 'Cek Masalah', 'Riwayat Scan', 'Akun & Data Sekolah', 'Panduan'] },
      { user: { id: 'op-1', username: 'operator.it', fullName: 'Operator IT', role: 'OPERATOR_IT' }, start: '/admin/it-dashboard', menus: ['Cek Sistem', 'HP Scanner & Kartu', 'Aktivitas Sekarang', 'Riwayat Perubahan', 'Panduan Operator'] },
      { user: { id: 'picket-1', username: 'guru.piket', fullName: 'Guru Piket', role: 'GURU_PIKET' }, start: '/admin/picket-dashboard', menus: ['Tugas Piket Hari Ini', 'Catatan Piket', 'Cek Sesi Kelas', 'Cek Masalah', 'Panduan Piket'] },
      { user: { id: 'guru-1', username: 'guru.matematika', fullName: 'Guru Mapel', role: 'GURU_MAPEL' }, start: '/guru/dashboard', menus: ['Ringkasan Mengajar', 'Isi Presensi Kelas', 'Perbaiki Presensi', 'Laporan Kelas Saya', 'Panduan'] },
      { user: { id: 'siswa-1', username: 'siswa.citra', fullName: 'Siswa Citra', role: 'SISWA' }, start: '/siswa/dashboard', menus: ['Kehadiran Saya', 'Tugas / Notifikasi', 'Panduan'] },
      { user: { id: 'dev-1', username: 'developer', fullName: 'Developer Sistem', role: 'DEVELOPER' }, start: '/admin/developer-control', menus: ['Pusat Kontrol', 'Ringkasan Admin', 'Cek Sistem', 'Akun & Data Sekolah', 'Panduan Developer'] }
    ];

    for (const item of cases) {
      await setStoredAuth(page, item.user);
      await page.goto(item.start);
      await expect(page.locator('.system-ribbon')).toContainText(/Sedang Aktif|Memeriksa Koneksi/);
      for (const label of item.menus) {
        await expect(page.locator('.side').getByText(label, { exact: true })).toBeVisible();
      }
      const navCount = await page.locator('.nav-item').count();
      for (let index = 0; index < navCount; index += 1) {
        await page.locator('.nav-item').nth(index).click();
        await expect(page.getByRole('heading', { name: 'Menu ini bukan untuk peran Anda' })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Menu ini belum tersedia' })).toHaveCount(0);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
    }
    expect(uiErrors).toEqual([]);
  });

  test('tutorial awal muncul sekali, bisa diselesaikan, dan bisa dibuka ulang manual', async ({ page }) => {
    await seedAuth(page, { id: 'guru-1', username: 'guru.matematika', fullName: 'Guru E2E', role: 'GURU_MAPEL' });
    let completed = false;
    await page.route('**/api/v1/**', async (route: Route) => {
      const url = route.request().url();
      if (url.includes('/api/v1/auth/')) return route.fallback();
      const method = route.request().method();
      if (url.includes('/health/live')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      if (url.includes('/tutorials/me') && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '2026.04.26', shouldShow: !completed }) });
      if (url.includes('/tutorials/me/complete')) { completed = true; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, shouldShow: false }) }); }
      if (url.includes('/tutorials/me/dismiss')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, shouldShow: false }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    });

    await page.goto('/guru/dashboard');
    await expect(page.getByRole('dialog', { name: 'Tutorial awal' })).toBeVisible();
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await page.getByRole('button', { name: /Lanjut/ }).click();
    await page.getByRole('button', { name: /Selesai/ }).click();
    await expect(page.getByRole('dialog', { name: 'Tutorial awal' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Tutorial awal' })).toHaveCount(0);
    await page.getByLabel('Lihat tutorial').click();
    await expect(page.getByRole('dialog', { name: 'Tutorial awal' })).toBeVisible();
  });

  test('admin dan developer melihat kontrol akun sesuai hak akses, serta developer bisa clean data', async ({ page }) => {
    const users = [
      { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU', active: true, cardStatus: 'ACTIVE' },
      { id: 'siswa-history', username: 'siswa.histori', fullName: 'Siswa Histori', role: 'SISWA', active: false, cardStatus: 'INACTIVE' }
    ];
    let cleanupRan = false;
    await page.route('**/api/v1/**', async (route: Route) => {
      const url = route.request().url();
      if (url.includes('/api/v1/auth/')) return route.fallback();
      const method = route.request().method();
      if (url.includes('/health/live')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      if (url.includes('/tutorials/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '2026.04.26', shouldShow: false }) });
      if (url.includes('/identity/users/siswa-history/permanent')) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Akun ini punya riwayat penting. Nonaktifkan saja agar data tetap aman.' }) });
      if (url.includes('/identity/users')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated(users)) });
      if (url.includes('/system-cleanup/preview')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ olderThanDays: 30, categories: { inactiveTestUsers: { count: 1, sample: [{ username: 'contract.user.create.1' }], skipped: [], reason: 'Akun test aman.' }, inactiveUserCards: { count: 1, sample: [{ uid: 'UID-OLD' }], reason: 'Kartu akun nonaktif.' }, readNotifications: { count: 0, sample: [], reason: 'Notifikasi lama.' }, staleTutorialStates: { count: 0, sample: [], reason: 'Tutorial lama.' } }, protectedData: ['Riwayat perubahan resmi', 'Presensi siswa'] }) });
      if (url.includes('/system-cleanup/run')) { cleanupRan = true; return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, executed: { inactiveTestUsers: 1, inactiveUserCards: 1 }, protectedData: ['Riwayat perubahan resmi'] }) }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    });

    await setStoredAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    await page.goto('/admin/master-data');
    await expect(page.getByRole('heading', { name: 'Akun & Data Sekolah' })).toBeVisible();
    await page.getByRole('tab', { name: 'Buat/Edit Akun' }).click();
    await expect(page.getByRole('button', { name: 'Hapus Permanen' })).toHaveCount(0);
    await expect(page.getByText('Bersihkan Data')).toHaveCount(0);

    await setStoredAuth(page, { id: 'dev-1', username: 'developer', fullName: 'Developer Sistem', role: 'DEVELOPER' });
    await page.goto('/admin/master-data');
    await page.getByRole('tab', { name: 'Buat/Edit Akun' }).click();
    await expect(page.getByRole('button', { name: 'Hapus Permanen' }).first()).toBeVisible();
    const dialogAnswers = ['siswa.histori', 'Uji hapus permanen akun berhistori.'];
    page.on('dialog', async (dialog) => { await dialog.accept(dialogAnswers.shift() || 'siswa.histori'); });
    await page.getByRole('button', { name: 'Hapus Permanen' }).last().click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByText(/Nonaktifkan saja agar data tetap aman/)).toBeVisible();

    await page.goto('/admin/developer-control');
    await page.locator('.tabs').getByRole('button', { name: 'Bersihkan Data' }).click();
    await page.getByRole('button', { name: /Lihat Pratinjau/ }).click();
    await expect(page.getByText('Riwayat perubahan resmi')).toBeVisible();
    await page.getByRole('button', { name: 'Bersihkan Data' }).last().click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByText('Data aman selesai dibersihkan.')).toBeVisible();
    expect(cleanupRan).toBe(true);
  });

  test('developer bisa mengaktifkan tutorial ulang untuk akun target', async ({ page }) => {
    await seedAuth(page, { id: 'dev-1', username: 'developer', fullName: 'Developer Sistem', role: 'DEVELOPER' });
    let activated = false;
    await page.route('**/api/v1/**', async (route: Route) => {
      const url = route.request().url();
      if (url.includes('/api/v1/auth/')) return route.fallback();
      const method = route.request().method();
      if (url.includes('/health/live')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      if (url.includes('/health/detail')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ready', database: 'ok' }) });
      if (url.includes('/tutorials/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '2026.04.26', shouldShow: false }) });
      if (url.includes('/tutorials/users/guru-1/activate') && method === 'POST') { activated = true; return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); }
      if (url.includes('/tutorials/users')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'guru-1', username: 'guru.demo', fullName: 'Guru Demo', role: 'GURU_MAPEL', active: true, tutorial: { shouldShow: activated, completedAt: activated ? null : new Date().toISOString(), lastSeenAt: new Date().toISOString() } }])) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([])) });
    });

    await page.goto('/admin/developer-control');
    await expect(page.getByRole('heading', { name: 'Pusat Kontrol Developer' })).toBeVisible();
    await page.getByRole('button', { name: /Aktifkan Tutorial Lagi/ }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByText('Tutorial akan tampil lagi untuk Guru Demo.')).toBeVisible();
    expect(activated).toBe(true);
  });

  test('admin dashboard shows latest anomaly and activity cards without horizontal overflow', async ({ page }) => {
    await seedAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    await page.route('**/api/v1/health/live', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });
    await page.route('**/api/v1/reports/dashboard', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionsToday: 8, closedSessions: 3, openSessions: 2, attendanceCoveragePercent: 82, openFlags: 4, gateTapCount: 120 }) });
    });
    await page.route('**/api/v1/reports/trend**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ label: 'Hari ini', coveragePercent: 82 }]) });
    });
    await page.route('**/api/v1/reconciliation/flags**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([
        { id: 'f1', type: 'BELUM_SCAN_DZUHUR', status: 'OPEN', user: { fullName: 'Bunga Lestari' }, createdAt: new Date().toISOString() },
        { id: 'f2', type: 'BELUM_SCAN_DHUHA', status: 'OPEN', user: { fullName: 'Andi Pratama' }, createdAt: new Date().toISOString() }
      ])) });
    });
    await page.route('**/api/v1/reports/live-monitor**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([
        { id: 'l1', type: 'GATE_TAP', fullName: 'Bunga Lestari', at: new Date().toISOString(), location: 'Gerbang utama' },
        { id: 'l2', type: 'SESSION_CLOSED', who: 'Ibu Siti Rahma', at: new Date().toISOString(), context: 'Matematika X-MIA-1' }
      ])) });
    });

    await page.goto('/admin/dashboard');
    await expect(page.getByText('Masalah terbaru')).toBeVisible();
    await expect(page.getByText('Aktivitas terbaru')).toBeVisible();
    await expect(page.locator('.dashboard-mini-list').first()).toContainText('Bunga Lestari');
    await expect(page.locator('.dashboard-mini-list').nth(1)).toContainText('Scan Gerbang');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    const nestedOverflow = await page.locator('.dashboard-mini-list').first().evaluate((node) => node.scrollWidth > node.clientWidth);
    expect(nestedOverflow).toBe(false);
    const dotAlignment = await page.locator('.dashboard-mini-main .pill').first().evaluate((pill) => {
      const dot = pill.querySelector('.d');
      if (!dot) return 99;
      const pillRect = pill.getBoundingClientRect();
      const dotRect = dot.getBoundingClientRect();
      return Math.abs((pillRect.top + pillRect.height / 2) - (dotRect.top + dotRect.height / 2));
    });
    expect(dotAlignment).toBeLessThanOrEqual(2);
  });

  test('admin can configure adaptive attendance and use manual scan panel', async ({ page }) => {
    await seedAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    await page.route('**/api/v1/access/geofence', async (route: Route) => {
      const body = { id: 1, centerLat: 0, centerLng: 0, radiusMeter: 300, enforceSessionOpen: true, arrivalGraceMinutes: 15, autoMissedGraceMinutes: 15, requireGateTapForOpen: false, allowPicketOverride: true };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/api/v1/attendance/policy', async (route: Route) => {
      const body = { id: 1, requireStudentGateInBeforeClass: true, requireStudentDhuha: true, requireStudentDzuhur: true, requireStudentAsharForAfternoon: true, requireStudentClassEligibility: true, requireTeacherGateIn: true, requireTeacherGateOut: true, requireStaffGateIn: true, requireStaffGateOut: true, allowManualOverride: true, allowStudentAsharCheckoutOverride: true, dhuhaStartTime: '07:00', dhuhaEndTime: '10:30', dzuhurStartTime: '11:45', dzuhurEndTime: '13:30', asharStartTime: '15:00', asharEndTime: '16:30', asharRequiredClassEndTime: '15:00', duplicateScanWindowMinutes: 5 };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('**/api/v1/identity/users**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'siswa-1', fullName: 'Alya Putri', role: 'SISWA' }])) });
    });
    await page.route('**/api/v1/devices/readers**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([{ id: 'reader-1', name: 'Reader Mushola', type: 'MUSHOLA', status: 'ACTIVE' }])) });
    });
    await page.route('**/api/v1/attendance/qr-scan', async (route: Route) => {
      const body = route.request().postDataJSON();
      if (body.readerType === 'MUSHOLA') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Scan mushola wajib melalui reader resmi bersignature. Gunakan override manual bila perlu.' }) });
      if (body.direction === 'OUT') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Siswa ini masih punya jadwal sampai sore. Scan Ashar dulu sebelum pulang.' }) });
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ kind: 'GATE', message: 'Scan gerbang masuk tercatat.' }) });
    });

    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Aturan Absensi' })).toBeVisible();
    await expect(page.getByText('Siswa wajib scan Ashar sebelum pulang jika jadwal sampai sore')).toBeVisible();
    await page.goto('/admin/devices');
    await page.getByRole('button', { name: 'Input Manual Cadangan' }).click();
    await page.locator('form select').nth(0).selectOption('siswa-1');
    await page.locator('form select').nth(2).selectOption('GATE');
    await page.locator('form select').nth(3).selectOption('IN');
    await page.getByRole('button', { name: /Simpan Catatan/ }).click();
    await expect(page.getByText('Scan gerbang masuk tercatat.', { exact: true })).toBeVisible();
    await page.locator('form select').nth(2).selectOption('GATE');
    await page.locator('form select').nth(3).selectOption('OUT');
    await page.getByRole('button', { name: /Simpan Catatan/ }).click();
    await expect(page.getByText('Siswa ini masih punya jadwal sampai sore. Scan Ashar dulu sebelum pulang.', { exact: true })).toBeVisible();
  });

  test('admin can open Catatan Piket, create note, and deactivate it', async ({ page }) => {
    await seedAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    let notes: any[] = [];

    await page.route('**/api/v1/picket-notes**', async (route: Route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated(notes)) });
        return;
      }
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        notes = [{ id: 'note-1', active: true, createdBy: { fullName: 'Admin TU' }, ...body }, ...notes];
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(notes[0]) });
        return;
      }
      if (method === 'DELETE') {
        notes = notes.map((note) => ({ ...note, active: false }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notes[0]) });
        return;
      }
      await route.continue();
    });

    await page.goto('/admin/picket');
    await expect(page.getByRole('heading', { name: 'Catatan Piket' })).toBeVisible();
    await page.locator('form input').first().fill('Gerbang ramai');
    await page.locator('form textarea').first().fill('Antrian gerbang ramai tetapi tertib.');
    await page.getByRole('button', { name: /Simpan/ }).click();
    await expect(page.getByText('Gerbang ramai')).toBeVisible();
    await page.getByRole('button', { name: 'Hapus' }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByText('Catatan piket dinonaktifkan.')).toBeVisible();
  });

  test('guru can check in, save early roster, and check out', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -6.2, longitude: 106.816666, accuracy: 12 });
    await seedAuth(page, { id: 'guru-1', username: 'guru.matematika', fullName: 'Guru E2E', role: 'GURU_MAPEL' });
    const session = {
      id: 'session-1',
      startsAt: '2026-04-25T00:15:00.000Z',
      endsAt: '2099-04-25T01:45:00.000Z',
      status: 'SCHEDULED',
      schoolClass: { id: 'class-1', code: 'X-A', name: 'X-A' },
      subject: { id: 'sub-1', name: 'Matematika' },
      teacher: { id: 'guru-1', fullName: 'Guru E2E' },
      teacherPresence: null
    };
    const roster = [
      { studentId: 's1', fullName: 'Alya Putri', username: '24001', cardStatus: 'ACTIVE', status: 'ALPA' },
      { studentId: 's2', fullName: 'Rafa Maulana', username: '24002', cardStatus: 'ACTIVE', status: 'ALPA' }
    ];

    await page.route('**/api/v1/attendance/class-sessions**', async (route: Route) => {
      const url = route.request().url();
      if (url.includes('/api/v1/auth/')) return route.fallback();
      const method = route.request().method();
      if (method === 'GET' && url.endsWith('/roster')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session, roster }) });
        return;
      }
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(paginated([session])) });
        return;
      }
      if (method === 'POST' && url.endsWith('/open')) {
        session.status = 'OPEN';
        session.teacherPresence = { status: 'HADIR', checkInAt: new Date().toISOString(), checkOutAt: null };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...session, teacherPresence: session.teacherPresence }) });
        return;
      }
      if (method === 'POST' && url.endsWith('/close')) {
        session.status = 'CLOSED';
        session.teacherPresence = { ...(session.teacherPresence || {}), checkOutAt: new Date().toISOString() };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...session, teacherPresence: session.teacherPresence }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, updated: roster.length }) });
    });

    await page.goto('/guru/presensi');
    await expect(page.getByRole('heading', { name: /Matematika/ })).toBeVisible();
    const selectTheme = await page.locator('.input select').first().evaluate((select) => {
      const selectStyle = getComputedStyle(select);
      const option = select.querySelector('option');
      const optionStyle = option ? getComputedStyle(option) : null;
      return {
        colorScheme: selectStyle.colorScheme,
        optionBg: optionStyle?.backgroundColor || '',
        optionColor: optionStyle?.color || '',
        overflow: document.documentElement.scrollWidth > window.innerWidth
      };
    });
    expect(selectTheme.colorScheme).toContain('dark');
    expect(selectTheme.optionBg).not.toBe('rgb(255, 255, 255)');
    expect(selectTheme.optionColor).not.toBe('rgb(0, 0, 0)');
    expect(selectTheme.overflow).toBe(false);
    await page.getByRole('button', { name: /Absen Masuk/ }).click();
    await expect(page.getByText('Absen masuk guru tercatat.')).toBeVisible();
    await page.getByRole('button', { name: /Konfirmasi semua Hadir/ }).click();
    await page.getByRole('button', { name: /Simpan Presensi Awal/ }).click();
    await expect(page.getByText('Presensi siswa awal pembelajaran tersimpan.')).toBeVisible();
    await page.getByRole('button', { name: /Absen Keluar/ }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByText('Absen keluar guru tercatat.')).toBeVisible();
  });

  test('siswa dashboard is read only', async ({ page }) => {
    await seedAuth(page, { id: 'siswa-1', username: 'siswa.citra', fullName: 'Citra', role: 'SISWA' });
    await page.route('**/api/v1/reports/my-attendance**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], meta: { total: 0 } }) });
    });
    await page.goto('/siswa/dashboard');
    await expect(page.getByRole('heading', { name: 'Kehadiran Saya' })).toBeVisible();
    await expect(page.getByText('Siswa hanya bisa melihat, tidak bisa input atau koreksi.')).toBeVisible();
  });

  test('tidak ada horizontal overflow di semua viewport penting', async ({ page }) => {
    await routeCommonApi(page);
    const viewports = [
      { width: 360, height: 640, label: 'mobile-kecil' },
      { width: 375, height: 812, label: 'mobile-umum' },
      { width: 768, height: 1024, label: 'tablet' },
      { width: 1366, height: 768, label: 'laptop' }
    ];
    const cases = [
      { user: { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' }, url: '/admin/dashboard' },
      { user: { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' }, url: '/admin/master-data' },
      { user: { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' }, url: '/admin/devices' },
      { user: { id: 'guru-1', username: 'guru.matematika', fullName: 'Guru Mapel', role: 'GURU_MAPEL' }, url: '/guru/dashboard' },
      { user: { id: 'siswa-1', username: 'siswa.citra', fullName: 'Citra', role: 'SISWA' }, url: '/siswa/dashboard' }
    ];
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const c of cases) {
        await setStoredAuth(page, c.user);
        await page.goto(c.url);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(overflow, `overflow di ${vp.label} pada ${c.url}`).toBe(false);
      }
    }
  });

  test('section utama tidak berdempetan di halaman guru', async ({ page }) => {
    await routeCommonApi(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await setStoredAuth(page, { id: 'guru-1', username: 'guru.matematika', fullName: 'Guru Mapel', role: 'GURU_MAPEL' });

    for (const url of ['/guru/dashboard', '/guru/presensi']) {
      await page.goto(url);
      await expect(page.locator('.content')).toBeVisible();
      const gaps = await page.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll('.content > *'))
          .filter((node) => !node.classList.contains('page-head') && !node.classList.contains('dock'))
          .map((node) => node.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0);
        return blocks.slice(1).map((rect, index) => Math.round(rect.top - blocks[index].bottom));
      });
      for (const gap of gaps) expect(gap, `jarak section di ${url}`).toBeGreaterThanOrEqual(12);
    }
  });

  test('tombol dan form utama terlihat dan tidak terpotong di mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await routeCommonApi(page);
    const uiErrors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') uiErrors.push(msg.text()); });
    page.on('pageerror', (error) => uiErrors.push(error.message));

    await setStoredAuth(page, { id: 'admin-1', username: 'admin.tu', fullName: 'Admin TU', role: 'ADMIN_TU' });
    await page.goto('/admin/master-data');
    await expect(page.getByRole('heading', { name: 'Akun & Data Sekolah' })).toBeVisible();
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(pageOverflow).toBe(false);

    await page.goto('/login');
    const submitBtn = await page.getByRole('button', { name: /^Masuk/ }).boundingBox();
    expect(submitBtn).not.toBeNull();
    expect((submitBtn?.width ?? 0)).toBeGreaterThan(100);

    expect(uiErrors.filter((e) => !e.includes('favicon') && !e.includes('api/v1'))).toEqual([]);
  });
});
