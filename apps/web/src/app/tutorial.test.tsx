import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';
import { OnboardingTour } from './tutorial';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
  go: vi.fn()
}));

const speak = vi.fn();
const cancel = vi.fn();
const addEventListener = vi.fn();
const removeEventListener = vi.fn();
let voices: Array<{ lang: string; name: string }> = [];
let voicesChanged: (() => void) | undefined;

class MockSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('OnboardingTour', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue({ shouldShow: false, version: '2026.07.24' });
    window.localStorage.clear();
    speak.mockClear();
    cancel.mockClear();
    addEventListener.mockClear();
    removeEventListener.mockClear();
    voices = [{ lang: 'id-ID', name: 'Bahasa Indonesia' }];
    voicesChanged = undefined;
    addEventListener.mockImplementation((event, listener) => {
      if (event === 'voiceschanged') voicesChanged = listener as () => void;
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak, cancel, addEventListener, removeEventListener, getVoices: () => voices }
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: MockSpeechSynthesisUtterance });
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: MockSpeechSynthesisUtterance });
  });

  afterEach(() => cleanup());

  it('menyorot kontrol SIAB2 asli dan membacakan panduan Guru Mapel dalam Bahasa Indonesia', async () => {
    const target = document.createElement('div');
    target.dataset.tour = 'system-status';
    target.getBoundingClientRect = () => ({ top: 24, right: 440, bottom: 72, left: 280, width: 160, height: 48, x: 280, y: 24, toJSON: () => ({}) });
    document.body.appendChild(target);

    render(<OnboardingTour user={{ id: 'guru-1', role: 'GURU_MAPEL' }} manualOpenKey={1} />);
    expect(await screen.findByRole('dialog', { name: 'Tutorial awal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut/ }));

    expect(await screen.findByText('Pastikan akun dan sistem aktif')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.tour-spotlight')).toHaveStyle({ top: '17px', left: '273px' }));
    await waitFor(() => expect(speak).toHaveBeenCalled());
    const utterance = speak.mock.calls[speak.mock.calls.length - 1]?.[0] as MockSpeechSynthesisUtterance;
    expect(utterance.lang).toBe('id-ID');
    expect(utterance.text).toContain('Guru Mapel Sedang Aktif');

    target.remove();
  });

  it('menyorot ringkasan dashboard Admin TU dan memakai versi tutorial terbaru', async () => {
    const target = document.createElement('div');
    target.dataset.tour = 'admin-summary';
    target.getBoundingClientRect = () => ({ top: 120, right: 720, bottom: 280, left: 320, width: 400, height: 160, x: 320, y: 120, toJSON: () => ({}) });
    document.body.appendChild(target);

    render(<OnboardingTour user={{ id: 'admin-1', role: 'ADMIN_TU' }} manualOpenKey={1} />);
    expect(await screen.findByRole('dialog', { name: 'Tutorial awal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut/ }));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut/ }));

    expect(await screen.findByText('Baca ringkasan operasional')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.tour-spotlight')).toHaveStyle({ top: '113px', left: '313px' }));
    expect(apiFetch).toHaveBeenCalledWith('/tutorials/me?clientVersion=2026.07.25');
    await waitFor(() => expect(speak).toHaveBeenCalled());
    expect((speak.mock.calls[speak.mock.calls.length - 1]?.[0] as MockSpeechSynthesisUtterance).text).toContain('Panel ringkasan menunjukkan');

    target.remove();
  });

  it('mematikan suara, menyimpan pilihan, dan tetap mempertahankan tutorial visual', async () => {
    render(<OnboardingTour user={{ id: 'siswa-1', role: 'SISWA' }} manualOpenKey={1} />);
    expect(await screen.findByRole('heading', { name: /Selamat datang/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Matikan panduan suara' }));

    expect(screen.getByRole('button', { name: 'Nyalakan panduan suara' })).toHaveAttribute('aria-pressed', 'false');
    expect(window.localStorage.getItem('siab2_tutorial_voice')).toBe('off');
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Tutorial awal' })).toBeInTheDocument();
  });

  it('menunggu voice Bahasa Indonesia yang dimuat terlambat', async () => {
    voices = [];
    render(<OnboardingTour user={{ id: 'siswa-1', role: 'SISWA' }} manualOpenKey={1} />);
    expect(await screen.findByRole('dialog', { name: 'Tutorial awal' })).toBeInTheDocument();
    expect(speak).not.toHaveBeenCalled();

    voices = [{ lang: 'id-ID', name: 'Bahasa Indonesia' }];
    voicesChanged?.();

    await waitFor(() => expect(speak).toHaveBeenCalledOnce());
    expect((speak.mock.calls[0][0] as MockSpeechSynthesisUtterance).voice).toEqual(voices[0]);
  });
});
