import type { StudentAttendanceStatus } from './domain';

export type AsyncState = 'idle' | 'loading' | 'success' | 'error';

export type FlowStep = 'session' | 'identity' | 'validation' | 'confirm' | 'receipt';

export type ValidationMap = Partial<
  Record<'selectedSessionId' | 'studentName' | 'studentId' | 'status' | 'policy' | 'location', string>
>;

export type UiDensity = 'comfortable' | 'compact';
export type UiRadius = 'soft' | 'sharp';
export type MotionIntensity = 'calm' | 'balanced' | 'vivid';
export type UiEmphasis = 'data' | 'context';
export type UiChroma = 'emerald' | 'slate' | 'sunset';

export interface UiTweaks {
  density: UiDensity;
  radius: UiRadius;
  motion: MotionIntensity;
  emphasis: UiEmphasis;
  chroma: UiChroma;
}

export interface CheckInDraftState {
  step: number;
  flowStep: FlowStep;
  selectedSessionId: string;
  studentName: string;
  studentId: string;
  status: StudentAttendanceStatus | '';
  note: string;
  agreePolicy: boolean;
  locationConfirmed: boolean;
  asyncState: AsyncState;
  receiptId?: string;
  submittedAt?: string;
  updatedAt: string;
}

export interface MockAnomalyActionState {
  asyncState: AsyncState;
  lastAction?: 'resolve' | 'escalate';
  updatedAt: string;
}

export interface MockTeacherSessionState {
  phase: 'prepare' | 'marking' | 'review' | 'closed';
  hasUnsaved: boolean;
  updatedAt: string;
}

export interface MockSessionState {
  anomalyActions: Record<string, MockAnomalyActionState>;
  teacherSessions: Record<string, MockTeacherSessionState>;
}
