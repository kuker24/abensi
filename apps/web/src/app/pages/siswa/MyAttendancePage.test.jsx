import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MyAttendancePage } from './MyAttendancePage.jsx';

function mockFetch(todayStatus) {
  const fetchMock = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes('/students/me/today-status')) {
      return new Response(JSON.stringify(todayStatus), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/reports/my-attendance')) {
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('MyAttendancePage student today status', () => {
  it('renders pending state and next actions', async () => {
    mockFetch({
      date: '2026-06-20',
      student: { id: 'siswa-1', fullName: 'Aisyah Putri', className: 'X IPA 1' },
      summary: { completedCount: 0, pendingCount: 5, overallStatus: 'PERLU_DILENGKAPI' },
      items: [
        { key: 'GATE_IN', label: 'Scan Datang', status: 'PENDING', time: null, description: 'Scan datang di gerbang.' },
        { key: 'CLASS_ATTENDANCE', label: 'Presensi Kelas', status: 'PENDING', time: null, description: 'Tunggu guru mengisi presensi kelas.' },
        { key: 'PRAYER_DHUHA', label: 'Sholat Dhuha', status: 'PENDING', time: null, description: 'Scan Dhuha di mushola.' },
        { key: 'PRAYER_DZUHUR', label: 'Sholat Dzuhur', status: 'PENDING', time: null, description: 'Scan Dzuhur di mushola.' },
        { key: 'PRAYER_ASHAR', label: 'Sholat Ashar', status: 'NOT_REQUIRED', time: null, description: 'Sholat Ashar tidak wajib hari ini.' },
        { key: 'GATE_OUT', label: 'Scan Pulang', status: 'PENDING', time: null, description: 'Scan pulang sebelum keluar sekolah.' }
      ],
      nextActions: ['Scan datang di gerbang.', 'Ikuti presensi kelas dengan guru.', 'Scan Dzuhur di mushola.', 'Scan pulang sebelum keluar sekolah.']
    });

    render(<MyAttendancePage student />);

    expect(await screen.findByText('Status Kehadiran Hari Ini')).toBeInTheDocument();
    expect(screen.getByText('Lihat bagian yang sudah tercatat dan yang masih perlu dilengkapi hari ini.')).toBeInTheDocument();
    expect(screen.getByText('Scan Datang')).toBeInTheDocument();
    expect(screen.getByText('Presensi Kelas')).toBeInTheDocument();
    expect(screen.getAllByText('Belum tercatat').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('Tidak wajib')).toBeInTheDocument();
    expect(screen.getByText('Ikuti presensi kelas dengan guru.')).toBeInTheDocument();
  });

  it('renders completed state with recorded times', async () => {
    mockFetch({
      date: '2026-06-20',
      student: { id: 'siswa-1', fullName: 'Aisyah Putri', className: 'X IPA 1' },
      summary: { completedCount: 6, pendingCount: 0, overallStatus: 'LENGKAP' },
      items: [
        { key: 'GATE_IN', label: 'Scan Datang', status: 'DONE', time: '07:03', description: 'Kedatangan sudah tercatat.' },
        { key: 'CLASS_ATTENDANCE', label: 'Presensi Kelas', status: 'DONE', time: null, description: 'Presensi kelas sudah tercatat: Hadir 1.' },
        { key: 'PRAYER_DHUHA', label: 'Sholat Dhuha', status: 'DONE', time: '08:00', description: 'Sholat Dhuha sudah tercatat.' },
        { key: 'PRAYER_DZUHUR', label: 'Sholat Dzuhur', status: 'DONE', time: '12:15', description: 'Sholat Dzuhur sudah tercatat.' },
        { key: 'PRAYER_ASHAR', label: 'Sholat Ashar', status: 'DONE', time: '15:20', description: 'Sholat Ashar sudah tercatat.' },
        { key: 'GATE_OUT', label: 'Scan Pulang', status: 'DONE', time: '16:10', description: 'Kepulangan sudah tercatat.' }
      ],
      nextActions: ['Semua bagian wajib hari ini sudah tercatat.']
    });

    render(<MyAttendancePage student />);

    expect((await screen.findAllByText('Lengkap')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sudah tercatat').length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText('Jam 07:03')).toBeInTheDocument();
    expect(screen.getByText('Semua bagian wajib hari ini sudah tercatat.')).toBeInTheDocument();
  });

  it('refresh button reloads today status', async () => {
    const fetchMock = mockFetch({
      date: '2026-06-20',
      student: { id: 'siswa-1', fullName: 'Aisyah Putri', className: 'X IPA 1' },
      summary: { completedCount: 1, pendingCount: 4, overallStatus: 'PERLU_DILENGKAPI' },
      items: [{ key: 'GATE_IN', label: 'Scan Datang', status: 'DONE', time: '07:03', description: 'Kedatangan sudah tercatat.' }],
      nextActions: ['Ikuti presensi kelas dengan guru.']
    });

    render(<MyAttendancePage student />);

    const refresh = await screen.findByRole('button', { name: /Perbarui status/ });
    fireEvent.click(refresh);

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/students/me/today-status')).length).toBeGreaterThanOrEqual(2);
    });
  });
});


describe('MyAttendancePage official self export', () => {
  it('exports only the selected day range and format, not the local status filter', async () => {
    const requests = [];
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:attendance'), revokeObjectURL: vi.fn() });
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes('/reports/export')) {
        return new Response(new Blob(['report']), {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="my_attendance.csv"'
          }
        });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    vi.spyOn(document.createElement('a').constructor.prototype, 'click').mockImplementation(() => {});
    render(<MyAttendancePage employee />);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '30' } });
    fireEvent.change(selects[1], { target: { value: 'csv' } });
    fireEvent.change(selects[2], { target: { value: 'HADIR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download data saya' }));

    await waitFor(() => expect(requests.some((url) => url.includes('/reports/export'))).toBe(true));
    const exportUrl = requests.find((url) => url.includes('/reports/export'));
    expect(exportUrl).toContain('reportType=my_attendance');
    expect(exportUrl).toContain('format=csv');
    expect(exportUrl).toContain('days=30');
    expect(exportUrl).not.toContain('status=');
  });
});
