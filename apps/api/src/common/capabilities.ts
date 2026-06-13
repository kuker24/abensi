import { Role } from '@prisma/client';

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
  'gateAttendance.record',
  'attendanceOverrides.create',
  'attendanceOverrides.approve',
  'attendanceOverrides.revoke',
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

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  [Role.ADMIN_TU]: [
    'users.read', 'users.manage',
    'academic.read', 'academic.manage',
    'schedules.read', 'schedules.manage',
    'classAttendance.read', 'classAttendance.record', 'classAttendance.correct',
    'session.open', 'session.close',
    'gateAttendance.read', 'gateAttendance.record',
    'attendanceOverrides.create', 'attendanceOverrides.approve', 'attendanceOverrides.revoke',
    'devices.read', 'devices.manage',
    'reconciliation.read', 'reconciliation.escalate', 'reconciliation.resolve',
    'settings.read', 'settings.manage',
    'reports.read', 'reports.export',
    'audit.read',
    'profile.self.read', 'profile.self.update'
  ],
  [Role.OPERATOR_IT]: [
    'devices.read', 'devices.manage',
    'gateAttendance.read', 'gateAttendance.record',
    'settings.read',
    'audit.read',
    'profile.self.read', 'profile.self.update'
  ],
  [Role.GURU_MAPEL]: [
    'classAttendance.read', 'classAttendance.record', 'classAttendance.correct',
    'session.open', 'session.close',
    'reports.read',
    'profile.self.read', 'profile.self.update'
  ],
  [Role.GURU_PIKET]: [
    'classAttendance.read',
    'session.open', 'session.close',
    'gateAttendance.read', 'gateAttendance.record', 'attendanceOverrides.create',
    'reconciliation.read', 'reconciliation.escalate',
    'reports.read',
    'profile.self.read', 'profile.self.update'
  ],
  [Role.SISWA]: [
    'profile.self.read',
    'profile.self.update'
  ],
  [Role.DEVELOPER]: CAPABILITIES
};

export function hasCapability(role: Role | string | undefined | null, capability: Capability) {
  if (!role || !(role in ROLE_CAPABILITIES)) return false;
  return ROLE_CAPABILITIES[role as Role].includes(capability);
}
