export const VOICE_PREF_KEY = 'lab-belajar-voice-pref';
export const MISSION_STORAGE_KEY = 'lab-belajar-mission-v1';

export type SpeakHandle = {
  cancel: () => void;
};

export type SpeakIndonesianOptions = {
  text: string;
  rate?: number;
  onEnd?: () => void;
  onStart?: () => void;
};

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function readVoicePreference(defaultOn = true): boolean {
  try {
    const raw = localStorage.getItem(VOICE_PREF_KEY);
    if (raw === 'off') return false;
    if (raw === 'on') return true;
    return defaultOn;
  } catch {
    return defaultOn;
  }
}

export function writeVoicePreference(enabled: boolean) {
  try {
    localStorage.setItem(VOICE_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // ignore quota / private mode
  }
}

export function pickIndonesianVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.find((voice) => voice.lang.toLowerCase().startsWith('id'));
}

/**
 * Speak Indonesian with voiceschanged wait + fallback, matching production OnboardingTour quality.
 * Returns a cancel handle; always cancel on step change / unmount.
 */
export function speakIndonesian(options: SpeakIndonesianOptions): SpeakHandle {
  const { text, rate = 0.96, onEnd, onStart } = options;
  if (!isSpeechSupported() || !text.trim()) {
    onEnd?.();
    return { cancel: () => undefined };
  }

  const synthesis = window.speechSynthesis;
  let spoken = false;
  let cancelled = false;
  let fallbackTimer = 0;
  let ended = false;

  const finish = () => {
    if (ended || cancelled) return;
    ended = true;
    onEnd?.();
  };

  const speak = (allowDefaultVoice = false) => {
    if (spoken || cancelled) return;
    const voices = synthesis.getVoices();
    const indonesianVoice = pickIndonesianVoice(voices);
    if (!indonesianVoice && !allowDefaultVoice) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = rate;
    utterance.pitch = 1;
    if (indonesianVoice) utterance.voice = indonesianVoice;
    utterance.onend = finish;
    utterance.onerror = finish;
    spoken = true;
    onStart?.();
    synthesis.speak(utterance);
  };

  const onVoicesChanged = () => {
    speak();
    if (spoken) window.clearTimeout(fallbackTimer);
  };

  synthesis.cancel();
  speak();
  if (!spoken) {
    synthesis.addEventListener('voiceschanged', onVoicesChanged);
    fallbackTimer = window.setTimeout(() => speak(true), 1200);
  }

  return {
    cancel: () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      synthesis.removeEventListener('voiceschanged', onVoicesChanged);
      synthesis.cancel();
    }
  };
}

export type MissionProgressEntry = {
  stepIndex: number;
  stepId?: string;
  completedAt?: string;
  updatedAt: string;
};

export type MissionProgressMap = Record<string, MissionProgressEntry>;

export function readMissionProgress(): MissionProgressMap {
  try {
    const raw = localStorage.getItem(MISSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MissionProgressMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeMissionProgress(map: MissionProgressMap) {
  try {
    localStorage.setItem(MISSION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function upsertMissionProgress(role: string, patch: Partial<MissionProgressEntry>) {
  const map = readMissionProgress();
  const prev = map[role] || { stepIndex: 0, updatedAt: new Date().toISOString() };
  map[role] = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  writeMissionProgress(map);
  return map[role];
}

export function missionStatus(role: string): 'belum' | 'berjalan' | 'selesai' {
  const entry = readMissionProgress()[role];
  if (!entry) return 'belum';
  if (entry.completedAt) return 'selesai';
  if (entry.stepIndex > 0) return 'berjalan';
  return 'belum';
}
