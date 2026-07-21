import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setRiskConfirmHandler } from '../../confirm';
import { AndroidApkUpdatePage, AuditPage, DevicesPage, MasterDataPage, ReportsPage, SchedulePage, SessionsPage, StudentDailyCompletenessPage, REPORT_FORMAT_OPTIONS, buildOfficialReportExportPath, formatReportPeriod, sanitizeSpreadsheetCell } from './AdminPages.jsx';

afterEach(() => {
  cleanup();
  try {
    window.localStorage?.clear?.();
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
  } catch { /* ignore unavailable storage */ }
  setRiskConfirmHandler(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Spreadsheet export safety', () => {
  it.each(['=SUM(1,1)', '+CMD', '-2+3', '@IMPORT', '\tformula', '\rformula'])('prefixes formula-like cell %j', (value) => {
    expect(sanitizeSpreadsheetCell(value)).toBe(`'${value}`);
  });

  it('keeps ordinary credential values unchanged', () => {
    expect(sanitizeSpreadsheetCell('siswa.0001')).toBe('siswa.0001');
  });
});

describe('Master Data account login slips', () => {
  it('renders slips from memory state and clears them without browser storage', async () => {
    const notify = vi.fn();
    const localSetItem = vi.fn();
    const sessionSetItem = vi.fn();
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn(() => JSON.stringify({ id: 'admin-1', role: 'ADMIN_TU' })), setItem: localSetItem, removeItem: vi.fn(), clear: vi.fn() },
      configurable: true
    });
    Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true });
    Object.defineProperty(window, 'sessionStorage', {
      value: { getItem: vi.fn(), setItem: sessionSetItem, removeItem: vi.fn(), clear: vi.fn() },
      configurable: true
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.history.pushState({}, '', '/admin/master-data?tab=account-slips');
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/auth/csrf')) return new Response(JSON.stringify({ csrfToken: 'csrf-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/identity/users')) {
        return new Response(JSON.stringify({
          items: [
            { id: 'student-1', username: 'siswa.test', fullName: 'Siswa Test', role: 'SISWA', active: true },
            { id: 'developer-1', username: 'dev', fullName: 'Developer', role: 'DEVELOPER', active: true }
          ],
          meta: { page: 1, limit: 200, total: 2, totalPages: 1 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/identity/account-slips/generate')) {
        return new Response(JSON.stringify({
          generatedAt: '2026-07-03T00:00:00.000Z',
          revokeSessions: true,
          revokedSessions: 0,
          slips: [{ userId: 'student-1', fullName: 'Siswa Test', username: 'siswa.test', role: 'SISWA', initialPassword: 'contoh-pass-01' }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    render(<MasterDataPage notify={notify} />);

    const checkbox = await screen.findByLabelText('Pilih Siswa Test');
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /Generate Lembar Akun/i }));

    expect(await screen.findByText('contoh-pass-01')).toBeInTheDocument();
    expect(screen.getByTestId('account-slip-print-area')).toBeInTheDocument();
    expect(localSetItem).not.toHaveBeenCalled();
    expect(sessionSetItem).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /Hapus dari layar/i })[0]);
    await waitFor(() => expect(screen.queryByText('contoh-pass-01')).not.toBeInTheDocument());
  });
});

describe('Master Data account delete guard', () => {
  it('previews and confirms bulk account delete without storing PIN in browser storage', async () => {
    const notify = vi.fn();
    const localSetItem = vi.fn();
    const sessionSetItem = vi.fn();
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: vi.fn(() => JSON.stringify({ id: 'admin-1', role: 'ADMIN_TU' })), setItem: localSetItem, removeItem: vi.fn(), clear: vi.fn() },
      configurable: true
    });
    Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true });
    Object.defineProperty(window, 'sessionStorage', {
      value: { getItem: vi.fn(), setItem: sessionSetItem, removeItem: vi.fn(), clear: vi.fn() },
      configurable: true
    });
    let deleteRequestBody = null;
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/auth/csrf')) return new Response(JSON.stringify({ csrfToken: 'csrf-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/identity/accounts/delete-pin/status')) return new Response(JSON.stringify({ configured: true, updatedAt: '2026-07-03T00:00:00.000Z' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/identity/users')) {
        return new Response(JSON.stringify({
          items: [{ id: 'student-1', username: 'siswa.test', fullName: 'Siswa Test', role: 'SISWA', active: true, cardStatus: 'ACTIVE', archivedAt: null }],
          meta: { page: 1, limit: 200, total: 1, totalPages: 1 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/identity/accounts/delete-preview')) {
        return new Response(JSON.stringify({
          requestedCount: 1,
          roleDistribution: { SISWA: 1 },
          summary: { hardDeleteCount: 1, archiveCount: 0, rejectedCount: 0 },
          items: [{ userId: 'student-1', username: 'siswa.test', fullName: 'Siswa Test', role: 'SISWA', active: true, cardStatus: 'ACTIVE', action: 'HARD_DELETE', dependencyCount: 0, dependencyReasons: [], rejectReasons: [], warnings: [] }]
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/identity/accounts/delete')) {
        deleteRequestBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ deletedAt: '2026-07-03T00:00:00.000Z', hardDeletedCount: 1, archivedCount: 0, rejectedCount: 0, items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    window.history.pushState({}, '', '/admin/master-data?tab=users');
    render(<MasterDataPage notify={notify} />);

    fireEvent.click(await screen.findByLabelText('Pilih Siswa Test'));
    fireEvent.click(screen.getByRole('button', { name: /Hapus Terpilih/i }));
    const dialog = await screen.findByRole('dialog', { name: /Konfirmasi Hapus Akun/i });
    expect(dialog).toBeInTheDocument();
    const pinInput = dialog.querySelector('input[type="password"][inputmode="numeric"]');
    expect(pinInput).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/Alasan/i), { target: { value: 'Membersihkan akun test salah.' } });
    fireEvent.change(pinInput, { target: { value: '123456' } });
    fireEvent.change(within(dialog).getByLabelText(/Ketik HAPUS AKUN/i), { target: { value: 'HAPUS AKUN' } });
    fireEvent.click(within(dialog).getByLabelText(/Saya paham/i));
    fireEvent.click(within(dialog).getByRole('button', { name: /Konfirmasi Hapus Akun/i }));

    await waitFor(() => expect(deleteRequestBody).toEqual(expect.objectContaining({ userIds: ['student-1'], confirmText: 'HAPUS AKUN', pin: '123456' })));
    expect(localSetItem).not.toHaveBeenCalled();
    expect(sessionSetItem).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Konfirmasi Hapus Akun/i })).not.toBeInTheDocument());
  });
});

describe('HP Scanner Android operator UI', () => {
  it('clarifies the four target reader model without role-specific HP labels', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/device-readers')) return new Response(JSON.stringify({ items: [], meta: { page: 1, limit: 200, total: 0, totalPages: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    render(<DevicesPage notify={vi.fn()} />);

    expect(await screen.findByText('Aktivasi Android Reader')).toBeInTheDocument();
    expect(screen.getAllByText('READER_DEV_TEST_01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('READER_IDENTITY_01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('READER_GATE_PRAYER_01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('READER_GATE_PRAYER_02').length).toBeGreaterThan(0);
    expect(screen.getByText('Dev Test Identitas')).toBeInTheDocument();
    expect(screen.getByText('Dev Test Gerbang & Mushola')).toBeInTheDocument();
    expect(screen.getByText(/API key dan signing secret tidak ditampilkan di web/i)).toBeInTheDocument();
    expect(screen.queryByText('Alat Lama')).not.toBeInTheDocument();
    expect(screen.queryByText('Tambah Alat Pembaca')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/HP Guru|HP Siswa|HP Staff|HP Kepala|Scanner Guru|Scanner Siswa/i);
  });

  it('shows offline queue monitoring fields for each HP scanner', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/device-readers')) {
        return new Response(JSON.stringify({
          items: [{
            id: 'reader-monitor-1',
            type: 'QR_ANDROID',
            status: 'ACTIVE',
            deviceId: 'READER_GATE_PRAYER_01',
            name: 'READER_GATE_PRAYER_01',
            locationName: 'PR127 Gate Prayer 01',
            allowedModes: ['GERBANG', 'MUSHOLA'],
            currentMode: 'MUSHOLA',
            monitoringStatus: 'OFFLINE',
            pendingQueueCount: 5,
            lastHeartbeatAt: '2026-06-20T01:00:00.000Z',
            lastQueueFlushAt: '2026-06-20T00:45:00.000Z',
            appVersion: '1.2.3',
            appVersionCode: 7,
            batteryLevel: 18,
            networkStatus: 'OFFLINE',
            monitorWarnings: ['HEARTBEAT_OFFLINE', 'OFFLINE_QUEUE_PENDING', 'LOW_BATTERY']
          }],
          meta: { page: 1, limit: 200, total: 1, totalPages: 1 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    render(<DevicesPage notify={vi.fn()} />);

    expect(await screen.findByText('Antrean offline')).toBeInTheDocument();
    const versionCell = await screen.findByText('1.2.3 (7)');
    const row = versionCell.closest('tr');
    expect(row).toBeTruthy();
    expect(within(row).getByText('Offline')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(within(row).getByText('Gerbang & Mushola')).toBeInTheDocument();
    expect(within(row).getByText('1.2.3 (7)')).toBeInTheDocument();
    expect(within(row).getByText('18%')).toBeInTheDocument();
    expect(within(row).getByText('OFFLINE')).toBeInTheDocument();
    expect(within(row).getByText(/Ada antrean offline/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/readerSecret|readerSecretCiphertext|shrsec_|qrCode|schoolhub:qr/i);
  });

  it('shows selected HP-specific activation instructions without exposing scanner secrets in the list', async () => {
    const notify = vi.fn();
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/auth/csrf')) return new Response(JSON.stringify({ csrfToken: 'csrf-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/device-readers/reader-dev/android/provision-code')) {
        return new Response(JSON.stringify({
          item: { id: 'reader-dev', name: 'READER_DEV_TEST_01', allowedModes: ['CHECK_ONLY'], hasProvisioningToken: true, hasReaderSecret: true },
          provisionToken: 'shrp_activationCodeOnlyForThisFlow',
          provisioningQr: 'schoolhub:reader-provision:v1:shrp_activationCodeOnlyForThisFlow',
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
        }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/device-readers/reader-gate-1/android/provision-code')) {
        return new Response(JSON.stringify({
          item: { id: 'reader-gate-1', name: 'READER_GATE_PRAYER_01', allowedModes: ['GERBANG', 'MUSHOLA'], hasProvisioningToken: true, hasReaderSecret: true },
          provisionToken: 'shrp_gatePrayerActivationCode',
          provisioningQr: 'schoolhub:reader-provision:v1:shrp_gatePrayerActivationCode',
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
        }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/device-readers')) {
        return new Response(JSON.stringify({
          items: [
            { id: 'reader-dev', type: 'QR_ANDROID', status: 'ACTIVE', deviceId: 'READER_DEV_TEST_01', name: 'READER_DEV_TEST_01', locationName: 'PR127 Developer Test', allowedModes: ['CHECK_ONLY'], lastUsedMode: null, hasReaderSecret: true },
            { id: 'reader-dev-gate', type: 'QR_ANDROID', status: 'ACTIVE', deviceId: 'READER_IDENTITY_01', name: 'READER_IDENTITY_01', locationName: 'Dev Test Gerbang & Mushola', allowedModes: ['GATE_IN', 'GATE_OUT', 'MUSHOLA'], lastUsedMode: 'GATE_IN', hasReaderSecret: true },
            { id: 'reader-gate-1', type: 'QR_ANDROID', status: 'ACTIVE', deviceId: 'READER_GATE_PRAYER_01', name: 'READER_GATE_PRAYER_01', locationName: 'PR127 Gate Prayer 01', allowedModes: ['GERBANG', 'MUSHOLA'], lastUsedMode: 'GERBANG', hasReaderSecret: true }
          ],
          meta: { page: 1, limit: 200, total: 2, totalPages: 1 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<DevicesPage notify={notify} />);

    expect((await screen.findAllByText('Cek Identitas')).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole('button', { name: /Buat Kode Aktivasi/i }));
    expect(await screen.findByText((_content, node) => node?.tagName === 'LI' && node.textContent === 'Buka aplikasi SIAB2 Reader di HP untuk READER_DEV_TEST_01.')).toBeInTheDocument();
    expect(screen.getByText('shrp_activationCodeOnlyForThisFlow')).toBeInTheDocument();
    const firstProvisionCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/device-readers/reader-dev/android/provision-code'));
    expect(JSON.parse(String(firstProvisionCall?.[1]?.body))).not.toHaveProperty('allowedModes');
    expect(document.body.textContent).not.toMatch(/readerSecret|readerSecretCiphertext|shrsec_/i);

    fireEvent.click(screen.getByRole('button', { name: /Dev Test Gerbang & Mushola.*READER_IDENTITY_01/i }));
    expect(screen.getAllByText('Gerbang & Mushola').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Gerbang\/Mushola 01.*READER_GATE_PRAYER_01/i }));
    fireEvent.click(screen.getByRole('button', { name: /Buat Kode Aktivasi/i }));
    expect(await screen.findByText((_content, node) => node?.tagName === 'LI' && node.textContent === 'Buka aplikasi SIAB2 Reader di HP untuk READER_GATE_PRAYER_01.')).toBeInTheDocument();
    const provisionCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/android/provision-code'));
    expect(JSON.parse(String(provisionCalls.at(-1)?.[1]?.body))).not.toHaveProperty('allowedModes');
    expect(document.body.textContent).not.toMatch(/readerSecret|readerSecretCiphertext|shrsec_/i);
  });

  it('shows safe secret copy and does not offer Aktifkan lagi for pending unprovisioned readers', async () => {
    const notify = vi.fn();
    const readers = [
      { id: 'pending-1', type: 'QR_ANDROID', status: 'INACTIVE', deviceId: null, name: 'READER_DEV_TEST_01', locationName: 'PR127 Developer Test', allowedModes: ['CHECK_ONLY'] },
      { id: 'active-1', type: 'QR_ANDROID', status: 'ACTIVE', deviceId: 'READER_GATE_PRAYER_01', name: 'READER_GATE_PRAYER_01', locationName: 'PR127 Gate Prayer 01', allowedModes: ['GERBANG', 'MUSHOLA'], lastUsedMode: 'GERBANG' },
      { id: 'inactive-1', type: 'QR_ANDROID', status: 'INACTIVE', deviceId: 'READER_GATE_PRAYER_02', name: 'READER_GATE_PRAYER_02', locationName: 'PR127 Gate Prayer 02', allowedModes: ['GERBANG', 'MUSHOLA'], lastUsedMode: 'MUSHOLA' },
      { id: 'legacy-1', type: 'QR_ANDROID', status: 'ACTIVE', deviceId: 'legacy-android', name: 'Legacy Android', locationName: 'Legacy', allowedModes: ['GERBANG', 'MUSHOLA'] }
    ];
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/auth/csrf')) return new Response(JSON.stringify({ csrfToken: 'csrf-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/device-readers')) return new Response(JSON.stringify({ items: readers, meta: { page: 1, limit: 200, total: readers.length, totalPages: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<DevicesPage notify={notify} />);

    expect(await screen.findByText(/API key dan signing secret tidak ditampilkan di web/i)).toBeInTheDocument();
    const readerListCard = screen.getByText('Daftar 4 Reader Android Resmi').closest('.card');
    const pendingRow = within(readerListCard).getByText('READER_DEV_TEST_01').closest('tr');
    const activeRow = within(readerListCard).getByText('READER_GATE_PRAYER_01').closest('tr');
    const inactiveRow = within(readerListCard).getByText('READER_GATE_PRAYER_02').closest('tr');
    expect(screen.queryByText('Legacy Android')).not.toBeInTheDocument();

    expect(within(pendingRow).getByText('Menunggu aktivasi HP')).toBeInTheDocument();
    expect(within(pendingRow).queryByRole('button', { name: 'Aktifkan lagi' })).not.toBeInTheDocument();
    expect(within(pendingRow).getByRole('button', { name: 'Buat kode baru' })).toBeInTheDocument();
    expect(within(pendingRow).getByRole('button', { name: 'Cabut' })).toBeInTheDocument();
    expect(within(activeRow).getByRole('button', { name: 'Nonaktifkan' })).toBeInTheDocument();
    expect(within(inactiveRow).getByRole('button', { name: 'Aktifkan lagi' })).toBeInTheDocument();

    fireEvent.click(within(pendingRow).getByRole('button', { name: 'Buat kode baru' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/device-readers/pending-1/android/provision-code'))).toBe(true));
    const replaceProvisionCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/device-readers/pending-1/android/provision-code'));
    expect(JSON.parse(String(replaceProvisionCall?.[1]?.body))).not.toHaveProperty('allowedModes');
  });
});

describe('APK Update Center admin UI', () => {
  it('shows latest APK metadata and safe rollout guidance without exposing storage paths', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/admin/android-apk-releases')) {
        return new Response(JSON.stringify({
          items: [{ id: 'apk_1', versionName: '1.2.0', versionCode: 4, minSupportedVersionCode: 3, forceUpdate: true, releaseNotes: 'Update HP scanner', apkFileName: 'reader.apk', apkSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', apkSizeBytes: 12345678, isPublished: true, publishedAt: '2026-06-21T00:00:00.000Z', downloadUrl: '/api/v1/mobile/android-reader/releases/apk_1/download' }],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    render(<AndroidApkUpdatePage notify={vi.fn()} />);

    expect(await screen.findByText('APK Update Center')).toBeInTheDocument();
    expect(screen.getAllByText('1.2.0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Force update').length).toBeGreaterThan(0);
    expect(screen.getByText(/Tes di 1 HP dulu sebelum rollout production/i)).toBeInTheDocument();
    expect(screen.getByText(/Android akan memverifikasi SHA256/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/apkPath|uploads\/android-apk-releases|readerSecret|shrsec_/i);
  });
});

describe('audit page UI', () => {
  it('shows a friendly empty state when audit endpoint returns no items', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/audit')) {
        return new Response(JSON.stringify({ items: [], meta: { page: 1, limit: 50, total: 0, totalPages: 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    render(<AuditPage />);

    expect(await screen.findByText('Belum ada riwayat perubahan')).toBeInTheDocument();
    expect(screen.getByText('Setelah admin mengubah data, catatan akan muncul di sini.')).toBeInTheDocument();
    expect(screen.queryByText(/Internal server error/i)).not.toBeInTheDocument();
  });

  it('renders audit rows returned with string sequence values', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/audit')) {
        return new Response(JSON.stringify({
          items: [{
            id: 'audit-1',
            sequence: '217',
            action: 'identity.user.updated',
            module: 'identity',
            resource: 'user',
            resourceId: 'user-1',
            reason: 'Perubahan data',
            createdAt: '2026-06-20T10:42:05.095Z',
            actor: { fullName: 'Admin TU' },
            after: { reason: 'fallback reason' }
          }],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    render(<AuditPage />);

    expect(await screen.findByText('identity.user.updated')).toBeInTheDocument();
    expect(screen.getByText('identity')).toBeInTheDocument();
    expect(screen.getByText('Admin TU')).toBeInTheDocument();
    expect(screen.getByText('user:user-1')).toBeInTheDocument();
    expect(screen.getByText('Perubahan data')).toBeInTheDocument();
  });
});

describe('student daily completeness UI', () => {
  it('shows gate/class/prayer columns with friendly Indonesian status labels', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/academic/classes')) {
        return new Response(JSON.stringify({ items: [{ id: 'class-1', code: 'X-A', name: 'Kelas X A' }], meta: { page: 1, limit: 200, total: 1, totalPages: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/reports/student-daily-completeness')) {
        return new Response(JSON.stringify({
          summary: { completeCount: 1, missingArrivalCount: 1, missingDepartureCount: 2, missingClassAttendanceCount: 3, missingPrayerCount: 4, needsVerificationCount: 0 },
          items: [
            { studentId: 'siswa-1', fullName: 'Aisyah Putri', username: 'siswa.aisyah', schoolClass: 'X-A', gateArrivalAt: '2026-06-19T00:00:00.000Z', gateDepartureAt: null, classAttendanceLabel: '1/1 hadir', prayerAttendanceLabel: 'Belum scan sholat', finalStatus: 'BELUM_SCAN_PULANG', note: 'Belum scan pulang, Belum scan sholat' },
            { studentId: 'siswa-2', fullName: 'Budi Santoso', username: 'siswa.budi', schoolClass: 'X-A', gateArrivalAt: '2026-06-19T00:05:00.000Z', gateDepartureAt: '2026-06-19T08:00:00.000Z', classAttendanceLabel: '1/1 hadir', prayerAttendanceLabel: '2/2 sholat tercatat', finalStatus: 'HADIR_LENGKAP', note: 'Hadir lengkap' },
            { studentId: 'siswa-3', fullName: 'Citra Lestari', username: 'siswa.citra', schoolClass: 'X-A', gateArrivalAt: '2026-06-19T00:10:00.000Z', gateDepartureAt: '2026-06-19T08:05:00.000Z', classAttendanceLabel: 'Belum diabsen guru', prayerAttendanceLabel: '2/2 sholat tercatat', finalStatus: 'BELUM_ABSEN_KELAS', note: 'Belum diabsen guru' }
          ],
          meta: { page: 1, limit: 200, total: 3, totalPages: 1 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    render(<StudentDailyCompletenessPage notify={vi.fn()} />);

    expect(await screen.findByText('Kehadiran Lengkap Siswa')).toBeInTheDocument();
    expect(screen.getByText('Datang gerbang')).toBeInTheDocument();
    expect(screen.getByText('Pulang gerbang')).toBeInTheDocument();
    expect(screen.getByText('Absensi kelas')).toBeInTheDocument();
    expect(screen.getByText('Sholat')).toBeInTheDocument();
    expect(screen.getByText('Aisyah Putri')).toBeInTheDocument();
    expect(screen.getAllByText('Belum scan pulang').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hadir lengkap').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Belum diabsen guru').length).toBeGreaterThan(0);
    expect(screen.queryByText('BELUM_SCAN_PULANG')).not.toBeInTheDocument();
    expect(screen.queryByText('BELUM_ABSEN_KELAS')).not.toBeInTheDocument();
    expect(screen.queryByText('DEFAULTED')).not.toBeInTheDocument();
    expect(screen.queryByText('HADIR_LENGKAP')).not.toBeInTheDocument();
  });
});

describe('official report download UI', () => {
  it('builds official backend export paths and does not add month to normal date-range reports', () => {
    const path = buildOfficialReportExportPath('recap/classes', 'xlsx', {
      from: '2026-06-19',
      to: '2026-06-19',
      classId: 'class-1'
    });

    expect(path).toContain('/reports/export');
    expect(path).toContain('reportType=recap_classes');
    expect(path).toContain('format=xlsx');
    expect(path).toContain('from=2026-06-19');
    expect(path).toContain('to=2026-06-19');
    expect(path).toContain('classId=class-1');
    expect(path).not.toContain('month=');
  });

  it('uses month for teacher monthly official exports', () => {
    expect(buildOfficialReportExportPath('teacher-monthly', 'pdf', { from: '2026-06-19' })).toContain('month=2026-06');
  });

  it('builds official paths for final operational mechanism reports', () => {
    expect(buildOfficialReportExportPath('staff-gate-attendance', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=staff_gate_attendance');
    expect(buildOfficialReportExportPath('teacher-session-activity', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=teacher_session_activity');
    expect(buildOfficialReportExportPath('student-prayer-attendance', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=student_prayer_attendance');
    expect(buildOfficialReportExportPath('student-worship-recap', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=student_worship_recap');
    expect(buildOfficialReportExportPath('student-daily-completeness', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=student_daily_complete_attendance');
    expect(buildOfficialReportExportPath('missing-arrival-scan', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=missing_arrival_scan');
    expect(buildOfficialReportExportPath('missing-departure-scan', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=missing_departure_scan');
    expect(buildOfficialReportExportPath('class-present-no-gate-scan', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=class_present_no_gate_scan');
    expect(buildOfficialReportExportPath('gate-scan-no-class-attendance', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=gate_scan_no_class_attendance');
    expect(buildOfficialReportExportPath('prayer-recap', 'xlsx', { from: '2026-06-19', to: '2026-06-19' })).toContain('reportType=prayer_recap');
  });

  it('uses Indonesian date summary instead of US date style', () => {
    const period = formatReportPeriod('2026-06-19', '2026-06-19');

    expect(period).toBe('19 Juni 2026');
    expect(period).not.toMatch(/06\s*\/\s*19\s*\/\s*2026/);
  });

  it('shows official format labels', () => {
    expect(REPORT_FORMAT_OPTIONS.map((option) => option.label)).toEqual([
      'CSV Data (.csv)',
      'Excel Resmi (.xlsx)',
      'PDF Resmi (.pdf)',
      'Word Resmi (.docx)'
    ]);
  });

  it('keeps print preview and downloads official report blobs from /reports/export', async () => {
    const notify = vi.fn();
    const print = vi.fn();
    Object.defineProperty(window, 'print', { value: print, configurable: true });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:official-report'),
      revokeObjectURL: vi.fn()
    });
    vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/reports/export')) {
        return new Response('PK official workbook', {
          status: 200,
          headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'content-disposition': 'attachment; filename="laporan-resmi.xlsx"'
          }
        });
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ReportsPage notify={notify} />);

    fireEvent.change(screen.getByLabelText('Tanggal awal laporan'), { target: { value: '2026-06-19' } });
    fireEvent.change(screen.getByLabelText('Tanggal akhir laporan'), { target: { value: '2026-06-19' } });

    expect(await screen.findByText(/Belum ada data laporan/i)).toBeInTheDocument();
    expect(screen.getByText('Excel Resmi (.xlsx)')).toBeInTheDocument();
    expect(screen.getByText('PDF Resmi (.pdf)')).toBeInTheDocument();
    expect(screen.getByText('Word Resmi (.docx)')).toBeInTheDocument();
    expect(screen.getByText('CSV Data (.csv)')).toBeInTheDocument();
    expect(screen.getByText(/Periode 19 Juni 2026/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cetak Pratinjau \/ Cetak/i }));
    expect(print).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Unduh Laporan/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/reports/export'), expect.any(Object)));
    const exportCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/reports/export'));
    expect(String(exportCall?.[0])).toContain('reportType=recap_classes');
    expect(String(exportCall?.[0])).toContain('format=xlsx');
    expect(notify).toHaveBeenCalledWith('Laporan resmi berhasil diunduh.');
  });

  it('hides official export controls for Kepala Sekolah read-only reports', async () => {
    const storedUser = JSON.stringify({ id: 'kepala-1', role: 'KEPALA_SEKOLAH' });
    const localStorageMock = { getItem: vi.fn((key) => key === 'schoolhub_user' ? storedUser : null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })));

    render(<ReportsPage notify={vi.fn()} />);

    expect(await screen.findByText(/Belum ada data laporan/i)).toBeInTheDocument();
    expect(screen.queryByText('Excel Resmi (.xlsx)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unduh Laporan/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cetak Pratinjau \/ Cetak/i })).toBeInTheDocument();
  });

  it('does not expose raw server errors to report operators', async () => {
    const notify = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/reports/export')) {
        return new Response(JSON.stringify({ message: 'stack trace: raw database detail' }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }));

    render(<ReportsPage notify={notify} />);
    expect(await screen.findByText(/Belum ada data laporan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Unduh Laporan/i }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith(
      'Laporan belum bisa diunduh. Coba persempit periode atau hubungi admin.',
      'bad'
    ));
  });
});

const waveBClass = { id: 'class-1', code: 'X-1', name: 'X IPA 1' };
const waveBSubject = { id: 'subject-1', code: 'MTK', name: 'Matematika' };
const waveBTeacher = { id: 'teacher-1', fullName: 'Budi Guru', role: 'GURU_MAPEL', active: true };
const waveBRoom = { id: 'room-1', code: 'R-01', name: 'Ruang 01', active: true };
const waveBYear = { id: 'year-1', code: '2026/2027', name: 'Tahun Ajaran 2026/2027', active: true };
const waveBSemester = { id: 'semester-1', academicYearId: 'year-1', code: 'GANJIL', name: 'Semester Ganjil', startsAt: '2026-07-13T00:00:00.000Z', endsAt: '2026-12-20T00:00:00.000Z', active: true, academicYear: waveBYear };
const waveBAssignment = {
  id: 'assignment-1', teacherId: 'teacher-1', subjectId: 'subject-1', classId: 'class-1', academicYearId: 'year-1', semesterId: 'semester-1', effectiveFrom: '2026-07-13T00:00:00.000Z', effectiveTo: '2026-12-20T00:00:00.000Z', active: true,
  teacher: waveBTeacher, subject: waveBSubject, schoolClass: waveBClass, academicYear: waveBYear, semester: waveBSemester, _count: { weeklySchedules: 0, sessions: 0, substitutionSourceSessions: 0 }
};
const waveBLegacyWeekly = { id: 'weekly-legacy-1', classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1', academicYearId: 'year-1', semesterId: 'semester-1', teachingAssignmentId: 'assignment-1', effectiveFrom: '2026-07-13T00:00:00.000Z', effectiveTo: null, active: true, dayOfWeek: 1, startTime: '07:15', endTime: '08:45', schoolClass: waveBClass, subject: waveBSubject, teacher: waveBTeacher, teachingAssignment: waveBAssignment };

function waveBResponse(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

function installWaveBFetch({ assignments = [waveBAssignment], weekly = [waveBLegacyWeekly], assignmentPages, weeklyPages, assignmentMeta, weeklyMeta, selectorPages = {}, selectorMeta = {}, onRequest = () => {} } = {}) {
  const pageResponse = (pages, fallback, meta, url) => {
    const page = Number(new URL(url, 'http://schoolhub.test').searchParams.get('page') || '1');
    const items = pages?.[page] ?? fallback;
    const totalPages = meta?.totalPages ?? (pages ? Math.max(...Object.keys(pages).map(Number)) : 1);
    const total = meta?.total ?? Object.values(pages || { 1: fallback }).flat().length;
    return { items, meta: { page, limit: 200, total, totalPages } };
  };
  const selectorResponse = (key, fallback, url) => pageResponse(selectorPages[key], fallback, selectorMeta[key], url);
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    onRequest({ url, method, body });
    if (url.includes('/auth/csrf')) return waveBResponse({ csrfToken: 'csrf-wave-b' });
    if (url.includes('/academic/classes')) return waveBResponse(selectorResponse('classes', [waveBClass], url));
    if (url.includes('/academic/subjects')) return waveBResponse(selectorResponse('subjects', [waveBSubject], url));
    if (url.includes('/identity/users')) return waveBResponse(selectorResponse('users', [waveBTeacher], url));
    if (url.includes('/academic/rooms')) return waveBResponse(selectorResponse('rooms', [waveBRoom], url));
    if (url.includes('/academic/years')) return waveBResponse(selectorResponse('years', [waveBYear], url));
    if (url.includes('/academic/semesters')) return waveBResponse(selectorResponse('semesters', [waveBSemester], url));
    if (url.includes('/schedules/assignments')) return waveBResponse(method === 'GET' ? pageResponse(assignmentPages, assignments, assignmentMeta, url) : { id: 'assignment-saved' });
    if (url.includes('/schedules/sessions')) return waveBResponse(method === 'GET' ? { items: [] } : { id: 'session-saved' });
    if (url.includes('/schedules/weekly')) return waveBResponse(method === 'GET' ? pageResponse(weeklyPages, weekly, weeklyMeta, url) : { id: 'weekly-saved', generatedCount: 0, skippedCount: 0 });
    return waveBResponse({ items: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function scheduleCard(title) {
  const card = screen.getByText(title).closest('.card');
  if (!card) throw new Error(`Card tidak ditemukan: ${title}`);
  return card;
}

describe('Wave B jadwal kelas', () => {
  it('membuat semester lengkap dan mengubah ISO date menjadi value Jakarta saat edit', async () => {
    const requests = [];
    const jakartaSemester = { ...waveBSemester, startsAt: '2026-06-30T17:00:00.000Z', endsAt: '2026-12-20T00:00:00.000Z' };
    const originalFetch = installWaveBFetch({ onRequest: (request) => requests.push(request) });
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/academic/semesters') && (!init.method || init.method === 'GET')) return waveBResponse({ items: [jakartaSemester] });
      return originalFetch(input, init);
    }));
    window.history.pushState({}, '', '/admin/master-data?tab=semesters');
    render(<MasterDataPage notify={vi.fn()} />);

    const startsAt = await screen.findByLabelText('Mulai Semester');
    const endsAt = screen.getByLabelText('Selesai Semester');
    expect(startsAt).toHaveAttribute('type', 'date');
    expect(endsAt).toHaveAttribute('type', 'date');
    fireEvent.change(screen.getByLabelText('Tahun Ajaran'), { target: { value: 'year-1' } });
    fireEvent.change(screen.getByLabelText('Kode Semester'), { target: { value: 'GENAP' } });
    fireEvent.change(screen.getByLabelText('Nama Semester'), { target: { value: 'Semester Genap' } });
    fireEvent.change(startsAt, { target: { value: '2027-01-04' } });
    fireEvent.change(endsAt, { target: { value: '2027-06-19' } });
    fireEvent.click(screen.getByRole('button', { name: /^Simpan$/i }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/academic/semesters'), method: 'POST', body: { academicYearId: 'year-1', code: 'GENAP', name: 'Semester Genap', startsAt: '2027-01-04', endsAt: '2027-06-19' } })));
    const list = scheduleCard('Daftar Semester');
    fireEvent.click(await within(list).findByRole('button', { name: 'Edit' }));
    expect(await screen.findByLabelText('Mulai Semester')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('Selesai Semester')).toHaveValue('2026-12-20');
  });

  it('mempertahankan literal tanggal semester tanpa konversi zona waktu', async () => {
    const literalSemester = { ...waveBSemester, startsAt: '2026-07-13', endsAt: '2026-12-20' };
    const originalFetch = installWaveBFetch();
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/academic/semesters') && (!init.method || init.method === 'GET')) return waveBResponse({ items: [literalSemester] });
      return originalFetch(input, init);
    }));
    window.history.pushState({}, '', '/admin/master-data?tab=semesters');
    render(<MasterDataPage notify={vi.fn()} />);

    const list = await screen.findByText('Daftar Semester');
    fireEvent.click(within(list.closest('.card')).getByRole('button', { name: 'Edit' }));
    expect(await screen.findByLabelText('Mulai Semester')).toHaveValue('2026-07-13');
    expect(screen.getByLabelText('Selesai Semester')).toHaveValue('2026-12-20');
  });

  it('membuat dan mengedit tahun ajaran dengan batas lengkap serta konversi tanggal Jakarta', async () => {
    const requests = [];
    const jakartaYear = { ...waveBYear, startsAt: '2026-06-30T17:00:00.000Z', endsAt: '2027-06-30T16:59:59.000Z' };
    installWaveBFetch({ selectorPages: { years: { 1: [jakartaYear] } }, onRequest: (request) => requests.push(request) });
    window.history.pushState({}, '', '/admin/master-data?tab=years');
    render(<MasterDataPage notify={vi.fn()} />);

    const startsAt = await screen.findByLabelText('Mulai Tahun Ajaran');
    const endsAt = screen.getByLabelText('Selesai Tahun Ajaran');
    expect(startsAt).toHaveAttribute('type', 'date');
    expect(endsAt).toHaveAttribute('type', 'date');
    fireEvent.change(screen.getByLabelText('Kode'), { target: { value: '2027/2028' } });
    fireEvent.change(screen.getByLabelText('Nama'), { target: { value: 'Tahun Ajaran 2027/2028' } });
    fireEvent.change(startsAt, { target: { value: '2027-07-01' } });
    fireEvent.change(endsAt, { target: { value: '2028-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: /^Simpan$/i }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/academic/years'), method: 'POST', body: { code: '2027/2028', name: 'Tahun Ajaran 2027/2028', startsAt: '2027-07-01', endsAt: '2028-06-30' } })));
    const list = scheduleCard('Daftar Tahun Ajaran');
    fireEvent.click(await within(list).findByRole('button', { name: 'Edit' }));
    expect(await screen.findByLabelText('Mulai Tahun Ajaran')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('Selesai Tahun Ajaran')).toHaveValue('2027-06-30');
    fireEvent.click(screen.getByRole('button', { name: /^Simpan$/i }));
    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/academic/years/year-1'), method: 'PATCH', body: { code: '2026/2027', name: 'Tahun Ajaran 2026/2027', startsAt: '2026-07-01', endsAt: '2027-06-30' } })));
  });

  it('mengirim assignment baru bertipe tepat dan tidak mengirim effectiveTo kosong', async () => {
    const requests = [];
    installWaveBFetch({ assignments: [], weekly: [], onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const assignment = scheduleCard('Penugasan Mengajar');
    await within(assignment).findByLabelText('Guru Pengajar');
    fireEvent.change(within(assignment).getByLabelText('Guru Pengajar'), { target: { value: 'teacher-1' } });
    fireEvent.change(within(assignment).getByLabelText('Bidang Studi'), { target: { value: 'subject-1' } });
    fireEvent.change(within(assignment).getByLabelText('Kelas'), { target: { value: 'class-1' } });
    fireEvent.change(within(assignment).getByLabelText('Tahun Ajaran'), { target: { value: 'year-1' } });
    fireEvent.change(within(assignment).getByLabelText('Semester'), { target: { value: 'semester-1' } });
    fireEvent.change(within(assignment).getByLabelText('Mulai Penugasan'), { target: { value: '2026-07-13' } });
    fireEvent.click(within(assignment).getByLabelText('Penugasan aktif'));
    fireEvent.click(within(assignment).getByRole('button', { name: /Simpan penugasan/i }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/schedules/assignments'), method: 'POST', body: { teacherId: 'teacher-1', subjectId: 'subject-1', classId: 'class-1', academicYearId: 'year-1', semesterId: 'semester-1', effectiveFrom: '2026-07-13', active: false } })));
  });

  it('melindungi provenance assignment terpakai dan hanya menyimpan status aktif', async () => {
    const requests = [];
    const referenced = { ...waveBAssignment, _count: { weeklySchedules: 1, sessions: 1 } };
    installWaveBFetch({ assignments: [referenced], weekly: [], onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const list = scheduleCard('Daftar Penugasan');
    fireEvent.click(await within(list).findByRole('button', { name: 'Edit' }));
    const assignment = scheduleCard('Edit Penugasan Mengajar');
    await within(assignment).findByLabelText('Guru Pengajar');
    ['Guru Pengajar', 'Bidang Studi', 'Kelas', 'Tahun Ajaran', 'Semester', 'Mulai Penugasan', 'Selesai Penugasan'].forEach((label) => expect(within(assignment).getByLabelText(label)).toBeDisabled());
    expect(within(assignment).getByLabelText('Penugasan aktif')).toBeEnabled();
    expect(within(assignment).getByText('Buat assignment baru untuk perubahan tuple/periode, lalu nonaktifkan lama.')).toBeInTheDocument();
    fireEvent.click(within(assignment).getByLabelText('Penugasan aktif'));
    fireEvent.click(within(assignment).getByRole('button', { name: /Simpan perubahan/i }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/schedules/assignments/assignment-1'), method: 'PATCH', body: { teacherId: 'teacher-1', subjectId: 'subject-1', classId: 'class-1', academicYearId: 'year-1', semesterId: 'semester-1', effectiveFrom: '2026-07-13', effectiveTo: '2026-12-20', active: false } })));
  });

  it('melindungi assignment yang hanya dipakai sebagai sumber guru pengganti', async () => {
    const referenced = { ...waveBAssignment, _count: { weeklySchedules: 0, sessions: 0, substitutionSourceSessions: 1 } };
    installWaveBFetch({ assignments: [referenced], weekly: [] });
    render(<SchedulePage notify={vi.fn()} />);
    const list = scheduleCard('Daftar Penugasan');
    fireEvent.click(await within(list).findByRole('button', { name: 'Edit' }));
    const assignment = scheduleCard('Edit Penugasan Mengajar');

    await within(assignment).findByLabelText('Guru Pengajar');
    ['Guru Pengajar', 'Bidang Studi', 'Kelas', 'Tahun Ajaran', 'Semester', 'Mulai Penugasan', 'Selesai Penugasan'].forEach((label) => expect(within(assignment).getByLabelText(label)).toBeDisabled());
    expect(within(assignment).getByLabelText('Penugasan aktif')).toBeEnabled();
  });

  it('membuat sesi langsung dari tuple assignment yang diturunkan', async () => {
    const requests = [];
    installWaveBFetch({ weekly: [], onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const direct = scheduleCard('Buat Sesi Langsung');
    const assignmentField = await within(direct).findByLabelText('Penugasan untuk sesi');
    fireEvent.change(assignmentField, { target: { value: 'assignment-1' } });
    fireEvent.click(within(direct).getByRole('button', { name: /Buat sesi/i }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/schedules/sessions'), method: 'POST', body: { teachingAssignmentId: 'assignment-1', classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1', academicYearId: 'year-1', semesterId: 'semester-1', startsAt: expect.stringMatching(/T07:15$/), endsAt: expect.stringMatching(/T08:45$/) } })));
  });

  it('memuat seluruh pilihan halaman berikutnya dan membentuk payload assignment/jadwal tepat', async () => {
    const requests = [];
    const pageTwoTeacher = { ...waveBTeacher, id: 'teacher-page-2', fullName: 'Guru Halaman Dua' };
    const pageTwoSubject = { ...waveBSubject, id: 'subject-page-2', code: 'KIM', name: 'Kimia Halaman Dua' };
    const pageTwoClass = { ...waveBClass, id: 'class-page-2', code: 'X-2', name: 'X IPA 2' };
    const pageTwoYear = { ...waveBYear, id: 'year-page-2', code: '2027/2028', name: 'Tahun Ajaran 2027/2028' };
    const pageTwoSemester = { ...waveBSemester, id: 'semester-page-2', academicYearId: 'year-page-2', code: 'GENAP', name: 'Semester Halaman Dua', academicYear: pageTwoYear };
    const pageTwoRoom = { ...waveBRoom, id: 'room-page-2', code: 'LAB-2', name: 'Laboratorium 2' };
    const pageTwoAssignment = {
      ...waveBAssignment,
      id: 'assignment-page-2',
      teacherId: pageTwoTeacher.id,
      subjectId: pageTwoSubject.id,
      classId: pageTwoClass.id,
      academicYearId: pageTwoYear.id,
      semesterId: pageTwoSemester.id,
      effectiveFrom: '2027-01-04T00:00:00.000Z',
      effectiveTo: '2027-06-19T00:00:00.000Z',
      teacher: pageTwoTeacher,
      subject: pageTwoSubject,
      schoolClass: pageTwoClass,
      academicYear: pageTwoYear,
      semester: pageTwoSemester
    };
    installWaveBFetch({
      assignments: [pageTwoAssignment],
      weekly: [],
      selectorPages: {
        classes: { 1: [waveBClass], 2: [pageTwoClass] },
        subjects: { 1: [waveBSubject], 2: [pageTwoSubject] },
        users: { 1: [waveBTeacher], 2: [pageTwoTeacher] },
        rooms: { 1: [waveBRoom], 2: [pageTwoRoom] },
        years: { 1: [waveBYear], 2: [pageTwoYear] },
        semesters: { 1: [waveBSemester], 2: [pageTwoSemester] }
      },
      selectorMeta: {
        classes: { total: 400, totalPages: 2 },
        subjects: { total: 400, totalPages: 2 },
        users: { total: 400, totalPages: 2 },
        rooms: { total: 400, totalPages: 2 },
        years: { total: 400, totalPages: 2 },
        semesters: { total: 400, totalPages: 2 }
      },
      onRequest: (request) => requests.push(request)
    });
    render(<SchedulePage notify={vi.fn()} />);
    const assignment = scheduleCard('Penugasan Mengajar');
    await within(assignment).findByRole('option', { name: 'Guru Halaman Dua' });
    expect(within(assignment).getByRole('option', { name: 'Kimia Halaman Dua' })).toBeInTheDocument();
    expect(within(assignment).getByRole('option', { name: /X-2.*X IPA 2/i })).toBeInTheDocument();
    expect(within(assignment).getByRole('option', { name: '2027/2028' })).toBeInTheDocument();
    fireEvent.change(within(assignment).getByLabelText('Guru Pengajar'), { target: { value: 'teacher-page-2' } });
    fireEvent.change(within(assignment).getByLabelText('Bidang Studi'), { target: { value: 'subject-page-2' } });
    fireEvent.change(within(assignment).getByLabelText('Kelas'), { target: { value: 'class-page-2' } });
    fireEvent.change(within(assignment).getByLabelText('Tahun Ajaran'), { target: { value: 'year-page-2' } });
    expect(within(assignment).getByRole('option', { name: 'Semester Halaman Dua' })).toBeInTheDocument();
    fireEvent.change(within(assignment).getByLabelText('Semester'), { target: { value: 'semester-page-2' } });
    fireEvent.change(within(assignment).getByLabelText('Mulai Penugasan'), { target: { value: '2027-01-04' } });
    fireEvent.click(within(assignment).getByRole('button', { name: /Simpan penugasan/i }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/schedules/assignments'), method: 'POST', body: { teacherId: 'teacher-page-2', subjectId: 'subject-page-2', classId: 'class-page-2', academicYearId: 'year-page-2', semesterId: 'semester-page-2', effectiveFrom: '2027-01-04', active: true } })));
    const weekly = scheduleCard('Jadwal Mingguan');
    expect(await within(weekly).findByRole('option', { name: 'LAB-2' })).toBeInTheDocument();
    fireEvent.change(within(weekly).getByLabelText('Penugasan untuk jadwal'), { target: { value: 'assignment-page-2' } });
    fireEvent.change(within(weekly).getByLabelText('Ruang'), { target: { value: 'room-page-2' } });
    fireEvent.click(within(weekly).getByRole('button', { name: /Simpan jadwal/i }));
    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/schedules/weekly'), method: 'POST', body: { teachingAssignmentId: 'assignment-page-2', classId: 'class-page-2', subjectId: 'subject-page-2', teacherId: 'teacher-page-2', academicYearId: 'year-page-2', semesterId: 'semester-page-2', roomId: 'room-page-2', dayOfWeek: 1, startTime: '07:15', endTime: '08:45', effectiveFrom: '2027-01-04', effectiveTo: '2027-06-19' } })));
    ['classes', 'subjects', 'users', 'rooms', 'years', 'semesters'].forEach((path) => expect(requests.filter((request) => request.url.includes(`/${path}?page=2&limit=200`))).toHaveLength(1));
  });

  it('menonaktifkan form penugasan saat metadata pagination selector melewati batas aman', async () => {
    installWaveBFetch({ selectorMeta: { classes: { total: 10200, totalPages: 51 } } });
    render(<SchedulePage notify={vi.fn()} />);
    const assignment = scheduleCard('Penugasan Mengajar');

    expect(await within(assignment).findByRole('alert')).toHaveTextContent('Data jadwal terlalu banyak untuk dimuat sekaligus.');
    expect(within(assignment).getByLabelText('Guru Pengajar')).toBeDisabled();
    expect(within(assignment).getByRole('button', { name: /Simpan penugasan/i })).toBeDisabled();
  });

  it('memuat penugasan halaman berikutnya, mendeduplikasi ID, lalu menurunkan tuple sesi tepat', async () => {
    const requests = [];
    const laterAssignment = { ...waveBAssignment, id: 'assignment-page-2', teacherId: 'teacher-page-2', subjectId: 'subject-page-2', classId: 'class-page-2', academicYearId: 'year-page-2', semesterId: 'semester-page-2', teacher: { ...waveBTeacher, id: 'teacher-page-2', fullName: 'Guru Halaman Dua' }, subject: { ...waveBSubject, id: 'subject-page-2', name: 'Kimia Lanjut' }, schoolClass: { ...waveBClass, id: 'class-page-2', code: 'X-2' }, academicYear: { ...waveBYear, id: 'year-page-2', code: '2027/2028' }, semester: { ...waveBSemester, id: 'semester-page-2', academicYearId: 'year-page-2', name: 'Semester Genap' } };
    installWaveBFetch({
      weekly: [],
      assignmentPages: { 1: [waveBAssignment], 2: [waveBAssignment, laterAssignment] },
      assignmentMeta: { total: 400, totalPages: 2 },
      onRequest: (request) => requests.push(request)
    });
    render(<SchedulePage notify={vi.fn()} />);
    const direct = scheduleCard('Buat Sesi Langsung');
    const assignmentList = scheduleCard('Daftar Penugasan');
    const assignmentField = await within(direct).findByLabelText('Penugasan untuk sesi');
    expect(within(direct).getAllByRole('option', { name: /Budi Guru.*Matematika.*X-1/i })).toHaveLength(1);
    expect(within(assignmentList).getAllByText('Budi Guru')).toHaveLength(1);
    expect(within(direct).getByRole('option', { name: /Guru Halaman Dua.*Kimia Lanjut.*X-2/i })).toBeInTheDocument();
    fireEvent.change(assignmentField, { target: { value: 'assignment-page-2' } });
    fireEvent.click(within(direct).getByRole('button', { name: /Buat sesi/i }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/schedules/sessions'), method: 'POST', body: { teachingAssignmentId: 'assignment-page-2', classId: 'class-page-2', subjectId: 'subject-page-2', teacherId: 'teacher-page-2', academicYearId: 'year-page-2', semesterId: 'semester-page-2', startsAt: expect.stringMatching(/T07:15$/), endsAt: expect.stringMatching(/T08:45$/) } })));
    expect(requests.filter((request) => request.url.includes('/schedules/assignments?page=2&limit=200'))).toHaveLength(1);
  });

  it('memuat jadwal mingguan halaman berikutnya agar jadwal lengkap dapat dibuatkan sesi', async () => {
    const requests = [];
    const completeLaterWeekly = { ...waveBLegacyWeekly, id: 'weekly-page-2', effectiveTo: '2026-12-20T00:00:00.000Z' };
    setRiskConfirmHandler(vi.fn().mockResolvedValue(true));
    installWaveBFetch({
      weeklyPages: { 1: [waveBLegacyWeekly], 2: [completeLaterWeekly] },
      weeklyMeta: { total: 400, totalPages: 2 },
      onRequest: (request) => requests.push(request)
    });
    render(<SchedulePage notify={vi.fn()} />);
    const weeklyList = scheduleCard('Daftar Jadwal Mingguan');
    const generateButton = await within(weeklyList).findByRole('button', { name: /Buat sesi tanggal ini/i });
    fireEvent.click(generateButton);

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/schedules/weekly/weekly-page-2/generate'), method: 'POST', body: expect.any(Object) })));
    expect(requests.filter((request) => request.url.includes('/schedules/weekly?page=2&limit=200'))).toHaveLength(1);
  });

  it('menampilkan kegagalan ramah tanpa meminta halaman berikut saat metadata pagination terlalu besar', async () => {
    const requests = [];
    installWaveBFetch({ assignmentMeta: { total: 10200, totalPages: 51 }, onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const assignmentsList = scheduleCard('Daftar Penugasan');

    expect(await within(assignmentsList).findByRole('alert')).toHaveTextContent('Data jadwal terlalu banyak untuk dimuat sekaligus.');
    expect(requests.filter((request) => request.url.includes('/schedules/assignments?page=1&limit=200'))).toHaveLength(1);
    expect(requests.filter((request) => request.url.includes('/schedules/assignments?page=2&limit=200'))).toHaveLength(0);
  });

  it('menolak sesi di luar masa berlaku tanpa memindahkan tanggal diam-diam', async () => {
    const requests = [];
    installWaveBFetch({ weekly: [], onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const direct = scheduleCard('Buat Sesi Langsung');
    const pageDate = screen.getByLabelText('Tanggal jadwal');
    const assignmentField = await within(direct).findByLabelText('Penugasan untuk sesi');

    fireEvent.change(pageDate, { target: { value: '2026-07-12' } });
    fireEvent.change(assignmentField, { target: { value: 'assignment-1' } });
    expect(within(direct).getByLabelText('Mulai sesi')).toHaveValue('2026-07-12T07:15');
    expect(within(direct).getByLabelText('Selesai sesi')).toHaveValue('2026-07-12T08:45');
    expect(within(direct).getByRole('alert')).toHaveTextContent('Tanggal jadwal di luar masa berlaku penugasan.');
    expect(within(direct).getByRole('button', { name: /Buat sesi/i })).toBeDisabled();
    fireEvent.click(within(direct).getByRole('button', { name: /Buat sesi/i }));
    expect(requests.filter((request) => request.method === 'POST' && request.url.includes('/schedules/sessions'))).toHaveLength(0);

    fireEvent.change(pageDate, { target: { value: '2026-07-14' } });
    expect(within(direct).getByLabelText('Mulai sesi')).toHaveValue('2026-07-14T07:15');
    expect(within(direct).getByLabelText('Selesai sesi')).toHaveValue('2026-07-14T08:45');
    expect(within(direct).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(direct).getByRole('button', { name: /Buat sesi/i })).toBeEnabled();

    fireEvent.change(pageDate, { target: { value: '2026-12-21' } });
    expect(within(direct).getByLabelText('Mulai sesi')).toHaveValue('2026-12-21T07:15');
    expect(within(direct).getByLabelText('Selesai sesi')).toHaveValue('2026-12-21T08:45');
    expect(within(direct).getByRole('alert')).toHaveTextContent('Tanggal jadwal di luar masa berlaku penugasan.');
    expect(within(direct).getByRole('button', { name: /Buat sesi/i })).toBeDisabled();

    fireEvent.change(pageDate, { target: { value: '2026-07-14' } });
    fireEvent.click(within(direct).getByRole('button', { name: /Buat sesi/i }));
    await waitFor(() => expect(requests.filter((request) => request.method === 'POST' && request.url.includes('/schedules/sessions'))).toHaveLength(1));
  });

  it('memblokir sesi manual pada tanggal berbeda dari tanggal jadwal', async () => {
    const requests = [];
    installWaveBFetch({ weekly: [], onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const direct = scheduleCard('Buat Sesi Langsung');
    const assignmentField = await within(direct).findByLabelText('Penugasan untuk sesi');
    fireEvent.change(screen.getByLabelText('Tanggal jadwal'), { target: { value: '2026-07-13' } });
    fireEvent.change(assignmentField, { target: { value: 'assignment-1' } });
    fireEvent.change(within(direct).getByLabelText('Mulai sesi'), { target: { value: '2026-07-14T07:15' } });
    fireEvent.change(within(direct).getByLabelText('Selesai sesi'), { target: { value: '2026-07-14T08:45' } });
    expect(within(direct).getByRole('alert')).toHaveTextContent('Waktu sesi harus sesuai tanggal jadwal.');
    expect(within(direct).getByRole('button', { name: /Buat sesi/i })).toBeDisabled();
    expect(requests.filter((request) => request.method === 'POST' && request.url.includes('/schedules/sessions'))).toHaveLength(0);
  });

  it('mengunci konfirmasi generate secara sinkron saat klik cepat', async () => {
    const requests = [];
    const completeWeekly = { ...waveBLegacyWeekly, effectiveTo: '2026-12-20T00:00:00.000Z' };
    let resolveConfirm;
    const confirmHandler = vi.fn(() => new Promise((resolve) => { resolveConfirm = resolve; }));
    setRiskConfirmHandler(confirmHandler);
    installWaveBFetch({ weekly: [completeWeekly], onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const weeklyList = scheduleCard('Daftar Jadwal Mingguan');
    const generateButton = await within(weeklyList).findByRole('button', { name: /Buat sesi tanggal ini/i });

    fireEvent.click(generateButton);
    fireEvent.click(generateButton);
    expect(confirmHandler).toHaveBeenCalledTimes(1);
    expect(generateButton).toBeDisabled();

    resolveConfirm(true);
    await waitFor(() => expect(requests.filter((request) => request.method === 'POST' && request.url.includes('/generate'))).toHaveLength(1));
  });

  it('tidak generate atau memberi notifikasi saat konfirmasi selesai setelah halaman dilepas', async () => {
    const requests = [];
    const notify = vi.fn();
    const completeWeekly = { ...waveBLegacyWeekly, effectiveTo: '2026-12-20T00:00:00.000Z' };
    let resolveConfirm;
    setRiskConfirmHandler(vi.fn(() => new Promise((resolve) => { resolveConfirm = resolve; })));
    installWaveBFetch({ weekly: [completeWeekly], onRequest: (request) => requests.push(request) });
    const view = render(<SchedulePage notify={notify} />);
    const weeklyList = scheduleCard('Daftar Jadwal Mingguan');

    fireEvent.click(await within(weeklyList).findByRole('button', { name: /Buat sesi tanggal ini/i }));
    view.unmount();
    resolveConfirm(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(requests.filter((request) => request.method === 'POST' && request.url.includes('/generate'))).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('melepas pending generate saat konfirmasi ditolak dan mengizinkan klik berikutnya', async () => {
    const requests = [];
    const completeWeekly = { ...waveBLegacyWeekly, effectiveTo: '2026-12-20T00:00:00.000Z' };
    let rejectFirstConfirm;
    const confirmHandler = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { rejectFirstConfirm = resolve; }))
      .mockResolvedValueOnce(true);
    setRiskConfirmHandler(confirmHandler);
    installWaveBFetch({ weekly: [completeWeekly], onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const weeklyList = scheduleCard('Daftar Jadwal Mingguan');
    const generateButton = await within(weeklyList).findByRole('button', { name: /Buat sesi tanggal ini/i });

    fireEvent.click(generateButton);
    expect(generateButton).toBeDisabled();
    rejectFirstConfirm(false);
    await waitFor(() => expect(generateButton).toBeEnabled());

    fireEvent.click(generateButton);
    await waitFor(() => expect(requests.filter((request) => request.method === 'POST' && request.url.includes('/generate'))).toHaveLength(1));
    expect(confirmHandler).toHaveBeenCalledTimes(2);
  });

  it('membuat jadwal mingguan dari assignment dan mengisi effectiveTo konkret', async () => {
    const requests = [];
    installWaveBFetch({ weekly: [], onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const weekly = scheduleCard('Jadwal Mingguan');
    const assignmentField = await within(weekly).findByLabelText('Penugasan untuk jadwal');
    fireEvent.change(assignmentField, { target: { value: 'assignment-1' } });
    fireEvent.click(within(weekly).getByRole('button', { name: /Simpan jadwal/i }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringContaining('/schedules/weekly'), method: 'POST', body: { teachingAssignmentId: 'assignment-1', classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1', academicYearId: 'year-1', semesterId: 'semester-1', dayOfWeek: 1, startTime: '07:15', endTime: '08:45', effectiveFrom: '2026-07-13', effectiveTo: '2026-12-20' } })));
  });

  it('memblokir generate jadwal legacy tidak lengkap tanpa konfirmasi atau POST', async () => {
    const requests = [];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    installWaveBFetch({ onRequest: (request) => requests.push(request) });
    render(<SchedulePage notify={vi.fn()} />);
    const weeklyList = scheduleCard('Daftar Jadwal Mingguan');
    const blocked = await within(weeklyList).findByRole('button', { name: 'Perlu dilengkapi' });
    expect(blocked).toBeDisabled();
    fireEvent.click(blocked);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(requests.filter((request) => request.method === 'POST' && request.url.includes('/generate'))).toHaveLength(0);
  });
});

describe('session roster provenance and MISSED recovery', () => {
  function setStoredRole(role) {
    const storedUser = JSON.stringify({ id: 'operator-1', role });
    const storage = { getItem: vi.fn((key) => key === 'schoolhub_user' ? storedUser : null), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  }

  function session(id, status, rosterState = 'VERIFIED') {
    return {
      id,
      status,
      startsAt: '2026-07-14T00:30:00.000Z',
      endsAt: '2026-07-14T02:00:00.000Z',
      schoolClass: { code: 'X IPA 1' },
      subject: { name: 'Matematika' },
      teacher: { fullName: 'Guru Test' },
      rosterState
    };
  }

  function mockSessions(rows, recover = async () => ({ message: 'Sesi berhasil dipulihkan.' }), summaryFailure = null) {
    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = String(input);
      const method = String(init.method || 'GET').toUpperCase();
      if (url.includes('/auth/csrf')) return new Response(JSON.stringify({ csrfToken: 'csrf-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && url.includes('/recover')) return new Response(JSON.stringify(await recover()), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/summary')) {
        if (summaryFailure) return new Response(JSON.stringify(summaryFailure), { status: 409, headers: { 'content-type': 'application/json' } });
        const current = rows.find((row) => url.includes(row.id)) || rows[0];
        return new Response(JSON.stringify({ ...current, enrolledCount: current.rosterState === 'LEGACY_ROSTER_MISSING' ? null : 32, recordedCount: 0, counters: { HADIR: 0 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: rows, meta: { page: 1, limit: 100, total: rows.length, totalPages: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('allows ADMIN_TU to recover MISSED once with a valid exact request then refreshes', async () => {
    setStoredRole('ADMIN_TU');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const notify = vi.fn();
    const fetchMock = mockSessions([session('missed-1', 'MISSED')]);

    render(<SessionsPage notify={notify} />);
    fireEvent.click(await screen.findByRole('button', { name: /Detail X IPA 1/i }));
    expect(await screen.findByRole('button', { name: 'Pulihkan sesi' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Alasan pemulihan'), { target: { value: 'Guru sakit dan sesi perlu dipulihkan.' } });
    const recoverButton = screen.getByRole('button', { name: 'Pulihkan sesi' });
    expect(recoverButton).toBeEnabled();
    fireEvent.click(recoverButton);
    fireEvent.click(recoverButton);

    await waitFor(() => expect(fetchMock.mock.calls.filter(([input, init = {}]) => String(input).includes('/recover') && String(init.method).toUpperCase() === 'POST')).toHaveLength(1));
    const recoveryCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/recover'));
    expect(JSON.parse(String(recoveryCall?.[1]?.body))).toEqual({ reason: 'Guru sakit dan sesi perlu dipulihkan.' });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Sesi berhasil dipulihkan.', 'ok'));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/schedules/sessions'))).toHaveLength(2);
  });

  it('keeps recovery available when legacy roster summary fails closed', async () => {
    setStoredRole('ADMIN_TU');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reason = 'Guru sakit dan sesi perlu dipulihkan.';
    const fetchMock = mockSessions(
      [session('missed-legacy', 'MISSED', 'LEGACY_ROSTER_MISSING')],
      async () => ({ message: 'Sesi berhasil dipulihkan.' }),
      { code: 'LEGACY_ROSTER_MISSING', message: 'Roster sesi legacy tidak tersedia.' }
    );

    render(<SessionsPage notify={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Detail X IPA 1/i }));

    expect(await screen.findByText('Roster legacy tidak tersedia')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Terdaftar')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Alasan pemulihan'), { target: { value: reason } });
    fireEvent.click(screen.getByRole('button', { name: 'Pulihkan sesi' }));

    await waitFor(() => expect(fetchMock.mock.calls.filter(([input, init = {}]) => String(input).includes('/recover') && String(init.method).toUpperCase() === 'POST')).toHaveLength(1));
    const recoveryCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/recover'));
    expect(String(recoveryCall?.[0])).toContain('/attendance/class-sessions/missed-legacy/recover');
    expect(JSON.parse(String(recoveryCall?.[1]?.body))).toEqual({ reason });
  });

  it('allows GURU_PIKET recovery on non-admin session endpoint', async () => {
    setStoredRole('GURU_PIKET');
    const fetchMock = mockSessions([session('missed-picket', 'MISSED')]);

    render(<SessionsPage admin={false} notify={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Detail X IPA 1/i }));
    expect(await screen.findByRole('button', { name: 'Pulihkan sesi' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/attendance/class-sessions?'))).toBe(true);
  });

  it('hides recovery from OPERATOR_IT and for non-MISSED sessions', async () => {
    setStoredRole('OPERATOR_IT');
    mockSessions([session('missed-operator', 'MISSED')]);

    render(<SessionsPage notify={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Detail X IPA 1/i }));
    await screen.findByText('Roster terverifikasi');
    expect(screen.queryByRole('button', { name: 'Pulihkan sesi' })).not.toBeInTheDocument();

    cleanup();
    setStoredRole('ADMIN_TU');
    mockSessions([session('closed-1', 'CLOSED')]);
    render(<SessionsPage notify={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Detail X IPA 1/i }));
    await screen.findByText('Roster terverifikasi');
    expect(screen.queryByRole('button', { name: 'Pulihkan sesi' })).not.toBeInTheDocument();
  });

  it('shows every roster provenance label without replacing missing roster with zero students', async () => {
    setStoredRole('ADMIN_TU');
    mockSessions([
      session('verified-1', 'CLOSED', 'VERIFIED'),
      session('backfilled-1', 'CLOSED', 'BACKFILLED_UNVERIFIED'),
      session('legacy-1', 'CLOSED', 'LEGACY_ROSTER_MISSING'),
      session('pending-1', 'SCHEDULED', 'PENDING')
    ]);

    render(<SessionsPage notify={vi.fn()} />);
    expect(await screen.findByText('Roster terverifikasi')).toBeInTheDocument();
    expect(screen.getByText('Roster pemulihan · perlu verifikasi')).toBeInTheDocument();
    expect(screen.getByText('Roster legacy tidak tersedia')).toBeInTheDocument();
    expect(screen.getByText('Roster belum dibentuk')).toBeInTheDocument();
  });
});
