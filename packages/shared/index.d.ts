export declare const ROLES: readonly [
  'ADMIN_TU',
  'KEPALA_SEKOLAH',
  'GURU_MAPEL',
  'GURU_PIKET',
  'SISWA',
  'OPERATOR_IT',
  'DEVELOPER'
];

export type RoleName = typeof ROLES[number];

export declare const CAPABILITIES: readonly [
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
  'reports.self.read',
  'reports.operational.read',
  'reports.school.read',
  'reports.export',
  'audit.read',
  'profile.self.read',
  'profile.self.update'
];

export type Capability = typeof CAPABILITIES[number];

export declare const ROLE_CAPABILITIES: Readonly<Record<RoleName, readonly Capability[]>>;

export declare const API_ERROR_CODES: Readonly<{
  MISSING_CAPABILITY: 'MISSING_CAPABILITY';
  GATE_DIRECTION_ALREADY_RECORDED: 'GATE_DIRECTION_ALREADY_RECORDED';
  PRAYER_OUTSIDE_WINDOW: 'PRAYER_OUTSIDE_WINDOW';
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED';
}>;

export type ApiErrorCode = typeof API_ERROR_CODES[keyof typeof API_ERROR_CODES];

export declare function hasCapability(role: RoleName | string | undefined | null, capability: Capability): boolean;
