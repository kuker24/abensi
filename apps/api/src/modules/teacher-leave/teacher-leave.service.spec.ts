import { BadRequestException, ConflictException } from '@nestjs/common';
import { Role, SessionStatus, TeacherLeaveStatus, TeacherSessionStatus } from '@prisma/client';
import { writeAudit } from '../../common/audit-log';
import { TeacherLeaveService } from './teacher-leave.service';

jest.mock('../../common/audit-log', () => ({ writeAudit: jest.fn().mockResolvedValue(undefined) }));

const leave: {
  id: string;
  teacherId: string;
  date: Date;
  status: TeacherLeaveStatus;
  teacher: { id: string; fullName: string };
} = {
  id: 'leave-1',
  teacherId: 'teacher-original',
  date: new Date('2026-06-14T00:00:00.000Z'),
  status: TeacherLeaveStatus.PENDING,
  teacher: { id: 'teacher-original', fullName: 'Guru Asal' }
};

const originalAssignment = {
  academicYearId: 'year-1',
  semesterId: 'semester-1'
};

function scheduledSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    teacherId: 'teacher-original',
    classId: 'class-1',
    subjectId: 'subject-1',
    businessDate: new Date('2026-06-14T00:00:00.000Z'),
    startsAt: new Date('2026-06-14T00:15:00.000Z'),
    endsAt: new Date('2026-06-14T01:45:00.000Z'),
    status: SessionStatus.SCHEDULED,
    teachingAssignmentId: 'assignment-original',
    teachingAssignment: { ...originalAssignment },
    ...overrides
  };
}

function rawSqlText(query: unknown) {
  const strings = (query as { strings?: readonly string[] }).strings;
  return strings ? strings.join('?') : '';
}

function rawSqlValue(query: unknown, position = 0) {
  return (query as { values?: unknown[] }).values?.[position];
}

function makePrisma() {
  const events: string[] = [];
  const tx = {
    $queryRaw: jest.fn(async (query: unknown) => {
      const sql = rawSqlText(query);
      const id = rawSqlValue(query);
      if (sql.includes('SELECT "id" FROM "TeacherLeave"')) events.push('leave.lock');
      if (sql.includes('pg_advisory_xact_lock')) events.push('leave.advisory');
      if (sql.includes('SELECT "id" FROM "User"')) events.push('user.lock');
      if (sql.includes('SELECT "id" FROM "AcademicYear"')) events.push(`year.lock:${id}`);
      if (sql.includes('SELECT "id" FROM "Semester"')) events.push(`semester.lock:${id}`);
      if (sql.includes('SELECT "id" FROM "Session"')) events.push(`session.lock:${id}`);
      if (sql.includes('SELECT "id" FROM "TeachingAssignment"')) events.push(`assignment.lock:${id}`);
      return [];
    }),
    user: {
      findUnique: jest.fn(async () => {
        events.push('user.read');
        return { id: 'teacher-substitute', active: true, role: Role.GURU_MAPEL };
      })
    },
    teacherLeave: {
      findUnique: jest.fn(async () => {
        events.push('leave.read');
        return { ...leave };
      }),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async ({ data }) => ({
        ...leave,
        ...data,
        teacher: { id: 'teacher-original', fullName: 'Guru Asal' },
        substituteTeacher: data.substituteTeacherId ? { id: data.substituteTeacherId, fullName: 'Guru Pengganti' } : null
      }))
    },
    session: {
      findMany: jest.fn(async (args) => {
        events.push(args.where.id ? 'sessions.reread' : 'sessions.initial');
        return [scheduledSession()];
      }),
      updateMany: jest.fn(async ({ where }) => {
        events.push(`swap:${where.id}`);
        return { count: 1 };
      })
    },
    teachingAssignment: {
      findFirst: jest.fn(async (_args?: unknown) => {
        events.push('assignment.candidate');
        return { id: 'assignment-substitute' };
      }),
      findMany: jest.fn(async (args?: { select?: Record<string, unknown> }) => {
        if (args?.select && !('teacherId' in args.select)) {
          events.push('assignments.source');
          return [{ id: 'assignment-original', academicYearId: 'year-1', semesterId: 'semester-1' }];
        }
        events.push('assignments.reread');
        return [
          {
            id: 'assignment-original',
            teacherId: 'teacher-original',
            classId: 'class-1',
            subjectId: 'subject-1',
            academicYearId: 'year-1',
            semesterId: 'semester-1',
            active: true,
            effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-06-30T00:00:00.000Z')
          },
          {
            id: 'assignment-substitute',
            teacherId: 'teacher-substitute',
            classId: 'class-1',
            subjectId: 'subject-1',
            academicYearId: 'year-1',
            semesterId: 'semester-1',
            active: true,
            effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-06-30T00:00:00.000Z')
          }
        ];
      })
    },
    teacherSessionPresence: {
      upsert: jest.fn(async () => ({}))
    },
    notification: {
      create: jest.fn(async () => ({}))
    }
  };
  const prisma = {
    $transaction: jest.fn(async (callback) => callback(tx))
  };
  return { prisma, tx, events };
}

async function reviewApproved(service: TeacherLeaveService, substituteTeacherId?: string) {
  return service.review('leave-1', { sub: 'admin-1', role: Role.ADMIN_TU }, {
    status: TeacherLeaveStatus.APPROVED,
    adminNote: 'Pengganti telah dikonfirmasi.',
    ...(substituteTeacherId ? { substituteTeacherId } : {})
  });
}

describe('TeacherLeaveService review serialization and substitute provenance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes approved review without substitute and only records original teacher excused', async () => {
    const { prisma, tx, events } = makePrisma();
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await reviewApproved(service);

    expect(events).toEqual(['leave.lock', 'leave.read', 'leave.advisory', 'sessions.initial']);
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(tx.teachingAssignment.findFirst).not.toHaveBeenCalled();
    expect(tx.teacherSessionPresence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId_teacherId: { sessionId: 'session-1', teacherId: 'teacher-original' } },
      update: { status: TeacherSessionStatus.EXCUSED_ABSENCE }
    }));
  });

  it('locks leave then substitute before exact substitute validation', async () => {
    const { prisma, tx, events } = makePrisma();
    tx.user.findUnique.mockImplementation(async () => {
      events.push('user.read');
      return { id: 'teacher-substitute', active: false, role: Role.GURU_MAPEL };
    });
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await expect(reviewApproved(service, 'teacher-substitute')).rejects.toBeInstanceOf(BadRequestException);

    expect(events).toEqual(['leave.lock', 'leave.read', 'leave.advisory', 'user.lock', 'user.read']);
    expect(tx.session.findMany).not.toHaveBeenCalled();
    expect(tx.teacherLeave.update).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: 'teacher-substitute', active: false, role: Role.GURU_MAPEL }],
    [{ id: 'teacher-substitute', active: true, role: Role.GURU_PIKET }],
    [null]
  ])('rejects inactive, wrong-role, or missing substitute with stable code', async (substitute) => {
    const { prisma, tx } = makePrisma();
    tx.user.findUnique.mockResolvedValue(substitute as any);
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await expect(reviewApproved(service, 'teacher-substitute')).rejects.toMatchObject({
      response: { code: 'TEACHER_LEAVE_SUBSTITUTE_TEACHER_INVALID' }
    });
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  it('rejects self-substitute before user, session, leave, audit, or notification mutation', async () => {
    const { prisma, tx, events } = makePrisma();
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await expect(reviewApproved(service, 'teacher-original')).rejects.toMatchObject({
      response: { code: 'TEACHER_LEAVE_SUBSTITUTE_SELF_NOT_ALLOWED' }
    });

    expect(events).toEqual(['leave.lock', 'leave.read']);
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.session.findMany).not.toHaveBeenCalled();
    expect(tx.teacherLeave.update).not.toHaveBeenCalled();
    expect(tx.teacherSessionPresence.upsert).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it('rejects duplicate approved leave for original teacher and business date', async () => {
    const { prisma, tx, events } = makePrisma();
    (tx.teacherLeave.findFirst as jest.Mock).mockResolvedValue({ id: 'leave-approved' });
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await expect(reviewApproved(service)).rejects.toMatchObject({
      response: { code: 'TEACHER_LEAVE_DATE_ALREADY_APPROVED' }
    });
    expect(events).toEqual(['leave.lock', 'leave.read', 'leave.advisory']);
    expect(tx.teacherLeave.update).not.toHaveBeenCalled();
  });

  it('rejects stale second review from locked reread before mutation', async () => {
    const { prisma, tx, events } = makePrisma();
    tx.teacherLeave.findUnique.mockImplementation(async () => {
      events.push('leave.read');
      return { ...leave, status: TeacherLeaveStatus.APPROVED };
    });
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await expect(reviewApproved(service)).rejects.toMatchObject({
      response: { code: 'TEACHER_LEAVE_ALREADY_REVIEWED' }
    });

    expect(events).toEqual(['leave.lock', 'leave.read']);
    expect(tx.teacherLeave.update).not.toHaveBeenCalled();
    expect(tx.session.findMany).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it('uses shared original teacher/date advisory serialization before substitute and session locks', async () => {
    const { prisma, events } = makePrisma();
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await reviewApproved(service, 'teacher-substitute');

    expect(events.indexOf('leave.advisory')).toBeGreaterThan(events.indexOf('leave.read'));
    expect(events.indexOf('leave.advisory')).toBeLessThan(events.indexOf('user.lock'));
    expect(events.indexOf('user.lock')).toBeLessThan(events.indexOf('session.lock:session-1'));
  });

  it('locks sessions then assignments in deterministic global ID order before swaps', async () => {
    const { prisma, tx, events } = makePrisma();
    const first = scheduledSession({ id: 'session-a', classId: 'class-a' });
    const second = scheduledSession({ id: 'session-z', classId: 'class-z' });
    tx.session.findMany.mockImplementation(async (args) => {
      events.push(args.where.id ? 'sessions.reread' : 'sessions.initial');
      return [first, second];
    });
    tx.teachingAssignment.findFirst.mockImplementation(async (args?: unknown) => {
      const candidateId = (args as { where: { classId: string } }).where.classId === 'class-a' ? 'assignment-z' : 'assignment-a';
      events.push(`assignment.candidate:${candidateId}`);
      return { id: candidateId };
    });
    tx.teachingAssignment.findMany.mockImplementation(async (args?: { select?: Record<string, unknown> }) => {
      if (args?.select && !('teacherId' in args.select)) {
        events.push('assignments.source');
        return [{ id: 'assignment-original', academicYearId: 'year-1', semesterId: 'semester-1' }];
      }
      events.push('assignments.reread');
      return [
        {
          id: 'assignment-original', teacherId: 'teacher-original', classId: 'class-a', subjectId: 'subject-1',
          academicYearId: 'year-1', semesterId: 'semester-1', active: true,
          effectiveFrom: new Date('2026-06-01T00:00:00.000Z'), effectiveTo: new Date('2026-06-30T00:00:00.000Z')
        },
        {
          id: 'assignment-a', teacherId: 'teacher-substitute', classId: 'class-z', subjectId: 'subject-1',
          academicYearId: 'year-1', semesterId: 'semester-1', active: true,
          effectiveFrom: new Date('2026-06-01T00:00:00.000Z'), effectiveTo: new Date('2026-06-30T00:00:00.000Z')
        },
        {
          id: 'assignment-z', teacherId: 'teacher-substitute', classId: 'class-a', subjectId: 'subject-1',
          academicYearId: 'year-1', semesterId: 'semester-1', active: true,
          effectiveFrom: new Date('2026-06-01T00:00:00.000Z'), effectiveTo: new Date('2026-06-30T00:00:00.000Z')
        }
      ];
    });
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await reviewApproved(service, 'teacher-substitute');

    expect(events).toEqual([
      'leave.lock', 'leave.read', 'leave.advisory', 'user.lock', 'user.read', 'sessions.initial',
      'assignments.source', 'assignment.candidate:assignment-z', 'assignment.candidate:assignment-a',
      'year.lock:year-1', 'semester.lock:semester-1',
      'assignment.lock:assignment-a', 'assignment.lock:assignment-original', 'assignment.lock:assignment-z',
      'session.lock:session-a', 'session.lock:session-z', 'sessions.reread', 'assignments.reread',
      'swap:session-a', 'swap:session-z'
    ]);
    expect(tx.session.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'session-a',
        status: SessionStatus.SCHEDULED,
        teacherId: 'teacher-original',
        teachingAssignmentId: 'assignment-original',
        substitutionSourceTeacherId: undefined,
        substitutionSourceAssignmentId: undefined,
        businessDate: new Date('2026-06-14T00:00:00.000Z')
      },
      data: {
        teacherId: 'teacher-substitute',
        teachingAssignmentId: 'assignment-z',
        substitutionSourceTeacherId: 'teacher-original',
        substitutionSourceAssignmentId: 'assignment-original'
      }
    });
    expect(tx.session.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'session-z',
        status: SessionStatus.SCHEDULED,
        teacherId: 'teacher-original',
        teachingAssignmentId: 'assignment-original',
        substitutionSourceTeacherId: undefined,
        substitutionSourceAssignmentId: undefined,
        businessDate: new Date('2026-06-14T00:00:00.000Z')
      },
      data: {
        teacherId: 'teacher-substitute',
        teachingAssignmentId: 'assignment-a',
        substitutionSourceTeacherId: 'teacher-original',
        substitutionSourceAssignmentId: 'assignment-original'
      }
    });
  });

  it.each([
    ['owner', scheduledSession({ teacherId: 'teacher-changed' })],
    ['provenance', scheduledSession({ teachingAssignmentId: 'assignment-changed' })],
    ['status', scheduledSession({ status: SessionStatus.OPEN })],
    ['business date', scheduledSession({ businessDate: new Date('2026-06-15T00:00:00.000Z') })],
    ['start time', scheduledSession({ startsAt: new Date('2026-06-14T00:30:00.000Z') })],
    ['end time', scheduledSession({ endsAt: new Date('2026-06-14T01:30:00.000Z') })]
  ])('rejects %s changed after session lock without mutation', async (_field, changedSession) => {
    const { prisma, tx } = makePrisma();
    tx.session.findMany.mockImplementation(async (args) => (args.where.id ? [changedSession] : [scheduledSession()]));
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await expect(reviewApproved(service, 'teacher-substitute')).rejects.toMatchObject({
      response: { code: 'TEACHER_LEAVE_SESSION_STATE_CHANGED' }
    });

    expect(tx.teacherLeave.update).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it('rejects missing formal assignment before leave mutation', async () => {
    const { prisma, tx } = makePrisma();
    tx.teachingAssignment.findFirst.mockResolvedValue(null as any);
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await expect(reviewApproved(service, 'teacher-substitute')).rejects.toMatchObject({
      response: { code: 'TEACHER_LEAVE_SUBSTITUTE_ASSIGNMENT_REQUIRED' }
    });

    expect(tx.teacherLeave.update).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it('never swaps missed sessions while recording original teacher excused', async () => {
    const { prisma, tx } = makePrisma();
    tx.session.findMany.mockResolvedValue([scheduledSession({ id: 'missed-1', status: SessionStatus.MISSED })]);
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await reviewApproved(service, 'teacher-substitute');

    expect(tx.teacherSessionPresence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId_teacherId: { sessionId: 'missed-1', teacherId: 'teacher-original' } }
    }));
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  it('rejects conditional swap race and rolls transaction work back', async () => {
    const { prisma, tx } = makePrisma();
    tx.session.updateMany.mockResolvedValue({ count: 0 });
    const service = new TeacherLeaveService(prisma as any, { notifyRoles: jest.fn() } as any);

    await expect(reviewApproved(service, 'teacher-substitute')).rejects.toBeInstanceOf(ConflictException);
    await expect(reviewApproved(service, 'teacher-substitute')).rejects.toMatchObject({
      response: { code: 'TEACHER_LEAVE_SESSION_STATE_CHANGED' }
    });
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});
