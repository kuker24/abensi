import {
  PrayerType,
  ReconciliationFlagType,
  Role,
  SessionRosterState,
  SessionStatus,
  StudentAttendanceStatus,
  TeacherSessionStatus
} from '@prisma/client';
import { localDateTimeToUtc } from '../../common/business-time';
import { ReconciliationService } from './reconciliation.service';

function atLocal(hour: number, minute = 0) {
  return localDateTimeToUtc('2026-04-26', `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    classId: 'class-1',
    teacherId: 'guru-1',
    startsAt: atLocal(13),
    endsAt: atLocal(15, 30),
    status: SessionStatus.CLOSED,
    rosterState: SessionRosterState.VERIFIED,
    reconciledAt: null,
    schoolClass: { id: 'class-1', code: 'X-1', name: 'X 1' },
    rosters: [{ studentId: 'siswa-roster' }],
    attendances: [{ studentId: 'siswa-roster', status: StudentAttendanceStatus.HADIR }],
    teacherPresence: [{ teacherId: 'guru-1', status: TeacherSessionStatus.HADIR }],
    ...overrides
  };
}

function makePrisma(session: Record<string, unknown>, options: { gateLogs?: unknown[]; prayerLogs?: unknown[]; policy?: unknown; overrides?: unknown[] } = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    session: {
      findUnique: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue(session)
    },
    gateLog: {
      findMany: jest.fn().mockResolvedValue(options.gateLogs ?? [])
    },
    prayerAttendanceLog: {
      findMany: jest.fn().mockResolvedValue(options.prayerLogs ?? [])
    },
    attendancePolicy: {
      findUnique: jest.fn().mockResolvedValue(options.policy ?? {
        requireStudentDhuha: true,
        requireStudentDzuhur: true,
        requireStudentAsharForAfternoon: true,
        asharRequiredClassEndTime: '15:00'
      })
    },
    attendanceOverride: {
      findMany: jest.fn().mockResolvedValue(options.overrides ?? [])
    },
    reconciliationFlag: {
      upsert: jest.fn().mockResolvedValue({})
    },
    auditEntry: {
      create: jest.fn().mockResolvedValue({})
    }
  };
  const prisma = {
    $transaction: jest.fn(async (callback: any, _options?: unknown) => callback(tx))
  };
  return { prisma, tx };
}

describe('ReconciliationService roster history integrity', () => {
  it('membuat anomali BELUM_SCAN_ASHAR dari siswa roster terverifikasi', async () => {
    const { prisma, tx } = makePrisma(makeSession(), {
      gateLogs: [
        { userId: 'siswa-roster', direction: 'IN', tappedAt: atLocal(7) },
        { userId: 'guru-1', direction: 'IN', tappedAt: atLocal(7) }
      ],
      prayerLogs: [
        { studentId: 'siswa-roster', prayerType: PrayerType.DHUHA },
        { studentId: 'siswa-roster', prayerType: PrayerType.DZUHUR }
      ]
    });
    const service = new ReconciliationService(prisma as any);

    const result = await service.reconcileSession('session-1', 'system');

    expect(result).toMatchObject({
      createdFlags: 1,
      rosterState: SessionRosterState.VERIFIED,
      studentReconciliationSkipped: false,
      rosterClassificationCode: null
    });
    expect(tx.reconciliationFlag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        type: ReconciliationFlagType.BELUM_SCAN_ASHAR,
        userId: 'siswa-roster'
      })
    }));
  });

  it('menandai guru TELAT yang membuka sesi tanpa scan gerbang', async () => {
    const { prisma, tx } = makePrisma(makeSession({
      teacherPresence: [{ teacherId: 'guru-1', status: TeacherSessionStatus.TELAT }]
    }));
    const service = new ReconciliationService(prisma as any);

    await service.reconcileSession('session-1');

    expect(tx.reconciliationFlag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        type: ReconciliationFlagType.ANOMALI_BUKA_TANPA_GERBANG,
        userId: 'guru-1'
      })
    }));
  });

  it('uses only snapshot roster IDs and never includes live class enrollments', async () => {
    const session = makeSession({
      schoolClass: { enrollments: [{ studentId: 'siswa-baru' }] },
      attendances: [
        { studentId: 'siswa-roster', status: StudentAttendanceStatus.HADIR },
        { studentId: 'siswa-baru', status: StudentAttendanceStatus.ALPA }
      ]
    });
    const { prisma, tx } = makePrisma(session, {
      gateLogs: [{ userId: 'guru-1', direction: 'IN', tappedAt: atLocal(7) }]
    });
    const service = new ReconciliationService(prisma as any);

    await service.reconcileSession('session-1');

    expect(tx.session.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        rosters: expect.any(Object),
        schoolClass: expect.any(Object)
      })
    }));
    expect(tx.prayerAttendanceLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ studentId: { in: ['siswa-roster'] } })
    }));
    expect(tx.attendanceOverride.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ studentId: { in: ['siswa-roster'] } })
    }));
    expect(tx.reconciliationFlag.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: 'siswa-baru' })
    }));
  });

  it('skips all mapel flags for frozen XI/XII sessions (CARD_NOT_READY)', async () => {
    const { prisma, tx } = makePrisma(makeSession({
      schoolClass: { id: 'class-xii-b', code: 'XII B', name: 'XII B' },
      attendances: [{ studentId: 'siswa-roster', status: StudentAttendanceStatus.ALPA }],
      teacherPresence: [{ teacherId: 'guru-1', status: TeacherSessionStatus.ALPA_MENGAJAR }]
    }));
    const service = new ReconciliationService(prisma as any);

    const result = await service.reconcileSession('session-1', 'system');

    expect(result).toMatchObject({
      createdFlags: 0,
      skipped: true,
      message: 'grade-frozen-card-not-ready',
      gradeFrozen: true,
      studentReconciliationSkipped: true,
      rosterClassificationCode: 'GRADE_FROZEN_CARD_NOT_READY',
      classCode: 'XII B'
    });
    expect(tx.reconciliationFlag.upsert).not.toHaveBeenCalled();
    expect(tx.session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reconciledAt: expect.any(Date) })
    }));
  });

  it('reconciles removed or transferred student retained in snapshot roster', async () => {
    const { prisma, tx } = makePrisma(makeSession({
      attendances: [{ studentId: 'siswa-roster', status: StudentAttendanceStatus.ALPA }]
    }));
    const service = new ReconciliationService(prisma as any);

    await service.reconcileSession('session-1');

    expect(tx.reconciliationFlag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        type: ReconciliationFlagType.ALPA,
        userId: 'siswa-roster'
      })
    }));
  });

  it.each([
    [SessionRosterState.LEGACY_ROSTER_MISSING, 'LEGACY_ROSTER_MISSING'],
    [SessionRosterState.PENDING, 'SESSION_ROSTER_MISSING']
  ])('skips student reconciliation for %s but retains teacher anomaly', async (rosterState, rosterClassificationCode) => {
    const { prisma, tx } = makePrisma(makeSession({
      rosterState,
      rosters: [{ studentId: 'siswa-roster' }],
      attendances: [{ studentId: 'siswa-roster', status: StudentAttendanceStatus.ALPA }],
      teacherPresence: [{ teacherId: 'guru-1', status: TeacherSessionStatus.ALPA_MENGAJAR }]
    }));
    const service = new ReconciliationService(prisma as any);

    const result = await service.reconcileSession('session-1');

    expect(result).toMatchObject({
      rosterState,
      studentReconciliationSkipped: true,
      rosterClassificationCode
    });
    expect(tx.prayerAttendanceLog.findMany).not.toHaveBeenCalled();
    expect(tx.attendancePolicy.findUnique).not.toHaveBeenCalled();
    expect(tx.attendanceOverride.findMany).not.toHaveBeenCalled();
    expect(tx.gateLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { in: ['guru-1'] } })
    }));
    expect(tx.reconciliationFlag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ type: ReconciliationFlagType.TIDAK_MENGAJAR, userId: 'guru-1' })
    }));
    expect(tx.reconciliationFlag.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: 'siswa-roster' })
    }));
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        after: expect.objectContaining({ rosterState, studentReconciliationSkipped: true, rosterClassificationCode })
      })
    }));
  });

  it('treats empty VERIFIED roster as valid without student queries or flags', async () => {
    const { prisma, tx } = makePrisma(makeSession({
      rosters: [],
      attendances: [],
      teacherPresence: [{ teacherId: 'guru-1', status: TeacherSessionStatus.HADIR }]
    }), {
      gateLogs: [{ userId: 'guru-1', direction: 'IN', tappedAt: atLocal(7) }]
    });
    const service = new ReconciliationService(prisma as any);

    const result = await service.reconcileSession('session-1');

    expect(result).toMatchObject({
      rosterState: SessionRosterState.VERIFIED,
      studentReconciliationSkipped: false,
      createdFlags: 0
    });
    expect(tx.gateLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: { in: ['guru-1'] } })
    }));
    expect(tx.prayerAttendanceLog.findMany).not.toHaveBeenCalled();
    expect(tx.attendancePolicy.findUnique).not.toHaveBeenCalled();
    expect(tx.attendanceOverride.findMany).not.toHaveBeenCalled();
    expect(tx.reconciliationFlag.upsert).not.toHaveBeenCalled();
  });

  it('returns session-not-found after locked reread without writes', async () => {
    const { prisma, tx } = makePrisma(null as any);
    const service = new ReconciliationService(prisma as any);

    const result = await service.reconcileSession('missing-session');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sessionId: 'missing-session', createdFlags: 0, message: 'session-not-found' });
    expect(tx.session.update).not.toHaveBeenCalled();
    expect(tx.reconciliationFlag.upsert).not.toHaveBeenCalled();
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it('locks then skips already reconciled session without flags or audit', async () => {
    const { prisma, tx } = makePrisma(makeSession({ reconciledAt: atLocal(16) }));
    const service = new ReconciliationService(prisma as any);

    const result = await service.reconcileSession('session-1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ skipped: true, message: 'already-reconciled', createdFlags: 0 });
    expect(tx.gateLog.findMany).not.toHaveBeenCalled();
    expect(tx.session.update).not.toHaveBeenCalled();
    expect(tx.reconciliationFlag.upsert).not.toHaveBeenCalled();
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it('rolls back marker and audit when flag persistence fails', async () => {
    const { prisma, tx } = makePrisma(makeSession({
      teacherPresence: [{ teacherId: 'guru-1', status: TeacherSessionStatus.ALPA_MENGAJAR }]
    }));
    tx.reconciliationFlag.upsert.mockRejectedValue(new Error('flag write failed'));
    const service = new ReconciliationService(prisma as any);

    await expect(service.reconcileSession('session-1')).rejects.toThrow('flag write failed');

    expect(tx.session.update).not.toHaveBeenCalled();
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });

  it('uses a longer interactive transaction timeout for reconcileSession', async () => {
    const { prisma } = makePrisma(makeSession());
    const service = new ReconciliationService(prisma as any);

    await service.reconcileSession('session-1');

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ maxWait: 5_000, timeout: 30_000 })
    );
  });

  it('processes pending reconciliation in a bounded batch', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      id: `session-${index + 1}`,
      status: SessionStatus.CLOSED,
      reconciledAt: null,
      closedAt: new Date(`2026-04-26T0${index + 1}:00:00.000Z`)
    }));
    const prisma = {
      session: { findMany: jest.fn().mockResolvedValue(rows) },
      $transaction: jest.fn()
    };
    const service = new ReconciliationService(prisma as any);
    jest.spyOn(service, 'reconcileSession').mockImplementation(async (sessionId: string) => ({
      sessionId,
      createdFlags: 0,
      rosterState: SessionRosterState.VERIFIED,
      studentReconciliationSkipped: false,
      rosterClassificationCode: null,
      gradeFrozen: false,
      classCode: 'X-1'
    }));

    const result = await service.runPendingReconciliation('worker:test');

    expect(prisma.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 25,
      orderBy: { closedAt: 'asc' }
    }));
    expect(result).toEqual(expect.objectContaining({
      pending: 3,
      batchSize: 25,
      processed: [
        expect.objectContaining({ sessionId: 'session-1', createdFlags: 0 }),
        expect.objectContaining({ sessionId: 'session-2', createdFlags: 0 }),
        expect.objectContaining({ sessionId: 'session-3', createdFlags: 0 })
      ]
    }));
  });

  it('keeps auto-missed PENDING and exposes skipped roster reconciliation result', async () => {
    const session = {
      id: 'session-missed',
      teacherId: 'guru-1',
      startsAt: atLocal(7),
      status: SessionStatus.SCHEDULED,
      teacher: { id: 'guru-1', fullName: 'Guru Mapel' },
      schoolClass: { code: 'X-1', name: 'X 1' },
      subject: { name: 'Matematika' }
    };
    const tx = {
      session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      teacherSessionPresence: { upsert: jest.fn().mockResolvedValue({}) },
      notification: { createMany: jest.fn().mockResolvedValue({}) },
      auditEntry: { create: jest.fn().mockResolvedValue({}) },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) }
    };
    const prisma = {
      geofencePolicy: { findUnique: jest.fn().mockResolvedValue({ autoMissedGraceMinutes: 15 }) },
      session: { findMany: jest.fn().mockResolvedValue([session]) },
      teacherLeave: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback) => callback(tx))
    };
    const service = new ReconciliationService(prisma as any);
    jest.spyOn(service, 'reconcileSession').mockResolvedValue({
      sessionId: session.id,
      createdFlags: 0,
      rosterState: SessionRosterState.PENDING,
      studentReconciliationSkipped: true,
      rosterClassificationCode: 'SESSION_ROSTER_MISSING',
      gradeFrozen: false,
      classCode: 'X-1'
    });

    const result = await service.runAutoMissedSessions('worker:test');

    expect(tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reconciledAt: null })
    }));
    expect(result.processed).toEqual([expect.objectContaining({
      sessionId: session.id,
      reconciliation: expect.objectContaining({
        rosterState: SessionRosterState.PENDING,
        studentReconciliationSkipped: true,
        rosterClassificationCode: 'SESSION_ROSTER_MISSING'
      })
    })]);
  });

  it('preserves existing auto-missed state-conflict guard', async () => {
    const session = {
      id: 'session-race',
      teacherId: 'guru-1',
      startsAt: atLocal(7),
      status: SessionStatus.SCHEDULED,
      teacher: { id: 'guru-1', fullName: 'Guru Mapel' },
      schoolClass: { code: 'X-1', name: 'X 1' },
      subject: { name: 'Matematika' }
    };
    const tx = {
      session: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      teacherSessionPresence: { upsert: jest.fn() },
      notification: { createMany: jest.fn() },
      auditEntry: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) }
    };
    const prisma = {
      geofencePolicy: { findUnique: jest.fn().mockResolvedValue({ autoMissedGraceMinutes: 15 }) },
      session: { findMany: jest.fn().mockResolvedValue([session]) },
      teacherLeave: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback) => callback(tx))
    } as any;
    const service = new ReconciliationService(prisma);

    const result = await service.runAutoMissedSessions('worker:test');

    expect(result.processed).toEqual([{ sessionId: 'session-race', skipped: true, reason: 'SESSION_STATE_CONFLICT' }]);
    expect(tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'session-race', status: SessionStatus.SCHEDULED }
    }));
    expect(tx.teacherSessionPresence.upsert).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(tx.auditEntry.create).not.toHaveBeenCalled();
  });
});
