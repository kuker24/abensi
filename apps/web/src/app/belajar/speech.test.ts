import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MISSION_STORAGE_KEY,
  isSpeechSupported,
  missionStatus,
  pickIndonesianVoice,
  readMissionProgress,
  readVoicePreference,
  speakIndonesian,
  upsertMissionProgress,
  writeMissionProgress,
  writeVoicePreference
} from './speech';

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
  onend: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('belajar speech helpers', () => {
  beforeEach(() => {
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
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance
    });
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: MockSpeechSynthesisUtterance
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mendeteksi dukungan speech synthesis', () => {
    expect(isSpeechSupported()).toBe(true);
  });

  it('memilih voice id-ID', () => {
    const picked = pickIndonesianVoice([
      { lang: 'en-US', name: 'English' } as SpeechSynthesisVoice,
      { lang: 'id-ID', name: 'Indonesia' } as SpeechSynthesisVoice
    ]);
    expect(picked?.name).toBe('Indonesia');
  });

  it('menyimpan preferensi suara', () => {
    expect(readVoicePreference(true)).toBe(true);
    writeVoicePreference(false);
    expect(readVoicePreference(true)).toBe(false);
    writeVoicePreference(true);
    expect(readVoicePreference(false)).toBe(true);
  });

  it('membaca dan menulis progress misi', () => {
    expect(missionStatus('admin-tu')).toBe('belum');
    upsertMissionProgress('admin-tu', { stepIndex: 2, stepId: 'approve' });
    expect(missionStatus('admin-tu')).toBe('berjalan');
    upsertMissionProgress('admin-tu', { stepIndex: 7, completedAt: '2026-08-04T00:00:00.000Z' });
    expect(missionStatus('admin-tu')).toBe('selesai');
    expect(readMissionProgress()['admin-tu']?.stepId).toBe('approve');
    writeMissionProgress({});
    expect(window.localStorage.getItem(MISSION_STORAGE_KEY)).toBe('{}');
  });

  it('berbicara Bahasa Indonesia dan memanggil onEnd', () => {
    const onEnd = vi.fn();
    speakIndonesian({ text: 'Halo lab belajar', onEnd });
    expect(cancel).toHaveBeenCalled();
    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0] as MockSpeechSynthesisUtterance;
    expect(utterance.lang).toBe('id-ID');
    expect(utterance.text).toContain('Halo lab belajar');
    expect(utterance.voice).toEqual(voices[0]);
    utterance.onend?.(new Event('end'));
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('menunggu voiceschanged bila voice id belum siap', () => {
    voices = [];
    speakIndonesian({ text: 'Tunggu suara' });
    expect(speak).not.toHaveBeenCalled();
    voices = [{ lang: 'id-ID', name: 'Bahasa Indonesia' }];
    voicesChanged?.();
    expect(speak).toHaveBeenCalledOnce();
  });
});
