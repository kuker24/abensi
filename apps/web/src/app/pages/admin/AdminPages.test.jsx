import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevicesPage, ReportsPage, REPORT_FORMAT_OPTIONS, buildOfficialReportExportPath, formatReportPeriod } from './AdminPages.jsx';

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
