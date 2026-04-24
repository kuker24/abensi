import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import type { SessionItem } from '../types/domain';
import type { CheckInDraftState, MockSessionState } from '../types/experience';
import { defaultCheckInDraftState, defaultMockSessionState } from '../lib/experienceState';
import * as experienceState from '../lib/experienceState';
import { StudentCheckInPage } from './StudentCheckInPage';

vi.mock('../lib/api', () => ({
  listClassSessions: vi.fn()
}));

import { listClassSessions } from '../lib/api';

const mockedListClassSessions = vi.mocked(listClassSessions);

const sessionsFixture: SessionItem[] = [
  {
    id: 'session-a',
    startsAt: '2026-04-24T01:30:00.000Z',
    endsAt: '2026-04-24T03:00:00.000Z',
    status: 'OPEN',
    schoolClass: { id: 'class-a', code: 'X-A', name: 'Kelas X-A', yearLabel: '2025/2026' },
    subject: { id: 'subject-math', code: 'MAT', name: 'Matematika' },
    teacher: {
      id: 'teacher-a',
      username: 'guru.math',
      fullName: 'Bu Siti Rahma',
      role: 'GURU_MAPEL'
    }
  }
];

function TestHarness() {
  const [draft, setDraft] = useState<CheckInDraftState>({ ...defaultCheckInDraftState });
  const [mockState, setMockState] = useState<MockSessionState>({ ...defaultMockSessionState });

  return (
    <MemoryRouter>
      <ToastProvider>
        <StudentCheckInPage draft={draft} setDraft={setDraft} setMockState={setMockState} />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('StudentCheckInPage', () => {
  beforeEach(() => {
    mockedListClassSessions.mockResolvedValue(sessionsFixture);
    vi.spyOn(experienceState, 'simulateAsyncTransition').mockResolvedValue(undefined);
  });

  it('enforces validation and finishes multi-step check-in flow', async () => {
    const user = userEvent.setup();
    render(<TestHarness />);

    await screen.findByText('Alur Absen Masuk Siswa');
    await screen.findByText('Matematika');

    await user.click(screen.getByRole('button', { name: /lanjut/i }));
    await screen.findByLabelText('Nama Siswa');
    await user.click(screen.getByRole('button', { name: /lanjut/i }));

    expect(await screen.findByText('Nama minimal 3 karakter.')).toBeInTheDocument();
    expect(screen.getByText('NIS minimal 4 digit angka.')).toBeInTheDocument();
    expect(screen.getByText('Pilih status kehadiran.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nama Siswa'), 'Alya Putri');
    await user.type(screen.getByLabelText('NIS'), '24018');
    await user.selectOptions(screen.getByLabelText('Status'), 'HADIR');
    expect(screen.getByLabelText('Status')).toHaveValue('HADIR');
    await user.click(screen.getByRole('button', { name: /lanjut/i }));

    const checkboxes = await screen.findAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);
    await user.click(screen.getByRole('button', { name: /lanjut/i }));

    await user.click(screen.getByRole('button', { name: /kirim absen masuk/i }));
    expect(await screen.findByText('Absen Masuk Berhasil')).toBeInTheDocument();
    expect(screen.getByText(/kode bukti:/i)).toBeInTheDocument();
  });
});
