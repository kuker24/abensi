import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { API_ERROR_CODES } from '@schoolhub/shared';
import { CAPABILITIES_KEY } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { hasCapability, type Capability } from '../../common/capabilities';
import { ROLES_KEY } from '../../common/roles.decorator';
import { ReportingController } from './reporting.controller';

const routeHandlers = [
  'dashboard',
  'classMonthly',
  'trend',
  'liveMonitor',
  'streamLiveMonitor',
  'myAttendance',
  'recapClasses',
  'recapStudents',
  'recapSubjects',
  'recapTeachers',
  'teacherMonthly',
  'staffGateAttendance',
  'teacherSessionActivity',
  'studentDailyCompleteness',
  'studentPrayerAttendance',
  'studentWorshipRecap',
  'auditCoverage',
  'exportReport'
] as const;

type ReportingHandler = typeof routeHandlers[number];

function routeMeta(handler: ReportingHandler) {
  const target = ReportingController.prototype[handler];
  const roles = (Reflect as any).getMetadata(ROLES_KEY, target) as Role[] | undefined;
  const capabilities = (Reflect as any).getMetadata(CAPABILITIES_KEY, target) as Capability[] | undefined;
  return { roles: roles ?? [], capabilities: capabilities ?? [] };
}

function expectedStatus(role: Role, handler: ReportingHandler) {
  const { roles, capabilities } = routeMeta(handler);
  return roles.includes(role) && capabilities.every((capability) => hasCapability(role, capability)) ? 200 : 403;
}

describe('ReportingController role/capability contract', () => {
  it.each(routeHandlers)('has satisfiable capabilities for every listed role on %s', (handler) => {
    const { roles, capabilities } = routeMeta(handler);
    expect(roles.length).toBeGreaterThan(0);
    expect(capabilities.length).toBeGreaterThan(0);

    for (const role of roles) {
      expect(capabilities.every((capability) => hasCapability(role, capability))).toBe(true);
    }
  });

  it.each([
    [Role.SISWA, 'myAttendance', 200],
    [Role.SISWA, 'recapStudents', 403],
    [Role.SISWA, 'dashboard', 403],
    [Role.KEPALA_SEKOLAH, 'dashboard', 200],
    [Role.KEPALA_SEKOLAH, 'studentDailyCompleteness', 200],
    [Role.KEPALA_SEKOLAH, 'exportReport', 403],
    [Role.OPERATOR_IT, 'liveMonitor', 200],
    [Role.OPERATOR_IT, 'streamLiveMonitor', 200],
    [Role.OPERATOR_IT, 'teacherMonthly', 403],
    [Role.OPERATOR_IT, 'recapClasses', 403],
    [Role.GURU_MAPEL, 'myAttendance', 200],
    [Role.GURU_MAPEL, 'teacherMonthly', 403],
    [Role.GURU_PIKET, 'liveMonitor', 200],
    [Role.GURU_PIKET, 'recapClasses', 403],
    [Role.ADMIN_TU, 'classMonthly', 200],
    [Role.ADMIN_TU, 'studentDailyCompleteness', 200],
    [Role.ADMIN_TU, 'exportReport', 200]
  ] as Array<[Role, ReportingHandler, number]>)('%s -> %s returns expected auth status %s', (role, handler, status) => {
    expect(expectedStatus(role, handler)).toBe(status);
  });

  it('uses reports.self.read for my-attendance so SISWA can read only the self-report route', () => {
    expect(routeMeta('myAttendance')).toEqual(expect.objectContaining({
      roles: expect.arrayContaining([Role.SISWA]),
      capabilities: ['reports.self.read']
    }));
    expect(hasCapability(Role.SISWA, 'reports.self.read')).toBe(true);
    expect(hasCapability(Role.SISWA, 'reports.school.read')).toBe(false);
  });

  it('returns a stable 403 code when a listed role lacks a required capability', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['reports.school.read'])
    } as unknown as Reflector;
    const guard = new CapabilitiesGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role: Role.SISWA } })
      })
    } as any;

    try {
      guard.canActivate(context);
      throw new Error('Guard unexpectedly allowed a missing capability.');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: API_ERROR_CODES.MISSING_CAPABILITY,
        requiredCapabilities: ['reports.school.read']
      });
    }
  });
});
