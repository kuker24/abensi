import { BadRequestException } from '@nestjs/common';
import { Role, SessionStatus } from '@prisma/client';
import { SchedulingService } from './scheduling.service';

const period = {
  id: 'semester-1',
  academicYearId: 'year-1',
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2026-06-30T00:00:00.000Z')
};

const assignment = {
  id: 'assignment-1',
  teacherId: 'teacher-1',
  subjectId: 'subject-1',
  classId: 'class-1',
  academicYearId: 'year-1',
  semesterId: 'semester-1',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveTo: new Date('2026-06-30T00:00:00.000Z'),
  active: true,
  _count: { weeklySchedules: 0, sessions: 0, substitutionSourceSessions: 0 }
};

function validAssignmentPayload(overrides: Record<string, unknown> = {}) {
  return {
    teacherId: 'teacher-1',
    subjectId: 'subject-1',
    classId: 'class-1',
    academicYearId: 'year-1',
    semesterId: 'semester-1',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-06-30',
    active: true,
    ...overrides
  };
}

function validWeeklyPayload(overrides: Record<string, unknown> = {}) {
  return {
    classId: 'class-1',
    subjectId: 'subject-1',
    teacherId: 'teacher-1',
    teachingAssignmentId: 'assignment-1',
    academicYearId: 'year-1',
    semesterId: 'semester-1',
    dayOfWeek: 0,
    startTime: '07:15',
    endTime: '08:45',
    effectiveFrom: '2026-06-14',
    effectiveTo: '2026-06-30',
    ...overrides
  };
}

function validSessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    classId: 'class-1',
    subjectId: 'subject-1',
    teacherId: 'teacher-1',
    teachingAssignmentId: 'assignment-1',
    academicYearId: 'year-1',
    semesterId: 'semester-1',
    startsAt: '2026-06-14T07:15',
    endsAt: '2026-06-14T08:45',
    ...overrides
  };
}

function makePrisma() {
  const events: string[] = [];
  const locks: Array<{ kind: string; value: unknown }> = [];
  const rawSqlText = (query: unknown) => {
    const strings = (query as { strings?: readonly string[] }).strings;
    return strings ? strings.join('?') : '';
  };
  const rawSqlValue = (query: unknown, position = 0) => (query as { values?: unknown[] }).values?.[position];
  const tx = {
    $queryRaw: jest.fn(async (query: unknown) => {
      const sql = rawSqlText(query);
      const value = rawSqlValue(query);
      if (sql.includes('pg_advisory_xact_lock')) {
        expect(sql).toContain('::text');
        events.push('leave.advisory');
        locks.push({ kind: 'advisory', value });
        return [];
      }
      if (sql.includes('SELECT "id" FROM "WeeklySchedule"') && sql.includes('FOR UPDATE')) {
        events.push('weekly.lock');
        locks.push({ kind: 'weekly', value });
        return [];
      }
      if (sql.includes('SELECT "id" FROM "User"') && sql.includes('FOR UPDATE')) {
        events.push('user.lock');
        locks.push({ kind: 'user', value });
        return [];
      }
      if (sql.includes('SELECT "id" FROM "AcademicYear"') && sql.includes('FOR UPDATE')) {
        events.push('year.lock');
        locks.push({ kind: 'year', value });
        return [];
      }
      if (sql.includes('SELECT "id" FROM "Semester"') && sql.includes('FOR UPDATE')) {
        events.push('semester.lock');
        locks.push({ kind: 'semester', value });
        return [];
      }
      if (sql.includes('SELECT "id" FROM "TeachingAssignment"') && sql.includes('FOR UPDATE')) {
        events.push('assignment.lock');
        locks.push({ kind: 'assignment', value });
        return [];
      }
      if (sql.includes('SELECT "id" FROM "Session"') && sql.includes('FOR UPDATE')) {
        events.push('session.lock');
        locks.push({ kind: 'session', value });
        return [];
      }
      if (sql.includes('INSERT INTO "Session"')) {
        events.push('session.insert');
        return [{ id: 'generated-1' }];
      }
      return [];
    }),
    user: {
      findUnique: jest.fn(async () => ({ id: 'teacher-1', active: true, role: Role.GURU_MAPEL }))
    },
    semester: {
      findUnique: jest.fn(async () => ({ ...period }))
    },
    schoolClass: {
      findUnique: jest.fn(async () => ({ id: 'class-1' }))
    },
    subject: {
      findUnique: jest.fn(async () => ({ id: 'subject-1' }))
    },
    teachingAssignment: {
      findUnique: jest.fn(async () => ({ ...assignment })),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }) => ({ id: 'assignment-1', ...data })),
      update: jest.fn(async ({ data }) => ({ id: 'assignment-1', ...data }))
    },
    teacherLeave: {
      findMany: jest.fn(async () => [])
    },
    teacherSessionPresence: {
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 }))
    },
    session: {
      create: jest.fn(async ({ data }) => ({ id: 'session-1', ...data })),
      findMany: jest.fn(async (args?: { select?: { businessDate?: boolean } }) => (
        args?.select?.businessDate
          ? []
          : [{ id: 'generated-1', startsAt: new Date('2026-06-14T00:15:00.000Z') }]
      )),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    weeklySchedule: {
      create: jest.fn(async ({ data }) => ({ id: 'weekly-1', ...data })),
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }) => ({ id: 'weekly-1', ...data }))
    },
    auditEntry: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({ id: 'audit-1' }))
    },
    auditChainState: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({}))
    }
  };

  const prisma = {
    $transaction: jest.fn(async (callback) => callback(tx)),
    teachingAssignment: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: tx.teachingAssignment.findUnique,
      create: tx.teachingAssignment.create,
      update: tx.teachingAssignment.update
    },
    weeklySchedule: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: tx.weeklySchedule.findUnique,
      update: tx.weeklySchedule.update,
      create: tx.weeklySchedule.create
    },
    session: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: tx.session.create,
      findUnique: tx.session.findUnique,
      update: tx.session.update
    },
    auditEntry: tx.auditEntry,
    auditChainState: tx.auditChainState
  };

  return { prisma, tx, events, locks };
}

describe('SchedulingService teaching assignments and schedule integrity', () => {
  it('locks assignment creation User before academic period with parameterized ID', async () => {
    const { prisma, locks } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await service.createTeachingAssignment(validAssignmentPayload(), 'actor-1');

    expect(locks.filter((lock) => ['user', 'year', 'semester'].includes(lock.kind))).toEqual([
      { kind: 'user', value: 'teacher-1' },
      { kind: 'year', value: 'year-1' },
      { kind: 'semester', value: 'semester-1' }
    ]);
  });

  it('creates active GURU_MAPEL assignment inside complete semester bounds', async () => {
    const { prisma, tx } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await service.createTeachingAssignment(validAssignmentPayload(), 'actor-1');

    expect(tx.teachingAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teacherId: 'teacher-1',
        academicYearId: 'year-1',
        semesterId: 'semester-1',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-06-30T00:00:00.000Z'),
        active: true
      })
    });
  });

  it.each([
    [{ id: 'teacher-1', active: false, role: Role.GURU_MAPEL }],
    [{ id: 'teacher-1', active: true, role: Role.GURU_PIKET }],
    [null]
  ])('rejects inactive, wrong-role, or missing assignment teachers', async (teacher) => {
    const { prisma, tx } = makePrisma();
    tx.user.findUnique.mockResolvedValue(teacher as any);
    const service = new SchedulingService(prisma as any);

    await expect(service.createTeachingAssignment(validAssignmentPayload(), 'actor-1')).rejects.toMatchObject({
      response: { code: 'TEACHING_ASSIGNMENT_TEACHER_INVALID' }
    });
  });

  it.each([
    [validAssignmentPayload({ academicYearId: 'year-2' }), { ...period }],
    [validAssignmentPayload(), { ...period, startsAt: null, endsAt: null }],
    [validAssignmentPayload({ effectiveFrom: '2025-12-31' }), { ...period }],
    [validAssignmentPayload({ effectiveFrom: '2026-06-30', effectiveTo: '2026-06-01' }), { ...period }]
  ])('rejects mismatched, incomplete, outside, or inverted assignment periods', async (payload, semester) => {
    const { prisma, tx } = makePrisma();
    tx.semester.findUnique.mockResolvedValue(semester as any);
    const service = new SchedulingService(prisma as any);

    await expect(service.createTeachingAssignment(payload as any, 'actor-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps assignment exclusion conflict to stable 409 code', async () => {
    const { prisma, tx } = makePrisma();
    tx.teachingAssignment.create.mockRejectedValue(new Error('TeachingAssignment_active_no_overlap_excl'));
    const service = new SchedulingService(prisma as any);

    await expect(service.createTeachingAssignment(validAssignmentPayload(), 'actor-1')).rejects.toMatchObject({
      response: { code: 'TEACHING_ASSIGNMENT_PERIOD_OVERLAP' }
    });
  });

  it('locks assignment update User then academic period then assignment with parameterized sorted IDs', async () => {
    const { prisma, locks } = makePrisma();
    prisma.teachingAssignment.findUnique.mockResolvedValue({ ...assignment, _count: assignment._count });
    const service = new SchedulingService(prisma as any);

    await service.updateTeachingAssignment('assignment-1', validAssignmentPayload({ teacherId: 'teacher-2', active: false }), 'actor-1');

    expect(locks.filter((lock) => ['user', 'year', 'semester', 'assignment'].includes(lock.kind))).toEqual([
      { kind: 'user', value: 'teacher-1' },
      { kind: 'user', value: 'teacher-2' },
      { kind: 'year', value: 'year-1' },
      { kind: 'semester', value: 'semester-1' },
      { kind: 'assignment', value: 'assignment-1' }
    ]);
  });

  it('updates assignment as full replacement after revalidation and locks its row', async () => {
    const { prisma, tx } = makePrisma();
    tx.teachingAssignment.findUnique.mockResolvedValue({ ...assignment });
    const service = new SchedulingService(prisma as any);

    await service.updateTeachingAssignment('assignment-1', validAssignmentPayload({ active: false }), 'actor-1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.teachingAssignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: expect.objectContaining({ active: false, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') })
    });
  });

  it('normalizes missing assignment and schedule end dates to finite semester or assignment ends', async () => {
    const { prisma, tx } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await service.createTeachingAssignment(validAssignmentPayload({ effectiveTo: undefined }), 'actor-1');
    expect(tx.teachingAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ effectiveTo: new Date('2026-06-30T00:00:00.000Z') })
    });

    await service.createWeeklySchedule(validWeeklyPayload({ effectiveTo: undefined }), 'actor-1');
    expect(tx.weeklySchedule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ effectiveTo: new Date('2026-06-30T00:00:00.000Z') })
    });
  });

  it('rejects protected assignment changes after schedules or sessions reference it, but allows active-only change', async () => {
    const { prisma, tx } = makePrisma();
    tx.teachingAssignment.findUnique.mockResolvedValue({
      ...assignment,
      _count: { weeklySchedules: 1, sessions: 0, substitutionSourceSessions: 0 }
    });
    const service = new SchedulingService(prisma as any);

    await expect(service.updateTeachingAssignment('assignment-1', validAssignmentPayload({ subjectId: 'subject-2' }), 'actor-1'))
      .rejects.toMatchObject({ response: { code: 'TEACHING_ASSIGNMENT_IMMUTABLE' } });

    await service.updateTeachingAssignment('assignment-1', validAssignmentPayload({ active: false }), 'actor-1');
    expect(tx.teachingAssignment.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ active: false })
    }));
  });

  it('protects source-only assignment provenance and lists its count', async () => {
    const { prisma, tx } = makePrisma();
    tx.teachingAssignment.findUnique.mockResolvedValue({
      ...assignment,
      _count: { weeklySchedules: 0, sessions: 0, substitutionSourceSessions: 1 }
    });
    const service = new SchedulingService(prisma as any);

    await expect(service.updateTeachingAssignment('assignment-1', validAssignmentPayload({ subjectId: 'subject-2' }), 'actor-1'))
      .rejects.toMatchObject({ response: { code: 'TEACHING_ASSIGNMENT_IMMUTABLE' } });
    expect(tx.teachingAssignment.update).not.toHaveBeenCalled();

    prisma.teachingAssignment.count.mockResolvedValue(1);
    prisma.teachingAssignment.findMany.mockResolvedValue([]);
    await service.listTeachingAssignments({ page: 1, limit: 10, skip: 0 });
    expect(prisma.teachingAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        _count: { select: expect.objectContaining({ substitutionSourceSessions: true }) }
      })
    }));
  });

  it('creates weekly schedule only when tuple, period, and assignment match', async () => {
    const { prisma, tx } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await service.createWeeklySchedule(validWeeklyPayload(), 'actor-1');

    expect(tx.weeklySchedule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teachingAssignmentId: 'assignment-1',
        academicYearId: 'year-1',
        semesterId: 'semester-1',
        effectiveFrom: new Date('2026-06-14T00:00:00.000Z'),
        effectiveTo: new Date('2026-06-30T00:00:00.000Z')
      })
    });
  });

  it('locks weekly schedule before assignment before updating a compliant replacement', async () => {
    const { prisma, tx, events } = makePrisma();
    tx.weeklySchedule.findUnique.mockImplementation(async () => {
      events.push('weekly.read');
      return { id: 'weekly-1', active: false };
    });
    tx.teachingAssignment.findUnique.mockImplementation(async () => {
      events.push('assignment.read');
      return { ...assignment };
    });
    tx.weeklySchedule.update.mockImplementation(async ({ data }) => {
      events.push('weekly.update');
      return { id: 'weekly-1', ...data };
    });
    const service = new SchedulingService(prisma as any);

    await service.updateWeeklySchedule('weekly-1', validWeeklyPayload({ startTime: '08:00', endTime: '09:00', active: undefined }), 'actor-1');

    expect(tx.weeklySchedule.update).toHaveBeenCalledWith({
      where: { id: 'weekly-1' },
      data: expect.objectContaining({ teachingAssignmentId: 'assignment-1', startTime: '08:00', endTime: '09:00', active: false })
    });
    expect(events.indexOf('weekly.lock')).toBeLessThan(events.indexOf('year.lock'));
    expect(events.indexOf('year.lock')).toBeLessThan(events.indexOf('semester.lock'));
    expect(events.indexOf('semester.lock')).toBeLessThan(events.indexOf('assignment.lock'));
    expect(events.indexOf('assignment.lock')).toBeLessThan(events.indexOf('weekly.update'));
  });

  it.each([
    [validWeeklyPayload({ subjectId: 'subject-2' }), 'TEACHING_ASSIGNMENT_TUPLE_MISMATCH'],
    [validWeeklyPayload({ startTime: '09:00', endTime: '09:00' }), 'SCHEDULE_INVALID_TIME_RANGE'],
    [validWeeklyPayload({ effectiveFrom: '2026-06-30', effectiveTo: '2026-06-14' }), 'SCHEDULE_INVALID_PERIOD'],
    [validWeeklyPayload({ effectiveFrom: '2026-07-01', effectiveTo: '2026-07-01' }), 'SCHEDULE_OUTSIDE_TEACHING_ASSIGNMENT']
  ])('rejects weekly tuple mismatch and invalid ranges', async (payload, expectedCode) => {
    const { prisma } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await expect(service.createWeeklySchedule(payload as any, 'actor-1')).rejects.toMatchObject({ response: { code: expectedCode } });
  });

  it('rejects legacy weekly schedule generation without period or assignment', async () => {
    const { prisma, tx } = makePrisma();
    tx.weeklySchedule.findUnique.mockResolvedValue({
      id: 'legacy-weekly', active: true, classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1',
      academicYearId: null, semesterId: null, teachingAssignmentId: null, dayOfWeek: 0, startTime: '07:00', endTime: '08:00',
      effectiveFrom: new Date('2026-06-14T00:00:00.000Z'), effectiveTo: null
    });
    const service = new SchedulingService(prisma as any);

    await expect(service.generateSessionsFromWeeklySchedule('legacy-weekly', { from: '2026-06-14', to: '2026-06-14' }, 'actor-1'))
      .rejects.toMatchObject({ response: { code: 'SCHEDULE_ACADEMIC_PERIOD_REQUIRED' } });

    tx.weeklySchedule.findUnique.mockResolvedValue({
      id: 'legacy-weekly', active: true, classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1',
      academicYearId: 'year-1', semesterId: 'semester-1', teachingAssignmentId: null, dayOfWeek: 0, startTime: '07:00', endTime: '08:00',
      effectiveFrom: new Date('2026-06-14T00:00:00.000Z'), effectiveTo: null
    });
    await expect(service.generateSessionsFromWeeklySchedule('legacy-weekly', { from: '2026-06-14', to: '2026-06-14' }, 'actor-1'))
      .rejects.toMatchObject({ response: { code: 'SCHEDULE_ASSIGNMENT_REQUIRED' } });
  });

  it('locks weekly schedule then assignment before inserting generated sessions', async () => {
    const { prisma, tx, events } = makePrisma();
    tx.weeklySchedule.findUnique.mockResolvedValue({
      id: 'weekly-1', active: true, classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1', roomId: 'room-1',
      academicYearId: 'year-1', semesterId: 'semester-1', teachingAssignmentId: 'assignment-1', dayOfWeek: 0,
      startTime: '07:15', endTime: '08:45', effectiveFrom: new Date('2026-06-14T00:00:00.000Z'), effectiveTo: new Date('2026-06-30T00:00:00.000Z')
    });
    const service = new SchedulingService(prisma as any);

    const result = await service.generateSessionsFromWeeklySchedule('weekly-1', { from: '2026-06-14', to: '2026-06-14' }, 'actor-1');

    expect(events.indexOf('weekly.lock')).toBeLessThan(events.indexOf('assignment.lock'));
    expect(events.indexOf('assignment.lock')).toBeLessThan(events.indexOf('session.insert'));
    expect(tx.session.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ weeklyScheduleId: 'weekly-1' }) }));
    expect(result).toMatchObject({ generatedCount: 1, skippedCount: 0, generatedIds: ['generated-1'] });
  });

  it('stores direct session assignment provenance and rejects tuple mismatch', async () => {
    const { prisma, tx } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await service.createSession(validSessionPayload(), 'actor-1');
    expect(tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teachingAssignmentId: 'assignment-1',
        startsAt: new Date('2026-06-14T00:15:00.000Z'),
        endsAt: new Date('2026-06-14T01:45:00.000Z'),
        businessDate: new Date('2026-06-14T00:00:00.000Z'),
        status: SessionStatus.SCHEDULED
      })
    });

    await expect(service.createSession(validSessionPayload({ classId: 'class-2' }), 'actor-1')).rejects.toMatchObject({
      response: { code: 'TEACHING_ASSIGNMENT_TUPLE_MISMATCH' }
    });
    await expect(service.createSession(validSessionPayload({
      startsAt: '2026-07-01T07:15',
      endsAt: '2026-07-01T08:45'
    }), 'actor-1')).rejects.toMatchObject({
      response: { code: 'SCHEDULE_OUTSIDE_TEACHING_ASSIGNMENT' }
    });
    await expect(service.createSession(validSessionPayload({
      startsAt: '2026-06-14T23:30',
      endsAt: '2026-06-15T00:30'
    }), 'actor-1')).rejects.toMatchObject({
      response: { code: 'SESSION_CROSS_BUSINESS_DATE_NOT_ALLOWED' }
    });
  });

  it('creates future direct substitute session with source provenance and original excused', async () => {
    const { prisma, tx, events } = makePrisma();
    (tx.teacherLeave.findMany as jest.Mock).mockResolvedValue([{ id: 'leave-1', substituteTeacherId: 'teacher-substitute' }]);
    (tx.user.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id: string } }) => (
      where.id === 'teacher-substitute'
        ? { id: 'teacher-substitute', active: true, role: Role.GURU_MAPEL }
        : { id: 'teacher-1', active: true, role: Role.GURU_MAPEL }
    ));
    (tx.teachingAssignment.findFirst as jest.Mock).mockResolvedValue({ id: 'assignment-substitute' });
    (tx.teachingAssignment.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id: string } }) => (
      where.id === 'assignment-substitute'
        ? { ...assignment, id: 'assignment-substitute', teacherId: 'teacher-substitute' }
        : { ...assignment }
    ));
    const service = new SchedulingService(prisma as any);

    await service.createSession(validSessionPayload(), 'actor-1');

    expect(events).toContain('leave.advisory');
    expect(tx.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teacherId: 'teacher-substitute',
        teachingAssignmentId: 'assignment-substitute',
        substitutionSourceTeacherId: 'teacher-1',
        substitutionSourceAssignmentId: 'assignment-1'
      })
    });
    expect(tx.teacherSessionPresence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId_teacherId: { sessionId: 'session-1', teacherId: 'teacher-1' } }
    }));
  });

  it('rejects future direct substitute missing compatible formal assignment', async () => {
    const { prisma, tx } = makePrisma();
    (tx.teacherLeave.findMany as jest.Mock).mockResolvedValue([{ id: 'leave-1', substituteTeacherId: 'teacher-substitute' }]);
    (tx.user.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id: string } }) => (
      where.id === 'teacher-substitute'
        ? { id: 'teacher-substitute', active: true, role: Role.GURU_MAPEL }
        : { id: 'teacher-1', active: true, role: Role.GURU_MAPEL }
    ));
    (tx.teachingAssignment.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new SchedulingService(prisma as any);

    await expect(service.createSession(validSessionPayload(), 'actor-1')).rejects.toMatchObject({
      response: { code: 'TEACHER_LEAVE_SUBSTITUTE_ASSIGNMENT_REQUIRED' }
    });
    expect(tx.session.create).not.toHaveBeenCalled();
  });

  it('reschedules a substituted session to a no-leave date, restores formal provenance, and preserves actual attendance', async () => {
    const { prisma, tx } = makePrisma();
    tx.session.findUnique.mockResolvedValue({
      id: 'session-1', status: SessionStatus.SCHEDULED, teacherId: 'teacher-substitute', teachingAssignmentId: 'assignment-substitute',
      substitutionSourceTeacherId: 'teacher-1', substitutionSourceAssignmentId: 'assignment-1',
      classId: 'class-1', subjectId: 'subject-1', businessDate: new Date('2026-06-14T00:00:00.000Z'),
      startsAt: new Date('2026-06-14T00:00:00.000Z'), endsAt: new Date('2026-06-14T01:00:00.000Z'),
      schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
    });
    (tx.teacherLeave.findMany as jest.Mock).mockResolvedValue([]);
    (tx.teachingAssignment.findUnique as jest.Mock).mockImplementation(async ({ where }: { where: { id: string } }) => (
      where.id === 'assignment-substitute'
        ? { ...assignment, id: 'assignment-substitute', teacherId: 'teacher-substitute' }
        : { ...assignment }
    ));
    tx.session.update.mockResolvedValue({
      startsAt: new Date('2026-06-14T00:00:00.000Z'), endsAt: new Date('2026-06-14T01:00:00.000Z'),
      schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
    });
    const service = new SchedulingService(prisma as any);

    await service.updateSessionSchedule('session-1', { startsAt: '2026-06-14T07:00', endsAt: '2026-06-14T08:00' }, 'actor-1');

    expect(tx.teacherSessionPresence.deleteMany).toHaveBeenCalledWith({
      where: {
        sessionId: 'session-1', teacherId: 'teacher-1', status: 'EXCUSED_ABSENCE', checkInAt: null, checkOutAt: null
      }
    });
    expect(tx.session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        teacherId: 'teacher-1', teachingAssignmentId: 'assignment-1',
        substitutionSourceTeacherId: null, substitutionSourceAssignmentId: null
      })
    }));
  });

  it('locks source and target date advisory keys once in lexical order when rescheduling across dates', async () => {
    const { prisma, tx, locks } = makePrisma();
    let sessionReadCount = 0;
    tx.session.findUnique.mockImplementation(async () => {
      sessionReadCount += 1;
      return {
        id: 'session-1', status: SessionStatus.SCHEDULED, teachingAssignmentId: 'assignment-1', teachingAssignment: { ...assignment },
        classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1',
        businessDate: new Date('2026-06-15T00:00:00.000Z'), startsAt: new Date('2026-06-15T00:00:00.000Z'), endsAt: new Date('2026-06-15T01:00:00.000Z'),
        schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
      };
    });
    tx.session.update.mockResolvedValue({
      startsAt: new Date('2026-06-14T00:00:00.000Z'), endsAt: new Date('2026-06-14T01:00:00.000Z'),
      schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
    });
    const service = new SchedulingService(prisma as any);

    await service.updateSessionSchedule('session-1', { startsAt: '2026-06-14T07:00', endsAt: '2026-06-14T08:00' }, 'actor-1');

    expect(locks.filter((lock) => lock.kind === 'advisory').map((lock) => lock.value)).toEqual([
      'teacher-leave:teacher-1:2026-06-14',
      'teacher-leave:teacher-1:2026-06-15'
    ]);
  });

  it('locks one source/target advisory key for same-date rescheduling', async () => {
    const { prisma, tx, locks } = makePrisma();
    tx.session.findUnique.mockResolvedValue({
      id: 'session-1', status: SessionStatus.SCHEDULED, teachingAssignmentId: 'assignment-1', teachingAssignment: { ...assignment },
      classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1',
      businessDate: new Date('2026-06-14T00:00:00.000Z'), startsAt: new Date('2026-06-14T00:00:00.000Z'), endsAt: new Date('2026-06-14T01:00:00.000Z'),
      schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
    });
    tx.session.update.mockResolvedValue({
      startsAt: new Date('2026-06-14T00:00:00.000Z'), endsAt: new Date('2026-06-14T01:00:00.000Z'),
      schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
    });
    const service = new SchedulingService(prisma as any);

    await service.updateSessionSchedule('session-1', { startsAt: '2026-06-14T07:00', endsAt: '2026-06-14T08:00' }, 'actor-1');

    expect(locks.filter((lock) => lock.kind === 'advisory').map((lock) => lock.value)).toEqual([
      'teacher-leave:teacher-1:2026-06-14'
    ]);
  });

  it('locks academic hierarchy and assignment before session reread, then reschedules', async () => {
    const { prisma, tx, events } = makePrisma();
    let sessionReadCount = 0;
    tx.session.findUnique.mockImplementation(async () => {
      sessionReadCount += 1;
      events.push(sessionReadCount === 1 ? 'session.preread' : 'session.read');
      return {
        id: 'session-1', status: SessionStatus.SCHEDULED, teachingAssignmentId: 'assignment-1', teachingAssignment: { ...assignment },
        classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1',
        businessDate: new Date('2026-06-14T00:00:00.000Z'), startsAt: new Date('2026-06-14T00:00:00.000Z'), endsAt: new Date('2026-06-14T01:00:00.000Z'),
        schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
      };
    });
    tx.session.update.mockImplementation(async () => {
      events.push('session.update');
      return {
        startsAt: new Date('2026-06-14T00:00:00.000Z'), endsAt: new Date('2026-06-14T01:00:00.000Z'),
        schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
      };
    });
    const service = new SchedulingService(prisma as any);

    await service.updateSessionSchedule('session-1', { startsAt: '2026-06-14T07:00', endsAt: '2026-06-14T08:00' }, 'actor-1');

    const sessionLock = tx.$queryRaw.mock.calls.find(([query]) => {
      const strings = (query as { strings?: readonly string[] }).strings?.join('?') ?? '';
      return strings.includes('SELECT "id" FROM "Session"') && strings.includes('FOR UPDATE');
    });
    expect(sessionLock).toBeDefined();
    expect(events.indexOf('session.preread')).toBeLessThan(events.indexOf('year.lock'));
    expect(events.indexOf('year.lock')).toBeLessThan(events.indexOf('semester.lock'));
    expect(events.indexOf('semester.lock')).toBeLessThan(events.indexOf('assignment.lock'));
    expect(events.indexOf('assignment.lock')).toBeLessThan(events.indexOf('session.lock'));
    expect(events.indexOf('session.lock')).toBeLessThan(events.indexOf('session.read'));
    expect(events.indexOf('session.read')).toBeLessThan(events.indexOf('session.update'));
    expect(tx.session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessDate: new Date('2026-06-14T00:00:00.000Z') })
    }));
  });

  it.each([
    ['business date', { businessDate: new Date('2026-06-15T00:00:00.000Z') }],
    ['start time', { startsAt: new Date('2026-06-14T00:30:00.000Z') }],
    ['end time', { endsAt: new Date('2026-06-14T01:30:00.000Z') }]
  ])('rejects a locked reread whose %s changed before rescheduling', async (_field, changed) => {
    const { prisma, tx } = makePrisma();
    let reads = 0;
    const original = {
      id: 'session-1', status: SessionStatus.SCHEDULED, teacherId: 'teacher-1', teachingAssignmentId: 'assignment-1',
      substitutionSourceTeacherId: null, substitutionSourceAssignmentId: null,
      businessDate: new Date('2026-06-14T00:00:00.000Z'), startsAt: new Date('2026-06-14T00:00:00.000Z'), endsAt: new Date('2026-06-14T01:00:00.000Z'),
      classId: 'class-1', subjectId: 'subject-1', teachingAssignment: { ...assignment },
      schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
    };
    tx.session.findUnique.mockImplementation(async () => ({ ...(reads++ === 0 ? original : { ...original, ...changed }) }));
    const service = new SchedulingService(prisma as any);

    await expect(service.updateSessionSchedule('session-1', { startsAt: '2026-06-14T07:00', endsAt: '2026-06-14T08:00' }, 'actor-1'))
      .rejects.toMatchObject({ response: { code: 'SESSION_STATE_CHANGED' } });
    expect(tx.session.update).not.toHaveBeenCalled();
    expect(tx.teacherSessionPresence.upsert).not.toHaveBeenCalled();
    expect(tx.teacherSessionPresence.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects generation after assignment or semester end before idempotent skipping', async () => {
    const { prisma, tx } = makePrisma();
    tx.weeklySchedule.findUnique.mockResolvedValue({
      id: 'weekly-1', active: true, classId: 'class-1', subjectId: 'subject-1', teacherId: 'teacher-1', roomId: null,
      academicYearId: 'year-1', semesterId: 'semester-1', teachingAssignmentId: 'assignment-1', dayOfWeek: 0,
      startTime: '07:15', endTime: '08:45', effectiveFrom: new Date('2026-06-14T00:00:00.000Z'), effectiveTo: new Date('2026-06-30T00:00:00.000Z')
    });
    const service = new SchedulingService(prisma as any);

    await expect(service.generateSessionsFromWeeklySchedule('weekly-1', { from: '2026-07-05', to: '2026-07-05' }, 'actor-1'))
      .rejects.toMatchObject({ response: { code: 'SCHEDULE_GENERATION_OUTSIDE_PERIOD' } });
  });

  it('uses Jakarta calendar dates for Date semester bounds at UTC boundary instants', async () => {
    const { prisma, tx } = makePrisma();
    tx.semester.findUnique.mockResolvedValue({
      ...period,
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-06-30T16:59:59.000Z')
    });
    const service = new SchedulingService(prisma as any);

    await service.createTeachingAssignment(validAssignmentPayload(), 'actor-1');

    expect(tx.teachingAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ effectiveTo: new Date('2026-06-30T00:00:00.000Z') })
    });
  });

  it('accepts July 1 schedule when semester Date starts at Jakarta midnight', async () => {
    const { prisma, tx } = makePrisma();
    tx.semester.findUnique.mockResolvedValue({
      ...period,
      startsAt: new Date('2026-06-30T17:00:00.000Z'),
      endsAt: new Date('2026-07-01T17:00:00.000Z')
    });
    tx.teachingAssignment.findUnique.mockResolvedValue({
      ...assignment,
      effectiveFrom: new Date('2026-06-30T17:00:00.000Z'),
      effectiveTo: new Date('2026-07-01T17:00:00.000Z')
    });
    const service = new SchedulingService(prisma as any);

    await service.createWeeklySchedule(validWeeklyPayload({ effectiveFrom: '2026-07-01', effectiveTo: '2026-07-01' }), 'actor-1');

    expect(tx.weeklySchedule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-07-01T00:00:00.000Z')
      })
    });
  });

  it('rejects cross-business-day rescheduling before provenance validation', async () => {
    const { prisma } = makePrisma();
    const service = new SchedulingService(prisma as any);

    await expect(service.updateSessionSchedule('session-1', { startsAt: '2026-06-14T23:30', endsAt: '2026-06-15T00:30' }, 'actor-1'))
      .rejects.toMatchObject({ response: { code: 'SESSION_CROSS_BUSINESS_DATE_NOT_ALLOWED' } });
  });

  it('rejects legacy direct session rescheduling', async () => {
    const { prisma, tx } = makePrisma();
    tx.session.findUnique.mockResolvedValue({
      id: 'legacy-session', status: SessionStatus.SCHEDULED, teachingAssignment: null, teachingAssignmentId: null,
      schoolClass: { code: 'X-1' }, subject: { name: 'Matematika' }
    });
    const service = new SchedulingService(prisma as any);

    await expect(service.updateSessionSchedule('legacy-session', { startsAt: '2026-06-14T07:00', endsAt: '2026-06-14T08:00' }, 'actor-1'))
      .rejects.toMatchObject({ response: { code: 'SCHEDULE_ASSIGNMENT_REQUIRED' } });
  });
});
