import { ForbiddenException } from '@nestjs/common';
import { AttendanceReviewState, Role, SessionStatus, StudentAttendanceStatus } from '@prisma/client';
import { TeacherService } from './teacher.service';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    weeklyScheduleId: 'schedule-1',
    classId: 'class-1',
    subjectId: 'subject-1',
    startsAt: new Date('2026-06-20T00:30:00.000Z'),
    endsAt: new Date('2026-06-20T02:00:00.000Z'),
    status: SessionStatus.OPEN,
    schoolClass: { id: 'class-1', code: 'X IPA 1', name: 'X IPA 1' },
    subject: { id: 'subject-1', code: 'MTK', name: 'Matematika' },
    rosters: [{ studentId: 'siswa-1' }, { studentId: 'siswa-2' }, { studentId: 'siswa-3' }],
    attendances: [
      { studentId: 'siswa-1', status: StudentAttendanceStatus.HADIR, reviewState: AttendanceReviewState.CONFIRMED },
      { studentId: 'siswa-2', status: StudentAttendanceStatus.ALPA, reviewState: AttendanceReviewState.DEFAULTED }
    ],
    ...overrides
  };
}

function makeService(sessions: Array<Record<string, unknown>> = []) {
  const prisma = {
    session: {
      findMany: jest.fn().mockResolvedValue(sessions)
    },
    classEnrollment: {
      groupBy: jest.fn().mockResolvedValue([{ classId: 'class-1', _count: { _all: 32 } }])
    }
  } as any;
  return { service: new TeacherService(prisma), prisma };
}

const guru = { sub: 'guru-1', role: Role.GURU_MAPEL };

describe('TeacherService today workspace', () => {
  it('teacher gets only own sessions for the Jakarta business date', async () => {
    const { service, prisma } = makeService([makeSession()]);

    const result = await service.today(guru, '2026-06-20');

    expect(prisma.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        teacherId: 'guru-1',
        startsAt: {
          gte: new Date('2026-06-19T17:00:00.000Z'),
          lte: new Date('2026-06-20T16:59:59.999Z')
        }
      })
    }));
    expect(result.date).toBe('2026-06-20');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      sessionId: 'session-1',
      className: 'X IPA 1',
      subjectName: 'Matematika',
      startTime: '07:30',
      endTime: '09:00'
    });
  });

  it('teacher with no schedule returns empty items and zero summary', async () => {
    const { service, prisma } = makeService([]);

    const result = await service.today(guru, '2026-06-20');

    expect(prisma.classEnrollment.groupBy).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.summary).toEqual({
      sessionsToday: 0,
      scheduled: 0,
      open: 0,
      closed: 0,
      missed: 0,
      unclosed: 0,
      studentsPendingAttendance: 0
    });
  });

  it('open session returns canContinue and canClose with pending attendance count', async () => {
    const { service } = makeService([makeSession()]);

    const result = await service.today(guru, '2026-06-20');

    expect(result.summary).toMatchObject({ sessionsToday: 1, open: 1, unclosed: 1, studentsPendingAttendance: 2 });
    expect(result.items[0]).toMatchObject({
      status: SessionStatus.OPEN,
      attendanceFilledCount: 1,
      studentTotal: 3,
      pendingCount: 2,
      actions: { canStart: false, canContinue: true, canClose: true, canViewRecap: true }
    });
  });

  it('closed session returns canViewRecap without start or close actions', async () => {
    const { service } = makeService([makeSession({ status: SessionStatus.CLOSED, attendances: [
      { studentId: 'siswa-1', status: StudentAttendanceStatus.HADIR, reviewState: AttendanceReviewState.CONFIRMED },
      { studentId: 'siswa-2', status: StudentAttendanceStatus.ALPA, reviewState: AttendanceReviewState.CONFIRMED },
      { studentId: 'siswa-3', status: StudentAttendanceStatus.IZIN, reviewState: AttendanceReviewState.CONFIRMED }
    ] })]);

    const result = await service.today(guru, '2026-06-20');

    expect(result.summary).toMatchObject({ closed: 1, unclosed: 0, studentsPendingAttendance: 0 });
    expect(result.items[0].actions).toEqual({ canStart: false, canContinue: false, canClose: false, canViewRecap: true });
  });

  it('scheduled session uses active class enrollment count before roster exists', async () => {
    const { service, prisma } = makeService([makeSession({ status: SessionStatus.SCHEDULED, rosters: [], attendances: [] })]);

    const result = await service.today(guru, '2026-06-20');

    expect(prisma.classEnrollment.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        classId: { in: ['class-1'] },
        active: true,
        administrativeStatus: 'ACTIVE',
        student: { active: true, role: Role.SISWA }
      })
    }));
    expect(result.items[0]).toMatchObject({ studentTotal: 32, pendingCount: 32, actions: { canStart: true, canContinue: false, canClose: false, canViewRecap: false } });
  });

  it('another role cannot use the teacher-only workspace', async () => {
    const { service, prisma } = makeService([makeSession()]);

    await expect(service.today({ sub: 'admin-1', role: Role.ADMIN_TU }, '2026-06-20')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.session.findMany).not.toHaveBeenCalled();
  });
});
