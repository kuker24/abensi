'use strict';

const ROLES = [
  'ADMIN_TU',
  'KEPALA_SEKOLAH',
  'GURU_MAPEL',
  'GURU_PIKET',
  'SISWA',
  'OPERATOR_IT',
  'DEVELOPER'
];

const CAPABILITIES = [
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
  'leave.self.manage',
  'leave.review',
  'profile.self.read',
  'profile.self.update'
];

const ROLE_CAPABILITIES = Object.freeze({
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
    'leave.self.manage', 'leave.review',
    'profile.self.read', 'profile.self.update'
  ]),
  KEPALA_SEKOLAH: Object.freeze([
    'reports.self.read', 'reports.operational.read', 'reports.school.read',
    'leave.self.manage', 'leave.review',
    'profile.self.read', 'profile.self.update'
  ]),
  OPERATOR_IT: Object.freeze([
    'devices.read', 'devices.manage',
    'gateAttendance.read', 'gateAttendance.record',
    'settings.read',
    'reports.self.read', 'reports.operational.read',
    'audit.read',
    'leave.self.manage',
    'profile.self.read', 'profile.self.update'
  ]),
  GURU_MAPEL: Object.freeze([
    'classAttendance.read', 'classAttendance.record', 'classAttendance.correct',
    'session.open', 'session.close',
    'reports.self.read',
    'leave.self.manage',
    'profile.self.read', 'profile.self.update'
  ]),
  GURU_PIKET: Object.freeze([
    'classAttendance.read',
    'session.open', 'session.close',
    'gateAttendance.read', 'gateAttendance.record',
    'attendanceOverrides.create',
    'reconciliation.read', 'reconciliation.escalate',
    'reports.self.read', 'reports.operational.read',
    'leave.self.manage',
    'profile.self.read', 'profile.self.update'
  ]),
  SISWA: Object.freeze([
    'reports.self.read',
    'profile.self.read',
    'profile.self.update'
  ]),
  DEVELOPER: Object.freeze(CAPABILITIES.filter(
    (capability) => capability !== 'leave.self.manage' && capability !== 'leave.review'
  ))
});

const API_ERROR_CODES = Object.freeze({
  MISSING_CAPABILITY: 'MISSING_CAPABILITY',
  GATE_DIRECTION_ALREADY_RECORDED: 'GATE_DIRECTION_ALREADY_RECORDED',
  PRAYER_OUTSIDE_WINDOW: 'PRAYER_OUTSIDE_WINDOW',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED'
});

function hasCapability(role, capability) {
  if (!role || !Object.prototype.hasOwnProperty.call(ROLE_CAPABILITIES, role)) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

module.exports = {
  ROLES,
  CAPABILITIES,
  ROLE_CAPABILITIES,
  API_ERROR_CODES,
  hasCapability
};
