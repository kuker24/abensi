import type { Role } from './types';

export const CAPABILITIES = [
  'users.read',
  'users.manage',
  'academic.read',
  'academic.manage',
  'schedules.read',
  'schedules.manage',
  'classAttendance.read',
  'classAttendance.record',
  'classAttendance.correct',
  'session.open',
  'session.close',
  'gateAttendance.read',
  'devices.read',
  'devices.manage',
  'reconciliation.read',
  'reconciliation.escalate',
  'reconciliation.resolve',
  'settings.read',
  'settings.manage',
  'reports.read',
  'reports.export',
  'audit.read',
  'profile.self.read',
  'profile.self.update'
] as const;

export type Capability = typeof CAPABILITIES[number];

export const ROLE_CAPABILITIES: Record<Role | 'DEVELOPER', readonly Capability[]> = {
  ADMIN_TU: [
    'users.read', 'users.manage', 'academic.read', 'academic.manage', 'schedules.read', 'schedules.manage',
    'classAttendance.read', 'classAttendance.record', 'classAttendance.correct', 'session.open', 'session.close',
    'gateAttendance.read', 'devices.read', 'devices.manage', 'reconciliation.read', 'reconciliation.escalate', 'reconciliation.resolve',
    'settings.read', 'settings.manage', 'reports.read', 'reports.export', 'audit.read', 'profile.self.read', 'profile.self.update'
  ],
  OPERATOR_IT: ['devices.read', 'devices.manage', 'gateAttendance.read', 'settings.read', 'audit.read', 'profile.self.read', 'profile.self.update'],
  GURU_MAPEL: ['classAttendance.read', 'classAttendance.record', 'classAttendance.correct', 'session.open', 'session.close', 'reports.read', 'profile.self.read', 'profile.self.update'],
  GURU_PIKET: ['classAttendance.read', 'session.open', 'session.close', 'gateAttendance.read', 'reconciliation.read', 'reconciliation.escalate', 'reports.read', 'profile.self.read', 'profile.self.update'],
  SISWA: ['profile.self.read', 'profile.self.update'],
  DEVELOPER: CAPABILITIES
};

export function hasCapability(role: string | undefined | null, capability: Capability) {
  if (!role || !(role in ROLE_CAPABILITIES)) return false;
  return ROLE_CAPABILITIES[role as Role | 'DEVELOPER'].includes(capability);
}
