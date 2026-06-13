export const ROLES = [
  'ADMIN_TU',
  'GURU_MAPEL',
  'GURU_PIKET',
  'SISWA',
  'OPERATOR_IT',
  'DEVELOPER'
];

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
  'reports.self.read',
  'reports.operational.read',
  'reports.school.read',
  'reports.export',
  'audit.read',
  'profile.self.read',
  'profile.self.update'
];

export const ROLE_CAPABILITIES = Object.freeze({
  ADMIN_TU: Object.freeze([
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
    'reports.self.read', 'reports.operational.read', 'reports.school.read', 'reports.export',
    'audit.read',
    'profile.self.read', 'profile.self.update'
  ]),
  OPERATOR_IT: Object.freeze([
    'devices.read', 'devices.manage',
    'gateAttendance.read', 'gateAttendance.record',
    'settings.read',
    'reports.self.read', 'reports.operational.read',
    'audit.read',
    'profile.self.read', 'profile.self.update'
  ]),
  GURU_MAPEL: Object.freeze([
    'classAttendance.read', 'classAttendance.record', 'classAttendance.correct',
    'session.open', 'session.close',
    'reports.self.read',
    'profile.self.read', 'profile.self.update'
  ]),
  GURU_PIKET: Object.freeze([
    'classAttendance.read',
    'session.open', 'session.close',
    'gateAttendance.read', 'gateAttendance.record',
    'attendanceOverrides.create',
    'reconciliation.read', 'reconciliation.escalate',
    'reports.self.read', 'reports.operational.read',
    'profile.self.read', 'profile.self.update'
  ]),
  SISWA: Object.freeze([
    'reports.self.read',
    'profile.self.read',
    'profile.self.update'
  ]),
  DEVELOPER: CAPABILITIES
});

export const API_ERROR_CODES = Object.freeze({
  MISSING_CAPABILITY: 'MISSING_CAPABILITY',
  GATE_DIRECTION_ALREADY_RECORDED: 'GATE_DIRECTION_ALREADY_RECORDED',
  PRAYER_OUTSIDE_WINDOW: 'PRAYER_OUTSIDE_WINDOW',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED'
});

export function hasCapability(role, capability) {
  if (!role || !Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, role)) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}
