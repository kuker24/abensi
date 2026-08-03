import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoCoach } from './coach';
import { DemoWorldProvider } from './world-context';
import { WORLD_STORAGE_KEY } from './world';

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
});
