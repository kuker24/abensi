import { Role } from '@prisma/client';
import { CAPABILITIES, hasCapability, ROLE_CAPABILITIES, type Capability } from './capabilities';

describe('role capability matrix', () => {
  it.each(Object.values(Role))('defines explicit capabilities for %s', (role) => {
    expect(ROLE_CAPABILITIES[role]).toBeDefined();
    for (const capability of ROLE_CAPABILITIES[role]) {
      expect(CAPABILITIES).toContain(capability);
    }
  });

  const expected: Array<[Role, Capability, boolean]> = [
    [Role.SISWA, 'classAttendance.record', false],
    [Role.SISWA, 'profile.self.read', true],
    [Role.SISWA, 'reports.self.read', true],
    [Role.SISWA, 'reports.school.read', false],
    [Role.KEPALA_SEKOLAH, 'reports.operational.read', true],
    [Role.KEPALA_SEKOLAH, 'reports.school.read', true],
    [Role.KEPALA_SEKOLAH, 'reports.export', false],
    [Role.KEPALA_SEKOLAH, 'users.manage', false],
    [Role.OPERATOR_IT, 'users.manage', false],
    [Role.OPERATOR_IT, 'devices.manage', true],
    [Role.OPERATOR_IT, 'reports.operational.read', true],
    [Role.OPERATOR_IT, 'reports.school.read', false],
    [Role.OPERATOR_IT, 'reports.export', false],
    [Role.GURU_PIKET, 'settings.manage', false],
    [Role.GURU_PIKET, 'reconciliation.escalate', true],
    [Role.GURU_PIKET, 'reports.operational.read', true],
    [Role.GURU_PIKET, 'reports.school.read', false],
    [Role.GURU_MAPEL, 'classAttendance.record', true],
    [Role.GURU_MAPEL, 'devices.manage', false],
    [Role.GURU_MAPEL, 'reports.self.read', true],
    [Role.GURU_MAPEL, 'reports.school.read', false],
    [Role.ADMIN_TU, 'users.manage', true],
    [Role.ADMIN_TU, 'audit.read', true],
    [Role.ADMIN_TU, 'reports.school.read', true],
    [Role.ADMIN_TU, 'leave.self.manage', true],
    [Role.ADMIN_TU, 'leave.review', true],
    [Role.KEPALA_SEKOLAH, 'leave.self.manage', true],
    [Role.KEPALA_SEKOLAH, 'leave.review', true],
    [Role.GURU_MAPEL, 'leave.self.manage', true],
    [Role.GURU_MAPEL, 'leave.review', false],
    [Role.GURU_PIKET, 'leave.self.manage', true],
    [Role.GURU_PIKET, 'leave.review', false],
    [Role.OPERATOR_IT, 'leave.self.manage', true],
    [Role.OPERATOR_IT, 'leave.review', false],
    [Role.SISWA, 'leave.self.manage', false],
    [Role.SISWA, 'leave.review', false],
    [Role.DEVELOPER, 'leave.self.manage', false],
    [Role.DEVELOPER, 'leave.review', false]
  ];

  it.each(expected)('%s capability %s -> %s', (role, capability, allowed) => {
    expect(hasCapability(role, capability)).toBe(allowed);
  });

  it('preserves every non-leave capability for DEVELOPER', () => {
    expect(ROLE_CAPABILITIES[Role.DEVELOPER]).toEqual(
      CAPABILITIES.filter((capability) => capability !== 'leave.self.manage' && capability !== 'leave.review')
    );
  });
});
