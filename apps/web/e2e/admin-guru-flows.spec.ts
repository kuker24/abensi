import { expect, test, type Page, type Route } from '@playwright/test';

const TOKEN_KEY = 'schoolhub_access_token';
const USER_KEY = 'schoolhub_user';

async function seedAuth(page: Page, user: { id: string; username: string; fullName: string; role: string }) {
  await page.addInitScript(
    ([token, storedUser, tokenKey, userKey]) => {
      window.localStorage.setItem(tokenKey, token);
      window.localStorage.setItem(userKey, JSON.stringify(storedUser));
    },
    ['e2e-token', user, TOKEN_KEY, USER_KEY]
  );
}

test.describe('SchoolHub interactive E2E', () => {
  test('admin can resolve anomaly with optimistic sync state', async ({ page }) => {
    await seedAuth(page, {
      id: 'admin-1',
      username: 'admin.tu',
      fullName: 'Admin TU',
      role: 'ADMIN_TU'
    });

    const createdAt = '2026-04-24T01:30:00.000Z';
    let flags = [
      {
        id: 'flag-e2e-1',
        type: 'BOLOS_KELAS',
        status: 'OPEN',
        createdAt,
        user: {
          id: 'student-1',
          username: '24018',
          fullName: 'Siswa Uji E2E',
          role: 'SISWA'
        },
        session: {
          id: 'session-e2e-1',
          schoolClass: {
            id: 'class-1',
            code: 'X-A',
            name: 'X-A',
            yearLabel: '2025/2026'
          },
          subject: {
            id: 'subject-1',
            code: 'MAT',
            name: 'Matematika'
          }
        }
      }
    ];

    await page.route('**/api/v1/reconciliation/flags**', async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: flags,
          meta: { page: 1, limit: 200, total: flags.length, totalPages: 1, hasNext: false, hasPrev: false }
        })
      });
    });

    await page.route('**/api/v1/reconciliation/flags/*/resolve', async (route: Route) => {
      const id = route.request().url().split('/').slice(-2)[0];
      flags = flags.map((flag) =>
        flag.id === id
          ? {
              ...flag,
              status: 'RESOLVED',
              resolvedAt: new Date().toISOString()
            }
          : flag
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });

    await page.route('**/api/v1/reconciliation/flags/*/escalate', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });

    await page.goto('/admin/anomali');
    await expect(page.getByRole('heading', { name: 'Papan Anomali Rekonsiliasi' })).toBeVisible();

    const row = page.locator('tbody tr', { hasText: 'Siswa Uji E2E' }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Aksi' }).click();
    await page.getByRole('button', { name: 'Selesaikan' }).click();
    await expect(page.getByRole('heading', { name: 'Selesaikan Flag Anomali' })).toBeVisible();

    await page
      .getByPlaceholder('Tuliskan alasan penyelesaian minimal 10 karakter')
      .fill('Verifikasi manual oleh admin untuk sinkronisasi status.');
    await page.getByRole('button', { name: 'Simpan Penyelesaian' }).click();

    await expect(row).toContainText('Terselesaikan');
    await expect(row).toContainText('Tersinkron');
  });

  test('guru can update attendance with unsaved-change guard and save transition', async ({ page }) => {
    await seedAuth(page, {
      id: 'guru-1',
      username: 'guru.mapel',
      fullName: 'Guru E2E',
      role: 'GURU_MAPEL'
    });

    let sessionStatus: 'OPEN' | 'SCHEDULED' | 'CLOSED' = 'OPEN';
    const startsAt = '2026-04-24T01:30:00.000Z';
    const endsAt = '2026-04-24T03:00:00.000Z';
    const sessionId = 'session-e2e-1';
    const session = {
      id: sessionId,
      startsAt,
      endsAt,
      status: sessionStatus,
      schoolClass: { id: 'class-1', code: 'X-A', name: 'Kelas X-A', yearLabel: '2025/2026' },
      subject: { id: 'subject-1', code: 'MAT', name: 'Matematika' },
      teacher: { id: 'guru-1', username: 'guru.mapel', fullName: 'Guru E2E', role: 'GURU_MAPEL' }
    };

    let roster = [
      {
        studentId: 'student-1',
        fullName: 'Alya Putri',
        username: '24018',
        cardStatus: 'ACTIVE',
        status: 'HADIR',
        note: null,
        updatedAt: new Date().toISOString()
      },
      {
        studentId: 'student-2',
        fullName: 'Rafa Maulana',
        username: '24019',
        cardStatus: 'ACTIVE',
        status: 'HADIR',
        note: null,
        updatedAt: new Date().toISOString()
      }
    ];

    await page.route('**/api/v1/attendance/class-sessions**', async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([session, { ...session, id: 'session-e2e-2', status: 'CLOSED' }])
      });
    });

    await page.route('**/api/v1/attendance/class-sessions/*/roster', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: { id: sessionId, status: sessionStatus, startsAt, endsAt },
          roster
        })
      });
    });

    await page.route('**/api/v1/attendance/class-sessions/*/attendance', async (route: Route) => {
      const body = route.request().postDataJSON() as {
        items: Array<{ studentId: string; status: string; note?: string }>;
      };
      roster = roster.map((student) => {
        const next = body.items.find((item) => item.studentId === student.studentId);
        if (!next) return student;
        return {
          ...student,
          status: next.status,
          note: next.note ?? null,
          updatedAt: new Date().toISOString()
        };
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, count: body.items.length })
      });
    });

    await page.route('**/api/v1/attendance/class-sessions/*/open', async (route: Route) => {
      sessionStatus = 'OPEN';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });

    await page.route('**/api/v1/attendance/class-sessions/*/close', async (route: Route) => {
      sessionStatus = 'CLOSED';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });

    await page.goto('/guru/presensi');
    await expect(page.getByRole('heading', { name: 'Input Presensi Kelas' })).toBeVisible();

    const studentRow = page.locator('.attendance-item', { hasText: 'Alya Putri' }).first();
    await studentRow.getByRole('button', { name: 'Terlambat' }).click();

    await expect(page.getByText('Perubahan belum disimpan')).toBeVisible();
    await expect(studentRow.locator('button.status-chip-active', { hasText: 'Terlambat' })).toBeVisible();

    await page.getByRole('button', { name: 'Simpan Presensi' }).click();

    await expect(page.getByText('Perubahan belum disimpan')).toHaveCount(0);
    await expect(studentRow.locator('button.status-chip-active', { hasText: 'Terlambat' })).toBeVisible();
  });
});
