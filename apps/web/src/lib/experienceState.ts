import { useEffect, useState } from 'react';
import type { CheckInDraftState, FlowStep, MockSessionState, UiTweaks } from '../types/experience';

const STORAGE_KEYS = {
  tweaks: 'schoolhub_ui_tweaks',
  checkInDraft: 'schoolhub_checkin_draft',
  mockSessionState: 'schoolhub_mock_session_state'
} as const;

export const defaultUiTweaks: UiTweaks = {
  density: 'comfortable',
  radius: 'soft',
  motion: 'balanced',
  emphasis: 'data',
  chroma: 'emerald'
};

export const defaultCheckInDraftState: CheckInDraftState = {
  step: 0,
  flowStep: 'session',
  selectedSessionId: '',
  studentName: '',
  studentId: '',
  status: '',
  note: '',
  agreePolicy: false,
  locationConfirmed: false,
  asyncState: 'idle',
  updatedAt: new Date().toISOString()
};

export const defaultMockSessionState: MockSessionState = {
  anomalyActions: {},
  teacherSessions: {}
};

function parseStored<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

export function usePersistentLocalState<T>(key: string, initialState: T) {
  const [state, setState] = useState<T>(() => parseStored(window.localStorage.getItem(key), initialState));

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState] as const;
}

export function useUiTweaksState() {
  return usePersistentLocalState(STORAGE_KEYS.tweaks, defaultUiTweaks);
}

export function useCheckInDraftState() {
  return usePersistentLocalState(STORAGE_KEYS.checkInDraft, defaultCheckInDraftState);
}

export function useMockSessionState() {
  return usePersistentLocalState(STORAGE_KEYS.mockSessionState, defaultMockSessionState);
}

export function flowStepFromIndex(step: number): FlowStep {
  const ordered: FlowStep[] = ['session', 'identity', 'validation', 'confirm', 'receipt'];
  return ordered[Math.max(0, Math.min(step, ordered.length - 1))];
}

export function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function simulateAsyncTransition(options?: {
  minMs?: number;
  maxMs?: number;
  failRate?: number;
}) {
  const minMs = options?.minMs ?? 350;
  const maxMs = options?.maxMs ?? 900;
  const failRate = options?.failRate ?? 0.1;
  const timeout = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));

  await wait(timeout);

  if (Math.random() < failRate) {
    throw new Error('Simulated transition failed');
  }
}
