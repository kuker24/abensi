import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoCoach } from './coach';
import { coachStepsForRole } from './copy';
import { DemoWorldProvider, useDemoWorld } from './world-context';
import { WORLD_STORAGE_KEY } from './world';
import { ImpactPanel } from './impact-panel';

const speak = vi.fn();
const cancel = vi.fn();
const addEventListener = vi.fn();
const removeEventListener = vi.fn();
let voices: Array<{ lang: string; name: string }> = [];

class MockSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

function renderCoach(role: 'admin-tu' | 'guru' | 'siswa' = 'admin-tu') {
  return render(
    <DemoWorldProvider>
      <DemoCoach role={role} presentMode forceOpenKey={1} />
    </DemoWorldProvider>
  );
}

function ImpactHost() {
  const { lastEvent, clearLastEvent } = useDemoWorld();
  if (!lastEvent) return null;
  return <ImpactPanel event={lastEvent} onClose={clearLastEvent} />;
}

function CoachWithImpact(role: 'admin-tu' | 'guru' = 'admin-tu') {
  return (
    <DemoWorldProvider>
      <DemoCoach role={role} presentMode forceOpenKey={1} />
      <ImpactHost />
      <ApproveHarness />
    </DemoWorldProvider>
  );
}

function ApproveHarness() {
  const { dispatch } = useDemoWorld();
  return (
    <button type="button" data-demo="approve-leave" onClick={() => dispatch({ type: 'APPROVE_LEAVE', actorRole: 'admin-tu' })}>
      Setujui izin harness
    </button>
  );
}

describe('DemoCoach', () => {
  beforeEach(() => {
    window.localStorage.clear();
    speak.mockClear();
    cancel.mockClear();
    addEventListener.mockClear();
    removeEventListener.mockClear();
    voices = [{ lang: 'id-ID', name: 'Bahasa Indonesia' }];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel, addEventListener, removeEventListener, getVoices: () => voices }
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance
    });
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance
    });
  });

  afterEach(() => cleanup());

  it('membuka misi Admin dan membacakan naskah Bahasa Indonesia', async () => {
    renderCoach('admin-tu');
    expect(await screen.findByRole('dialog', { name: 'Tutorial lab' })).toBeInTheDocument();
    expect(screen.getByText(/Misi Admin \/ TU/i)).toBeInTheDocument();
    await waitFor(() => expect(speak).toHaveBeenCalled());
    const utterance = speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(utterance.lang).toBe('id-ID');
    expect(utterance.text.toLowerCase()).toContain('admin');
  });

  it('mematikan suara dan menyimpan preferensi lab', async () => {
    renderCoach('siswa');
    expect(await screen.findByRole('dialog', { name: 'Tutorial lab' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Matikan suara' }));
    expect(screen.getByRole('button', { name: 'Nyalakan suara' })).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem('lab-belajar-voice-pref')).toBe('off');
    expect(cancel).toHaveBeenCalled();
  });

  it('menampilkan status menunggu aksi pada langkah wajib', async () => {
    renderCoach('admin-tu');
    expect(await screen.findByRole('dialog', { name: 'Tutorial lab' })).toBeInTheDocument();

    // Skip to the approve step (index 3)
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Lanjut|Lewati/i }));
    }

    expect(await screen.findByRole('heading', { name: /Setujui izin \(aksi wajib\)/i })).toBeInTheDocument();
    expect(screen.getByText(/Menunggu aksi wajib/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lewati/i })).toBeInTheDocument();
  });

  it('tidak memakai storage dunia production', () => {
    renderCoach('guru');
    expect(WORLD_STORAGE_KEY).toBe('lab-belajar-world-v1');
  });

  it('klik Lanjut cepat tidak melebihi N/N pada pill langkah', async () => {
    renderCoach('siswa');
    expect(await screen.findByRole('dialog', { name: 'Tutorial lab' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Matikan suara' }));
    fireEvent.click(screen.getByRole('button', { name: /Jeda|Auto/i }));

    const total = coachStepsForRole('siswa').length;
    for (let i = 0; i < total + 8; i += 1) {
      const next = screen.queryByRole('button', { name: /Lanjut|Lewati/i });
      const finish = screen.queryByRole('button', { name: /Selesai/i });
      if (finish && !next) {
        fireEvent.click(finish);
        break;
      }
      if (next) fireEvent.click(next);
      else break;
    }

    const pill = screen.queryByTestId('coach-step-pill') || document.querySelector('[data-demo="coach-step-pill"]');
    if (pill) {
      const [cur, max] = (pill.textContent || '').split('/').map((part) => Number(part.trim()));
      expect(cur).toBeLessThanOrEqual(max);
      expect(max).toBe(total);
    } else {
      // Coach closed after Selesai — reopen should start at 1/N, not overflow residue.
      fireEvent.click(await screen.findByRole('button', { name: /Mulai tutorial/i }));
      const reopened = await screen.findByText(new RegExp(`1/${total}`));
      expect(reopened).toBeInTheDocument();
    }
  });

  it('setelah aksi wajib terpenuhi tidak auto-maju meski Auto aktif', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <DemoWorldProvider>
        <DemoCoach role="admin-tu" presentMode forceOpenKey={1} />
        <ApproveHarness />
      </DemoWorldProvider>
    );

    expect(await screen.findByRole('dialog', { name: 'Tutorial lab' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Matikan suara' }));
    // Ensure Auto remains on (default). Pause then re-enable if needed.
    const jeda = screen.queryByRole('button', { name: /Jeda/i });
    if (!jeda) {
      fireEvent.click(screen.getByRole('button', { name: /Auto/i }));
    }

    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Lanjut|Lewati/i }));
    }

    expect(await screen.findByRole('heading', { name: /Setujui izin \(aksi wajib\)/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Setujui izin harness/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Menunggu aksi wajib/i)).not.toBeInTheDocument();
    });

    // Advance timers past former 600ms auto-jump; title must remain the wait step.
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByRole('heading', { name: /Setujui izin \(aksi wajib\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lanjut/i })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('Lanjut menutup panel dampak keputusan', async () => {
    render(CoachWithImpact('admin-tu'));
    expect(await screen.findByRole('dialog', { name: 'Tutorial lab' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Matikan suara' }));
    fireEvent.click(screen.getByRole('button', { name: /Jeda/i }));

    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Lanjut|Lewati/i }));
    }

    fireEvent.click(screen.getByRole('button', { name: /Setujui izin harness/i }));
    expect(await screen.findByRole('dialog', { name: 'Dampak keputusan' })).toBeInTheDocument();

    const coachDialog = screen.getByRole('dialog', { name: 'Tutorial lab' });
    fireEvent.click(within(coachDialog).getByRole('button', { name: /^Lanjut/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Dampak keputusan' })).not.toBeInTheDocument();
    });
  });
});
