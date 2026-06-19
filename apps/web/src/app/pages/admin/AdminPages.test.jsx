import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevicesPage, ReportsPage, StudentDailyCompletenessPage, REPORT_FORMAT_OPTIONS, buildOfficialReportExportPath, formatReportPeriod } from './AdminPages.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('HP Scanner Android operator UI', () => {
  it('shows safe secret copy and does not offer Aktifkan lagi for pending unprovisioned readers', async () => {
    const notify = vi.fn();
    const readers = [
      { id: 'pending-1', type: 'QR_ANDROID', status: 'INACTIVE', deviceId: null, name: 'HP Gerbang Pending', locationName: 'Gerbang', allowedModes: ['GATE_IN', 'GATE_OUT'] },
      { id: 'active-1', type: 'QR_ANDROID', status: 'ACTIVE', deviceId: 'android-active', name: 'HP Gerbang Aktif', locationName: 'Gerbang', allowedModes: ['GATE_IN', 'GATE_OUT'] },
      { id: 'inactive-1', type: 'QR_ANDROID', status: 'INACTIVE', deviceId: 'android-inactive', name: 'HP Mushola Nonaktif', locationName: 'Mushola', allowedModes: ['MUSHOLA'] }
    ];
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/auth/csrf')) return new Response(JSON.stringify({ csrfToken: 'csrf-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/device-readers')) return new Response(JSON.stringify({ items: readers, meta: { page: 1, limit: 200, total: readers.length, totalPages: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    render(<DevicesPage notify={notify} />);

    expect(await screen.findByText('Kunci rahasia tidak ditampilkan di web; setelah aktivasi disimpan aman di HP.')).toBeInTheDocument();
    const pendingRow = screen.getByText('HP Gerbang Pending').closest('tr');
    const activeRow = screen.getByText('HP Gerbang Aktif').closest('tr');
    const inactiveRow = screen.getByText('HP Mushola Nonaktif').closest('tr');

    expect(within(pendingRow).getByText('Menunggu aktivasi HP')).toBeInTheDocument();
    expect(within(pendingRow).queryByRole('button', { name: 'Aktifkan lagi' })).not.toBeInTheDocument();
    expect(within(pendingRow).getByRole('button', { name: 'Buat kode baru' })).toBeInTheDocument();
    expect(within(pendingRow).getByRole('button', { name: 'Cabut' })).toBeInTheDocument();
    expect(within(activeRow).getByRole('button', { name: 'Nonaktifkan' })).toBeInTheDocument();
    expect(within(inactiveRow).getByRole('button', { name: 'Aktifkan lagi' })).toBeInTheDocument();
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
            { studentId: 'siswa-2', fullName: 'Budi Santoso', username: 'siswa.budi', schoolClass: 'X-A', gateArrivalAt: '2026-06-19T00:05:00.000Z', gateDepartureAt: '2026-06-19T08:00:00.000Z', classAttendanceLabel: '1/1 hadir', prayerAttendanceLabel: '2/2 sholat tercatat', finalStatus: 'HADIR_LENGKAP', note: 'Hadir lengkap' }
          ],
          meta: { page: 1, limit: 200, total: 2, totalPages: 1 }
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
    expect(screen.queryByText('BELUM_SCAN_PULANG')).not.toBeInTheDocument();
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
