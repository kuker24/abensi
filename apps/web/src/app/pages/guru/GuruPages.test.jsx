import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassInputPage, TeacherDashboard } from './GuruPages.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('guru teacher today workspace', () => {
  function mockTeacherToday(data) {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/teacher/today')) {
        return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('renders empty state when teacher has no schedule today', async () => {
    mockTeacherToday({
      date: '2026-06-20',
      summary: { sessionsToday: 0, scheduled: 0, open: 0, closed: 0, missed: 0, unclosed: 0, studentsPendingAttendance: 0 },
      items: []
    });

    render(<TeacherDashboard />);

    expect(await screen.findByText('Kelas Saya Hari Ini')).toBeInTheDocument();
    expect(screen.getByText('Tidak ada jadwal mengajar hari ini.')).toBeInTheDocument();
    expect(screen.getByText('Jadwal akan tampil otomatis sesuai data yang diatur admin.')).toBeInTheDocument();
  });

  it('renders scheduled, open, and closed sessions with state-based quick actions', async () => {
    mockTeacherToday({
      date: '2026-06-20',
      summary: { sessionsToday: 3, scheduled: 1, open: 1, closed: 1, missed: 0, unclosed: 1, studentsPendingAttendance: 12 },
      items: [
        { sessionId: 'session-scheduled', className: 'X IPA 1', subjectName: 'Matematika', startTime: '07:30', endTime: '09:00', status: 'SCHEDULED', attendanceFilledCount: 0, studentTotal: 32, pendingCount: 32, actions: { canStart: true, canContinue: false, canClose: false, canViewRecap: false } },
        { sessionId: 'session-open', className: 'XI IPS 2', subjectName: 'Sejarah', startTime: '09:15', endTime: '10:45', status: 'OPEN', attendanceFilledCount: 24, studentTotal: 32, pendingCount: 8, actions: { canStart: false, canContinue: true, canClose: true, canViewRecap: true } },
        { sessionId: 'session-closed', className: 'XII Agama', subjectName: 'Fiqih', startTime: '11:00', endTime: '12:30', status: 'CLOSED', attendanceFilledCount: 30, studentTotal: 30, pendingCount: 0, actions: { canStart: false, canContinue: false, canClose: false, canViewRecap: true } }
      ]
    });

    render(<TeacherDashboard />);

    expect(await screen.findByText('X IPA 1 · Matematika')).toBeInTheDocument();
    expect(screen.getByText('XI IPS 2 · Sejarah')).toBeInTheDocument();
    expect(screen.getByText('XII Agama · Fiqih')).toBeInTheDocument();
    expect(screen.getAllByText('Belum mulai').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sedang berjalan').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sudah ditutup').length).toBeGreaterThan(0);
    expect(screen.getByText('Sesi ini belum ditutup.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Mulai Presensi/ })).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: /Lanjutkan Presensi/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tutup Sesi/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Lihat Rekap/ })).toHaveLength(2);
  });
});

describe('guru class attendance warning-only scan status', () => {
  it('does not disable HADIR/TELAT and still allows Semua Hadir when scan requirements are missing', async () => {
    const notify = vi.fn();
    const session = {
      id: 'session-1',
      startsAt: '2026-06-19T00:15:00.000Z',
      endsAt: '2099-06-19T01:45:00.000Z',
      status: 'OPEN',
      schoolClass: { id: 'class-1', code: 'X-A', name: 'X-A' },
      subject: { id: 'sub-1', name: 'Matematika' },
      teacher: { id: 'guru-1', fullName: 'Guru E2E' },
      teacherPresence: { status: 'HADIR', checkInAt: '2026-06-19T00:10:00.000Z', checkOutAt: null }
    };
    const roster = [
      {
        studentId: 's1',
        fullName: 'Alya Putri',
        username: '24001',
        cardStatus: 'ACTIVE',
        status: 'ALPA',
        reviewState: 'DEFAULTED',
        eligibility: {
          allowed: true,
          locked: true,
          warning: true,
          reasons: ['Belum scan gerbang masuk', 'Belum scan Dhuha'],
          requirements: { gateIn: false, dhuha: false, dzuhur: true, override: false }
        }
      },
      {
        studentId: 's2',
        fullName: 'Rafa Maulana',
        username: '24002',
        cardStatus: 'ACTIVE',
        status: 'ALPA',
        reviewState: 'DEFAULTED',
        eligibility: {
          allowed: true,
          locked: false,
          warning: false,
          reasons: [],
          requirements: { gateIn: true, dhuha: true, dzuhur: true, override: false }
        }
      }
    ];

    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = String(input);
      const method = String(init.method || 'GET').toUpperCase();
      if (url.includes('/auth/csrf')) {
        return new Response(JSON.stringify({ csrfToken: 'csrf-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (method === 'GET' && url.endsWith('/roster')) {
        return new Response(JSON.stringify({ session, roster }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (method === 'GET' && url.includes('/attendance/class-sessions')) {
        return new Response(JSON.stringify({ items: [session], meta: { page: 1, limit: 100, total: 1, totalPages: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (method === 'POST' && url.endsWith('/attendance/bulk-present')) {
        return new Response(JSON.stringify({ updated: roster.length, rejectedCount: 0, warningCount: 1, message: 'Semua hadir tersimpan dengan catatan scan.' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ClassInputPage notify={notify} />);

    const alyaRow = (await screen.findByText('Alya Putri')).closest('.roster-row');
    expect(alyaRow).toBeTruthy();
    expect(within(alyaRow).getByText('Belum scan datang')).toBeInTheDocument();
    expect(within(alyaRow).getByText('Belum scan sholat')).toBeInTheDocument();
    expect(within(alyaRow).queryByText(/Terkunci|BELUM_SCAN|DEFAULTED/)).not.toBeInTheDocument();

    const hadirButton = within(alyaRow).getByRole('button', { name: 'Hadir' });
    const telatButton = within(alyaRow).getByRole('button', { name: 'Terlambat' });
    expect(hadirButton).not.toBeDisabled();
    expect(telatButton).not.toBeDisabled();

    fireEvent.click(telatButton);
    expect(within(alyaRow).getByRole('button', { name: 'Terlambat' })).toHaveClass('on');

    fireEvent.click(screen.getByRole('button', { name: /Semua Hadir/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/attendance/class-sessions/session-1/attendance/bulk-present'),
      expect.objectContaining({ method: 'POST' })
    ));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Semua hadir tersimpan dengan catatan scan.'));
  });
});
