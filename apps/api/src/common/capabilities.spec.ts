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
    [Role.OPERATOR_IT, 'users.manage', false],
    [Role.OPERATOR_IT, 'devices.manage', true],
    [Role.GURU_PIKET, 'settings.manage', false],
    [Role.GURU_PIKET, 'reconciliation.escalate', true],
    [Role.GURU_MAPEL, 'classAttendance.record', true],
    [Role.GURU_MAPEL, 'devices.manage', false],
    [Role.ADMIN_TU, 'users.manage', true],
    [Role.ADMIN_TU, 'audit.read', true]
  ];

  it.each(expected)('%s capability %s -> %s', (role, capability, allowed) => {
    expect(hasCapability(role, capability)).toBe(allowed);
  });
});
