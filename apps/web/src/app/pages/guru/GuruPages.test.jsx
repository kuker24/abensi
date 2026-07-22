import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassInputPage, TeacherDashboard, TeacherRecapPage } from './GuruPages.jsx';

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

  it('renders roster provenance without fabricating zero totals', async () => {
    mockTeacherToday({
      date: '2026-06-20',
      summary: { sessionsToday: 2, scheduled: 0, open: 0, closed: 1, missed: 1, unclosed: 0, studentsPendingAttendance: 0, unknownRosterSessions: 1, backfilledRosterSessions: 1 },
      items: [
        { sessionId: 'session-unknown', className: 'X IPA 1', subjectName: 'Matematika', startTime: '07:30', endTime: '09:00', status: 'MISSED', attendanceFilledCount: 0, studentTotal: null, pendingCount: null, rosterState: 'LEGACY_ROSTER_MISSING', actions: {} },
        { sessionId: 'session-backfilled', className: 'XI IPS 2', subjectName: 'Sejarah', startTime: '09:15', endTime: '10:45', status: 'CLOSED', attendanceFilledCount: 20, studentTotal: 32, pendingCount: 12, rosterState: 'BACKFILLED_UNVERIFIED', actions: {} }
      ]
    });

    render(<TeacherDashboard />);

    expect(await screen.findByText('Jumlah roster belum terverifikasi')).toBeInTheDocument();
    expect(screen.getAllByText('Roster hasil pemulihan/perbaikan; data historis tidak sepenuhnya terverifikasi.')).not.toHaveLength(0);
    expect(screen.queryByText('0/0 siswa')).not.toBeInTheDocument();
    expect(screen.getByText('20/32 siswa')).toBeInTheDocument();
    expect(screen.getByText('Jumlah roster belum terverifikasi pada 1 sesi.')).toBeInTheDocument();
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
  it('keeps HADIR/TELAT available and requires dirty edits to be saved before Semua Hadir', async () => {
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
      if (method === 'GET' && url.endsWith('/journal')) {
        return new Response(JSON.stringify({ sessionId: session.id, subject: { id: 'sub-1', code: 'MAT', name: 'Matematika' }, scheduledDurationMinutes: 90, journal: null }), { status: 200, headers: { 'content-type': 'application/json' } });
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

    expect(screen.getByRole('button', { name: /Semua Hadir/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Simpan Presensi/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/attendance/class-sessions/session-1/attendance'),
      expect.objectContaining({ method: 'PUT' })
    ));
    await waitFor(() => expect(screen.getByRole('button', { name: /Semua Hadir/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Semua Hadir/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/attendance/class-sessions/session-1/attendance/bulk-present'),
      expect.objectContaining({ method: 'POST' })
    ));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Semua hadir tersimpan dengan catatan scan.'));
  });
});

describe('guru session journal workspace', () => {
  const openSession = {
    id: 'session-open', startsAt: '2026-06-19T00:15:00.000Z', endsAt: '2026-06-19T01:45:00.000Z', status: 'OPEN',
    schoolClass: { id: 'class-1', code: 'X-A', name: 'X-A' }, subject: { id: 'sub-1', code: 'MAT', name: 'Matematika' }
  };
  const roster = [{ studentId: 's1', fullName: 'Alya Putri', username: '24001', cardStatus: 'ACTIVE', status: 'HADIR', reviewState: 'CONFIRMED', updatedAt: '2026-06-19T00:30:00.000Z' }];
  const journal = { id: 'journal-1', learningObjective: 'Memahami persamaan linear', activity: 'Diskusi dan latihan soal', lessonHours: 2, completionStatus: 'TUNTAS', createdAt: '2026-06-19T00:40:00.000Z', updatedAt: '2026-06-19T00:40:00.000Z' };

  function response(data) {
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  function mockWorkspace(session = openSession, savedJournal = journal) {
    const requests = [];
    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = String(input);
      const method = String(init.method || 'GET').toUpperCase();
      requests.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('/auth/csrf')) return response({ csrfToken: 'csrf-test' });
      if (method === 'GET' && url.endsWith('/roster')) return response({ session, roster });
      if (method === 'GET' && url.endsWith('/journal')) return response({ sessionId: session.id, subject: session.subject, scheduledDurationMinutes: 90, journal: savedJournal });
      if (method === 'GET' && url.includes('/attendance/class-sessions')) return response({ items: [session] });
      if (method === 'PUT' && url.endsWith('/journal')) return response({ ...(savedJournal || {}), id: savedJournal?.id || 'journal-new', ...JSON.parse(String(init.body)), updatedAt: '2026-06-19T01:00:00.000Z' });
      if (method === 'POST' && url.endsWith('/close')) return response({ status: 'CLOSED' });
      return response({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, requests };
  }

  it('loads the authoritative journal, saves its version, then saves dirty changes before close', async () => {
    window.history.replaceState({}, '', '/guru/presensi?sessionId=session-open');
    const { requests } = mockWorkspace();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success) => success({ coords: { latitude: 0.5, longitude: 101.2, accuracy: 4 }, timestamp: Date.now() }) } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const notify = vi.fn();

    render(<ClassInputPage notify={notify} />);

    expect(await screen.findByDisplayValue('MAT · Matematika')).toHaveAttribute('readonly');
    expect(await screen.findByDisplayValue(journal.learningObjective)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tujuan pembelajaran'), { target: { value: 'Menyelesaikan persamaan linear' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan Jurnal/ }));

    await waitFor(() => expect(requests.find((request) => request.method === 'PUT' && request.url.endsWith('/journal'))?.body).toEqual({
      learningObjective: 'Menyelesaikan persamaan linear', activity: journal.activity, lessonHours: 2, completionStatus: 'TUNTAS', updatedAt: journal.updatedAt
    }));

    fireEvent.change(screen.getByLabelText('Kegiatan'), { target: { value: 'Diskusi, latihan, dan refleksi' } });
    fireEvent.click(screen.getByRole('button', { name: /Simpan & Tutup Sesi/ }));

    await waitFor(() => expect(requests.some((request) => request.method === 'POST' && request.url.endsWith('/close'))).toBe(true));
    const journalWrites = requests.map((request, index) => ({ ...request, index })).filter((request) => request.method === 'PUT' && request.url.endsWith('/journal'));
    const closeRequest = requests.map((request, index) => ({ ...request, index })).find((request) => request.method === 'POST' && request.url.endsWith('/close'));
    expect(journalWrites).toHaveLength(2);
    expect(journalWrites[1].body.updatedAt).toBe('2026-06-19T01:00:00.000Z');
    expect(journalWrites[1].index).toBeLessThan(closeRequest.index);
  });

  it('shows a closed journal read-only', async () => {
    window.history.replaceState({}, '', '/guru/presensi?sessionId=session-closed');
    mockWorkspace({ ...openSession, id: 'session-closed', status: 'CLOSED' });
    render(<ClassInputPage notify={vi.fn()} />);

    expect(await screen.findByLabelText('Tujuan pembelajaran')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Kegiatan')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Status ketuntasan')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Simpan Jurnal|Simpan & Tutup Sesi/ })).not.toBeInTheDocument();
  });

  it('saves dirty attendance before closing the session', async () => {
    window.history.replaceState({}, '', '/guru/presensi?sessionId=session-open');
    const { requests } = mockWorkspace();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success) => success({ coords: { latitude: 0.5, longitude: 101.2, accuracy: 4 }, timestamp: Date.now() }) } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ClassInputPage notify={vi.fn()} />);

    const studentRow = (await screen.findByText('Alya Putri')).closest('.roster-row');
    fireEvent.click(within(studentRow).getByRole('button', { name: 'Alpa' }));
    expect(screen.getByRole('button', { name: /Semua Hadir/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Tandai Alpa/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Simpan & Tutup Sesi/ }));

    await waitFor(() => expect(requests.some((request) => request.method === 'POST' && request.url.endsWith('/close'))).toBe(true));
    const attendanceWrite = requests.findIndex((request) => request.method === 'PUT' && request.url.endsWith('/attendance'));
    const closeRequest = requests.findIndex((request) => request.method === 'POST' && request.url.endsWith('/close'));
    expect(attendanceWrite).toBeGreaterThan(-1);
    expect(requests[attendanceWrite].body.items[0]).toEqual(expect.objectContaining({ studentId: 's1', status: 'ALPA', confirm: true }));
    expect(attendanceWrite).toBeLessThan(closeRequest);
  });

  it('falls back from an invalid query session to the first available session', async () => {
    window.history.replaceState({}, '', '/guru/presensi?sessionId=missing-session');
    const { requests } = mockWorkspace();
    render(<ClassInputPage notify={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Pilih sesi')).toHaveValue('session-open'));
    expect(await screen.findByDisplayValue('MAT · Matematika')).toBeInTheDocument();
    expect(requests.some((request) => request.url.includes('missing-session/roster') || request.url.includes('missing-session/journal'))).toBe(false);
  });
});

describe('guru self-scoped recap', () => {
  it('queries selected month without teacherId and renders the class recap', async () => {
    const requests = [];
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      requests.push(url);
      return new Response(JSON.stringify({ items: [{ classId: 'class-1', classCode: 'X-A', className: 'X A', sessionCount: 4, closedSessions: 3, attendanceCoveragePercent: 75, counters: { HADIR: 90, ALPA: 2 } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    render(<TeacherRecapPage />);

    expect(await screen.findByText('X-A · X A')).toBeInTheDocument();
    const reportUrl = requests.find((url) => url.includes('/reports/recap/classes'));
    expect(reportUrl).toContain('from=');
    expect(reportUrl).toContain('to=');
    expect(reportUrl).not.toContain('teacherId');
  });
});
