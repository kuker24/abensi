import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassInputPage } from './GuruPages.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
