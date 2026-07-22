import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AttendanceConfirmationSource, AttendanceReviewState, Role, RosterCaptureSource, SessionJournalCompletionStatus, SessionRosterState, SessionStatus, StudentAttendanceStatus, TeacherSessionStatus } from '@prisma/client';
import { AttendanceClassService } from './attendance-class.service';

function makeService(
  sessionOverrides: Record<string, unknown> = {},
  existingPresence: Record<string, unknown> | null = null,
  geofencePolicy: Record<string, unknown> | null = null
) {
  const now = new Date();
  const session = {
    id: 'session-1',
    teacherId: 'guru-1',
    classId: 'class-1',
    startsAt: new Date(now.getTime() - 5 * 60 * 1000),
    endsAt: new Date(now.getTime() + 30 * 60 * 1000),
    businessDate: new Date(Date.UTC(2026, 5, 14)),
    status: SessionStatus.OPEN,
    rosterState: SessionRosterState.VERIFIED,
    ...sessionOverrides
  };
  const openedSession = { ...session, status: SessionStatus.OPEN, openedAt: now, rosterState: SessionRosterState.VERIFIED };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    session: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(openedSession),
      findUnique: jest.fn().mockResolvedValue(session),
      findUniqueOrThrow: jest.fn().mockResolvedValue(session)
    },
    classEnrollment: {
      findMany: jest.fn().mockResolvedValue([{ id: 'enrollment-1', studentId: 'siswa-1', active: true, academicYearId: null, semesterId: null, student: { id: 'siswa-1', fullName: 'Siswa Satu', username: 'siswa1' }, schoolClass: { id: 'class-1', code: 'X-1', name: 'X 1' } }])
    },
    sessionRoster: {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }])
    },
    sessionJournal: {
      findUnique: jest.fn().mockResolvedValue({ id: 'journal-1', sessionId: 'session-1' })
    },
    studentAttendance: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 })
    },
    teacherSessionPresence: {
      findUnique: jest.fn().mockResolvedValue(existingPresence),
      upsert: jest.fn().mockImplementation(async ({ create, update }) => ({ id: 'presence-1', ...create, ...update }))
    },
    auditEntry: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn().mockResolvedValue({ id: 'audit-1' })
    }
  };
  const prisma = {
    session: {
      findUnique: jest.fn().mockResolvedValue(session)
    },
    geofencePolicy: {
      findUnique: jest.fn().mockResolvedValue(geofencePolicy)
    },
    $transaction: jest.fn((callback) => callback(tx))
  } as any;

  return { service: new AttendanceClassService(prisma), prisma, tx, session };
}

const guru = { sub: 'guru-1', role: Role.GURU_MAPEL };
const TEST_SCHOOL_LOCATION = { latitude: -6.2, longitude: 106.816666 };

function browserGeo(overrides: Partial<{ latitude: number; longitude: number; accuracyMeter: number; capturedAt: string; source: 'browser_geolocation' }> = {}) {
  return {
    ...TEST_SCHOOL_LOCATION,
    accuracyMeter: 12,
    capturedAt: new Date().toISOString(),
    source: 'browser_geolocation' as const,
    ...overrides
  };
}

function rawQueryText(query: unknown) {
  const strings = (query as { strings?: readonly string[] }).strings;
  return strings?.join('?') ?? String(query);
}

describe('AttendanceClassService record attendance policy', () => {
  it('menolak presensi siswa di luar roster kelas', async () => {
    const session = { id: 'session-1', teacherId: 'guru-1', classId: 'class-1', startsAt: new Date(), businessDate: new Date(Date.UTC(2026, 5, 14)), status: SessionStatus.OPEN, rosterState: SessionRosterState.VERIFIED };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      sessionRoster: { findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }]) },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      $transaction: jest.fn(async (callback) => callback(prisma))
    } as any;
    const service = new AttendanceClassService(prisma);

    await expect(service.recordAttendance('session-1', guru, { items: [{ studentId: 'siswa-luar', status: 'HADIR' as any, confirm: true }] })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'attendance.class.rejected_out_of_roster' }) }));
  });
});


describe('AttendanceClassService explicit attendance review', () => {
  const session = {
    id: 'session-1',
    teacherId: 'guru-1',
    classId: 'class-1',
    startsAt: new Date('2026-06-14T01:00:00.000Z'),
    endsAt: new Date('2026-06-14T02:00:00.000Z'),
    businessDate: new Date(Date.UTC(2026, 5, 14)),
    status: SessionStatus.OPEN,
    rosterState: SessionRosterState.VERIFIED
  };

  function makeRecordService(existingUpdatedAt = new Date('2026-06-14T01:05:00.000Z'), policyOverrides: Record<string, unknown> = {}) {
    const tx = {
      session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      studentAttendance: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'attendance-1',
          sessionId: 'session-1',
          studentId: 'siswa-1',
          status: StudentAttendanceStatus.ALPA,
          reviewState: AttendanceReviewState.DEFAULTED,
          updatedAt: existingUpdatedAt
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'attendance-1',
          sessionId: 'session-1',
          studentId: 'siswa-1',
          status: StudentAttendanceStatus.HADIR,
          reviewState: AttendanceReviewState.CONFIRMED,
          updatedAt: new Date('2026-06-14T01:06:00.000Z')
        }),
        create: jest.fn()
      },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      sessionRoster: { findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }]) },
      attendancePolicy: { findUnique: jest.fn().mockResolvedValue({
        requireStudentClassEligibility: false,
        requireStudentGateInBeforeClass: false,
        requireStudentDhuha: false,
        requireStudentDzuhur: false,
        allowManualOverride: false,
        dhuhaStartTime: '07:00',
        dzuhurStartTime: '11:45',
        ...policyOverrides
      }) },
      gateLog: { findMany: jest.fn().mockResolvedValue([]) },
      prayerAttendanceLog: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceOverride: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    return { service: new AttendanceClassService(prisma), prisma, tx, existingUpdatedAt };
  }

  it('save tanpa baris eksplisit tidak mengonfirmasi ALPA default', async () => {
    const tx = { auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) } };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      sessionRoster: { findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }]) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    const service = new AttendanceClassService(prisma);

    const result = await service.recordAttendance('session-1', guru, { items: [] });

    expect(result.updated).toBe(0);
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'class.attendance.noop_save' })
    }));
  });

  it('mengonfirmasi tepat satu baris yang eksplisit berubah', async () => {
    const { service, tx, existingUpdatedAt } = makeRecordService();

    const result = await service.recordAttendance('session-1', guru, {
      items: [{ studentId: 'siswa-1', status: StudentAttendanceStatus.HADIR, updatedAt: existingUpdatedAt.toISOString(), confirm: true }]
    });

    expect(result.updated).toBe(1);
    expect(tx.studentAttendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: StudentAttendanceStatus.HADIR,
        reviewState: AttendanceReviewState.CONFIRMED,
        confirmationSource: AttendanceConfirmationSource.MANUAL_SINGLE,
        confirmedById: 'guru-1'
      })
    }));
  });

  it('menolak layar stale agar tidak menimpa presensi terbaru', async () => {
    const { service, tx } = makeRecordService(new Date('2026-06-14T01:07:00.000Z'));

    await expect(service.recordAttendance('session-1', guru, {
      items: [{ studentId: 'siswa-1', status: StudentAttendanceStatus.HADIR, updatedAt: '2026-06-14T01:05:00.000Z', confirm: true }]
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.studentAttendance.updateMany).not.toHaveBeenCalled();
  });

  it('tetap menyimpan HADIR meski siswa belum scan gerbang', async () => {
    const { service, tx, prisma, existingUpdatedAt } = makeRecordService(new Date('2026-06-14T01:05:00.000Z'), {
      requireStudentClassEligibility: true,
      requireStudentGateInBeforeClass: true
    });

    const result = await service.recordAttendance('session-1', guru, {
      items: [{ studentId: 'siswa-1', status: StudentAttendanceStatus.HADIR, updatedAt: existingUpdatedAt.toISOString(), confirm: true }]
    });

    expect(prisma.gateLog.findMany).toHaveBeenCalled();
    expect(result.updated).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.warningCount).toBe(1);
    expect(tx.studentAttendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: StudentAttendanceStatus.HADIR, reviewState: AttendanceReviewState.CONFIRMED })
    }));
  });

  it('tetap menyimpan TELAT meski siswa belum scan sholat', async () => {
    const { service, tx, prisma, existingUpdatedAt } = makeRecordService(new Date('2026-06-14T01:05:00.000Z'), {
      requireStudentClassEligibility: true,
      requireStudentGateInBeforeClass: false,
      requireStudentDhuha: true,
      dhuhaStartTime: '07:00'
    });

    const result = await service.recordAttendance('session-1', guru, {
      items: [{ studentId: 'siswa-1', status: StudentAttendanceStatus.TELAT, updatedAt: existingUpdatedAt.toISOString(), confirm: true }]
    });

    expect(prisma.prayerAttendanceLog.findMany).toHaveBeenCalled();
    expect(result.updated).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.warningCount).toBe(1);
    expect(tx.studentAttendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: StudentAttendanceStatus.TELAT, reviewState: AttendanceReviewState.CONFIRMED })
    }));
  });

  it('konfirmasi massal hadir tetap mengubah baris DEFAULTED meski scan belum lengkap', async () => {
    const tx = {
      studentAttendance: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 })
      },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      sessionRoster: { findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }, { studentId: 'siswa-2' }]) },
      attendancePolicy: { findUnique: jest.fn().mockResolvedValue({
        requireStudentClassEligibility: true,
        requireStudentGateInBeforeClass: true,
        requireStudentDhuha: true,
        requireStudentDzuhur: false,
        allowManualOverride: false,
        dhuhaStartTime: '07:00',
        dzuhurStartTime: '11:45'
      }) },
      gateLog: { findMany: jest.fn().mockResolvedValue([]) },
      prayerAttendanceLog: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceOverride: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    const service = new AttendanceClassService(prisma);

    const result = await service.bulkConfirmPresent('session-1', guru);

    expect(result.updated).toBe(2);
    expect(result.rejectedCount).toBe(0);
    expect(result.warningCount).toBe(2);
    expect(tx.studentAttendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ reviewState: AttendanceReviewState.DEFAULTED }),
      data: expect.objectContaining({ status: StudentAttendanceStatus.HADIR, confirmationSource: AttendanceConfirmationSource.MANUAL_BULK })
    }));
  });

  it('konfirmasi massal ALPA hanya memfinalkan baris DEFAULTED sebagai ALPA', async () => {
    const tx = {
      studentAttendance: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 })
      },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      sessionRoster: { findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }, { studentId: 'siswa-2' }]) },
      attendancePolicy: { findUnique: jest.fn().mockResolvedValue({ requireStudentClassEligibility: false }) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    const service = new AttendanceClassService(prisma);

    const result = await service.bulkConfirmAlpa('session-1', guru);

    expect(result.updated).toBe(2);
    expect(tx.studentAttendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ reviewState: AttendanceReviewState.DEFAULTED }),
      data: expect.objectContaining({ status: StudentAttendanceStatus.ALPA, confirmationSource: AttendanceConfirmationSource.MANUAL_BULK })
    }));
  });
});


describe('AttendanceClassService session roster integrity', () => {
  const openSession = {
    id: 'session-1',
    teacherId: 'guru-1',
    classId: 'class-1',
    startsAt: new Date('2026-06-14T01:00:00.000Z'),
    endsAt: new Date('2026-06-14T02:00:00.000Z'),
    businessDate: new Date(Date.UTC(2026, 5, 14)),
    status: SessionStatus.OPEN,
    rosterState: SessionRosterState.VERIFIED
  };

  it('record attendance permits an authoritative empty verified roster without recapturing', async () => {
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(openSession) },
      sessionRoster: { findMany: jest.fn().mockResolvedValue([]) },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      classEnrollment: { findMany: jest.fn() },
      $transaction: jest.fn((callback) => callback({ auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) } }))
    } as any;
    const service = new AttendanceClassService(prisma);

    const result = await service.recordAttendance('session-1', guru, { items: [] });

    expect(result.updated).toBe(0);
    expect(prisma.classEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('bulk confirmation reports an authoritative empty verified roster', async () => {
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(openSession) },
      sessionRoster: { findMany: jest.fn().mockResolvedValue([]) },
      classEnrollment: { findMany: jest.fn() },
      $transaction: jest.fn()
    } as any;
    const service = new AttendanceClassService(prisma);

    await expect(service.bulkConfirmPresent('session-1', guru)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_ROSTER_EMPTY' })
    });
    expect(prisma.classEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('close rejects legacy missing roster without recapturing', async () => {
    const lockedSession = { ...openSession, endsAt: new Date(Date.now() - 60_000), rosterState: SessionRosterState.LEGACY_ROSTER_MISSING };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      session: { findUniqueOrThrow: jest.fn().mockResolvedValue(lockedSession) },
      sessionJournal: { findUnique: jest.fn().mockResolvedValue({ id: 'journal-1' }) },
      sessionRoster: { findMany: jest.fn() },
      classEnrollment: { findMany: jest.fn() }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(lockedSession) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    const service = new AttendanceClassService(prisma);

    await expect(service.closeSession('session-1', guru, {})).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LEGACY_ROSTER_MISSING' })
    });
    expect(tx.sessionRoster.findMany).not.toHaveBeenCalled();
    expect(tx.classEnrollment.findMany).not.toHaveBeenCalled();
  });

  it('correction rejects legacy missing roster before student membership lookup', async () => {
    const legacySession = { ...openSession, rosterState: SessionRosterState.LEGACY_ROSTER_MISSING };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      session: { findUnique: jest.fn().mockResolvedValue(legacySession) },
      sessionRoster: { findUnique: jest.fn() }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(legacySession) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    const service = new AttendanceClassService(prisma);

    await expect(service.correctAttendance('session-1', 'siswa-1', guru, { status: StudentAttendanceStatus.HADIR, reason: 'Koreksi manual dengan bukti tertulis' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LEGACY_ROSTER_MISSING' })
    });
    expect(tx.sessionRoster.findUnique).not.toHaveBeenCalled();
  });

  it('repair workflow is admin/developer only and requires a quality reason', async () => {
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(openSession) },
      $transaction: jest.fn()
    } as any;
    const service = new AttendanceClassService(prisma);

    await expect(service.repairSessionRoster('session-1', guru, 'Perbaikan roster dengan bukti operator')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.repairSessionRoster('session-1', { sub: 'admin-1', role: Role.ADMIN_TU }, 'singkat')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.repairSessionRoster('session-1', { sub: 'admin-1', role: Role.ADMIN_TU }, 'buktivalid1234')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('summary raises data-integrity error instead of falling back to current enrollment or writing an audit row', async () => {
    const session = {
      id: 'session-1',
      teacherId: 'guru-1',
      status: SessionStatus.OPEN,
      rosterState: SessionRosterState.LEGACY_ROSTER_MISSING,
      openedAt: new Date(),
      closedAt: null,
      attendances: [],
      rosters: [],
      teacherPresence: []
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      $transaction: jest.fn()
    } as any;
    const service = new AttendanceClassService(prisma);

    await expect(service.summary('session-1', guru)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LEGACY_ROSTER_MISSING' })
    });
    await expect(service.summary('session-1', guru)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LEGACY_ROSTER_MISSING' })
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('roster rejects non-SCHEDULED PENDING state without writing repeated read audits', async () => {
    const session = {
      id: 'session-1',
      teacherId: 'guru-1',
      status: SessionStatus.OPEN,
      rosterState: SessionRosterState.PENDING,
      startsAt: new Date(),
      endsAt: new Date(),
      openedAt: new Date(),
      closedAt: null,
      rosters: [],
      attendances: [],
      teacherPresence: []
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      $transaction: jest.fn()
    } as any;
    const service = new AttendanceClassService(prisma);

    await expect(service.roster('session-1', guru)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_ROSTER_MISSING' })
    });
    await expect(service.roster('session-1', guru)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_ROSTER_MISSING' })
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('repair workflow creates explicit backfill roster rows and audits the repair', async () => {
    const session = {
      id: 'session-1',
      teacherId: 'guru-1',
      classId: 'class-1',
      startsAt: new Date('2026-06-14T01:00:00.000Z'),
      businessDate: new Date(Date.UTC(2026, 5, 14)),
      status: SessionStatus.CLOSED,
      rosterState: SessionRosterState.LEGACY_ROSTER_MISSING,
      schoolClass: { id: 'class-1', code: 'X-1', name: 'X 1' }
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue({ ...session, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED })
      },
      sessionRoster: {
        count: jest.fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      classEnrollment: { findMany: jest.fn().mockResolvedValue([]) },
      studentAttendance: {
        findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1', student: { fullName: 'Siswa Satu', username: 'siswa1' } }])
      },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    const service = new AttendanceClassService(prisma);

    const result = await service.repairSessionRoster('session-1', { sub: 'admin-1', role: Role.ADMIN_TU }, 'Perbaikan roster karena data legacy tidak memiliki snapshot');

    expect(result).toEqual({ sessionId: 'session-1', beforeCount: 0, afterCount: 1, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED, fromAttendanceCount: 1, source: 'audited_repair' });
    expect(tx.sessionRoster.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        studentId: 'siswa-1',
        captureSource: 'BACKFILL',
        classCodeSnapshot: 'X-1',
        metadata: expect.objectContaining({ source: 'audited_repair', unverifiable: true })
      })]
    }));
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'session_roster.repaired', reason: 'Perbaikan roster karena data legacy tidak memiliki snapshot' })
    }));
    expect(tx.$queryRaw.mock.calls.map(([query]) => rawQueryText(query))).toEqual([
      'SELECT "id" FROM "Session" WHERE "id" = ? FOR UPDATE'
    ]);
  });
});

describe('AttendanceClassService correction, repair, and MISSED recovery', () => {
  const admin = { sub: 'admin-1', role: Role.ADMIN_TU };
  const picket = { sub: 'piket-1', role: Role.GURU_PIKET };
  const legacySession = {
    id: 'session-1',
    teacherId: 'guru-1',
    classId: 'class-1',
    startsAt: new Date(),
    businessDate: new Date(),
    status: SessionStatus.CLOSED,
    rosterState: SessionRosterState.LEGACY_ROSTER_MISSING,
    schoolClass: { id: 'class-1', code: 'X-1', name: 'X 1' }
  };

  it.each([SessionStatus.SCHEDULED, SessionStatus.MISSED])('rejects %s correction under a session lock', async (status) => {
    const session = { ...legacySession, status, rosterState: SessionRosterState.VERIFIED };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      sessionRoster: { findUnique: jest.fn() }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;

    await expect(new AttendanceClassService(prisma).correctAttendance('session-1', 'siswa-1', guru, {
      status: StudentAttendanceStatus.HADIR,
      reason: 'Koreksi dengan bukti tertulis lengkap'
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.sessionRoster.findUnique).not.toHaveBeenCalled();
  });

  it('allows OPEN owner correction and CLOSED audited correction after lock and reread', async () => {
    const run = async (status: SessionStatus) => {
      const session = { ...legacySession, status, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED };
      const attendance = { id: `attendance-${status}`, status: StudentAttendanceStatus.HADIR, note: null, correctionCount: 1 };
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        session: { findUnique: jest.fn().mockResolvedValue(session) },
        sessionRoster: { findUnique: jest.fn().mockResolvedValue({ sessionId: 'session-1', studentId: 'siswa-1' }) },
        studentAttendance: {
          findUnique: jest.fn().mockResolvedValue({ ...attendance, status: StudentAttendanceStatus.ALPA, note: 'Sebelum koreksi' }),
          upsert: jest.fn().mockResolvedValue(attendance)
        },
        attendanceCorrectionEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
        auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) }
      };
      const prisma = {
        session: { findUnique: jest.fn().mockResolvedValue(session) },
        $transaction: jest.fn((callback) => callback(tx))
      } as any;
      const result = await new AttendanceClassService(prisma).correctAttendance('session-1', 'siswa-1', guru, {
        status: StudentAttendanceStatus.HADIR,
        reason: 'Koreksi dengan bukti tertulis lengkap'
      });
      expect(result).toEqual(attendance);
      expect(tx.$queryRaw.mock.calls.map(([query]) => rawQueryText(query))).toEqual([
        'SELECT "id" FROM "Session" WHERE "id" = ? FOR UPDATE',
        'SELECT "id" FROM "StudentAttendance" WHERE "sessionId" = ? AND "studentId" = ? FOR UPDATE'
      ]);
      expect(tx.attendanceCorrectionEvent.create).toHaveBeenCalled();
      expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: 'class.attendance.corrected' })
      }));
    };

    await run(SessionStatus.OPEN);
    await run(SessionStatus.CLOSED);
  });

  it('rechecks GURU_MAPEL ownership after session lock before attendance write', async () => {
    const preliminarySession = { ...legacySession, status: SessionStatus.OPEN, rosterState: SessionRosterState.VERIFIED, teacherId: 'guru-1' };
    const lockedSession = { ...preliminarySession, teacherId: 'guru-lain' };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      session: { findUnique: jest.fn().mockResolvedValue(lockedSession) },
      sessionRoster: { findUnique: jest.fn() },
      studentAttendance: { upsert: jest.fn() }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(preliminarySession) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;

    await expect(new AttendanceClassService(prisma).correctAttendance('session-1', 'siswa-1', guru, {
      status: StudentAttendanceStatus.HADIR,
      reason: 'Koreksi dengan bukti tertulis lengkap'
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.$queryRaw.mock.calls.map(([query]) => rawQueryText(query))).toEqual([
      'SELECT "id" FROM "Session" WHERE "id" = ? FOR UPDATE'
    ]);
    expect(tx.sessionRoster.findUnique).not.toHaveBeenCalled();
    expect(tx.studentAttendance.upsert).not.toHaveBeenCalled();
  });

  it('marks normal open roster as VERIFIED after effective-date capture', async () => {
    const { service, tx } = makeService({ status: SessionStatus.SCHEDULED, rosterState: SessionRosterState.PENDING });

    await service.openSession('session-1', guru, browserGeo());

    expect(tx.session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { rosterState: SessionRosterState.VERIFIED }
    }));
  });

  it('retains BACKFILLED_UNVERIFIED when opening a SCHEDULED session with existing BACKFILL roster rows', async () => {
    const { service, tx } = makeService({ status: SessionStatus.SCHEDULED, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED });
    tx.sessionRoster.count.mockResolvedValue(1);
    tx.sessionRoster.findMany.mockResolvedValue([{ studentId: 'siswa-1', captureSource: RosterCaptureSource.BACKFILL }]);

    await service.openSession('session-1', guru, browserGeo());

    expect(tx.session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { rosterState: SessionRosterState.BACKFILLED_UNVERIFIED }
    }));
  });

  it('rejects concurrent second repair after locked state reread', async () => {
    const session = { ...legacySession, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      sessionRoster: { count: jest.fn() }
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;

    await expect(new AttendanceClassService(prisma).repairSessionRoster('session-1', admin, 'Perbaikan roster dengan bukti tertulis')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.sessionRoster.count).not.toHaveBeenCalled();
  });

  it('rejects repair for SCHEDULED or already VERIFIED state under session lock', async () => {
    const cases = [
      { session: { ...legacySession, status: SessionStatus.SCHEDULED, rosterState: SessionRosterState.PENDING }, error: BadRequestException },
      { session: { ...legacySession, status: SessionStatus.CLOSED, rosterState: SessionRosterState.VERIFIED }, error: ConflictException }
    ];
    for (const { session, error } of cases) {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        session: { findUnique: jest.fn().mockResolvedValue(session) },
        sessionRoster: { count: jest.fn() }
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;
      await expect(new AttendanceClassService(prisma).repairSessionRoster('session-1', admin, 'Perbaikan roster dengan bukti tertulis')).rejects.toBeInstanceOf(error);
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.sessionRoster.count).not.toHaveBeenCalled();
    }
  });

  it('reconstructs historical BACKFILL eligibility from effective date and revocation chronology', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-14T05:00:00.000Z'));
    try {
      const session = { ...legacySession, status: SessionStatus.MISSED, businessDate: new Date('2026-06-14T00:00:00.000Z'), rosterState: SessionRosterState.LEGACY_ROSTER_MISSING };
      const afterBusinessDay = new Date('2026-06-14T17:00:00.000Z');
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        session: {
          findUnique: jest.fn().mockResolvedValue(session),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ ...session, status: SessionStatus.OPEN, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED })
        },
        sessionRoster: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
          createMany: jest.fn().mockResolvedValue({ count: 2 })
        },
        classEnrollment: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'revoked-after', studentId: 'siswa-revoked-after', active: false, administrativeStatus: 'REVOKED', administrativeStatusChangedAt: afterBusinessDay,
              academicYearId: null, semesterId: null, student: { id: 'siswa-revoked-after', fullName: 'Siswa Dicabut Setelah Sesi', username: 'revoked-after', active: false }, schoolClass: { id: 'class-1', code: 'X-1', name: 'X 1' }
            },
            {
              id: 'inactive-student', studentId: 'siswa-inactive', active: true, administrativeStatus: 'ACTIVE', administrativeStatusChangedAt: null,
              academicYearId: null, semesterId: null, student: { id: 'siswa-inactive', fullName: 'Siswa Kini Nonaktif', username: 'inactive', active: false }, schoolClass: { id: 'class-1', code: 'X-1', name: 'X 1' }
            }
          ])
        },
        studentAttendance: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
        auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
        outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) }
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;

      await new AttendanceClassService(prisma).recoverMissedSession('session-1', admin, 'bukti data');

      const where = tx.classEnrollment.findMany.mock.calls[0][0].where;
      const revoked = where.AND[0].OR.find((item: Record<string, unknown>) => item.administrativeStatus === 'REVOKED');
      expect(where).toEqual(expect.objectContaining({
        effectiveFrom: { lte: session.businessDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: session.businessDate } }],
        student: { role: Role.SISWA }
      }));
      expect(where).not.toHaveProperty('active');
      expect(where.student).not.toHaveProperty('active');
      expect(revoked).toEqual(expect.objectContaining({
        administrativeStatus: 'REVOKED',
        administrativeStatusChangedAt: { gt: new Date('2026-06-14T16:59:59.999Z') }
      }));
      expect(where.AND[0].OR).not.toContainEqual(expect.objectContaining({ administrativeStatus: 'CANCELLED' }));
      expect(tx.sessionRoster.createMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ studentId: 'siswa-revoked-after', activeAtCapture: true, metadata: expect.objectContaining({ administrativeStatus: 'REVOKED', administrativeStatusChangedAt: afterBusinessDay.toISOString() }) }),
          expect.objectContaining({ studentId: 'siswa-inactive', activeAtCapture: true, metadata: expect.objectContaining({ administrativeStatus: 'ACTIVE' }) })
        ])
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('excludes REVOKED enrollments changed at or before business-day end and CANCELLED enrollments from BACKFILL query', async () => {
    const session = { ...legacySession, status: SessionStatus.MISSED, businessDate: new Date('2026-06-14T00:00:00.000Z'), rosterState: SessionRosterState.LEGACY_ROSTER_MISSING };
    const tx = {
      sessionRoster: { count: jest.fn().mockResolvedValue(0), createMany: jest.fn() },
      classEnrollment: { findMany: jest.fn().mockResolvedValue([]) }
    } as any;
    const service = new AttendanceClassService({} as any);

    await (service as any).captureSessionRoster(tx, session, RosterCaptureSource.BACKFILL);

    const where = tx.classEnrollment.findMany.mock.calls[0][0].where;
    const revoked = where.AND[0].OR.find((item: Record<string, unknown>) => item.administrativeStatus === 'REVOKED');
    expect(revoked.administrativeStatusChangedAt).toEqual({ gt: new Date('2026-06-14T16:59:59.999Z') });
    expect(where.AND[0].OR).toEqual([
      { administrativeStatus: 'ACTIVE' },
      expect.objectContaining({ administrativeStatus: 'REVOKED' })
    ]);
    expect(where.AND[0].OR).not.toContainEqual(expect.objectContaining({ administrativeStatus: 'CANCELLED' }));
  });

  it('recovers MISSED session with effective-date backfill, audit, outbox, and no teacher presence', async () => {
    const today = new Date();
    const session = { ...legacySession, status: SessionStatus.MISSED, businessDate: today, rosterState: SessionRosterState.LEGACY_ROSTER_MISSING, reconciledAt: new Date() };
    const updated = { ...session, status: SessionStatus.OPEN, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED, openedAt: new Date(), reconciledAt: null };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated)
      },
      sessionRoster: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(1),
        findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }]),
        createMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      classEnrollment: { findMany: jest.fn().mockResolvedValue([{ id: 'enrollment-1', studentId: 'siswa-1', active: true, administrativeStatus: 'ACTIVE', academicYearId: null, semesterId: null, student: { id: 'siswa-1', fullName: 'Siswa Satu', username: 'siswa1' }, schoolClass: { id: 'class-1', code: 'X-1', name: 'X 1' } }]) },
      studentAttendance: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      teacherSessionPresence: { upsert: jest.fn() },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-1' }) }
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;

    const result = await new AttendanceClassService(prisma).recoverMissedSession('session-1', picket, 'Pemulihan karena guru berhalangan hadir');

    expect(result).toEqual({ ...updated, rosterCount: 1 });
    expect(tx.classEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }]
      })
    }));
    expect(tx.sessionRoster.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ captureSource: 'BACKFILL', metadata: expect.objectContaining({ source: 'missed_recovery', unverifiable: true }) })]
    }));
    expect(tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'session-1', status: SessionStatus.MISSED },
      data: expect.objectContaining({ status: SessionStatus.OPEN, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED, reconciledAt: null })
    }));
    expect(tx.teacherSessionPresence.upsert).not.toHaveBeenCalled();
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'class.session.missed_recovered', reason: 'Pemulihan karena guru berhalangan hadir' })
    }));
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'session.missed_recovered' })
    }));
    expect(tx.$queryRaw.mock.calls.map(([query]) => rawQueryText(query))).toEqual([
      'SELECT "id" FROM "Session" WHERE "id" = ? FOR UPDATE'
    ]);
  });

  it('rejects a second concurrent recovery after locked status reread', async () => {
    const session = { ...legacySession, status: SessionStatus.OPEN, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]), session: { findUnique: jest.fn().mockResolvedValue(session) } };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;

    await expect(new AttendanceClassService(prisma).recoverMissedSession('session-1', admin, 'Pemulihan karena bukti tersedia')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('uses recovery-specific 10-character reason quality without weakening other workflows', async () => {
    const session = { ...legacySession, status: SessionStatus.OPEN, businessDate: new Date(), rosterState: SessionRosterState.BACKFILLED_UNVERIFIED };
    const makeRecoveryService = () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        session: { findUnique: jest.fn().mockResolvedValue(session) }
      };
      return { service: new AttendanceClassService({ $transaction: jest.fn((callback) => callback(tx)) } as any), tx };
    };

    const nine = makeRecoveryService();
    await expect(nine.service.recoverMissedSession('session-1', admin, 'bukti1234')).rejects.toBeInstanceOf(BadRequestException);
    expect(nine.tx.$queryRaw).not.toHaveBeenCalled();

    for (const reason of ['bukti12345', 'buktivalid1234']) {
      const accepted = makeRecoveryService();
      await expect(accepted.service.recoverMissedSession('session-1', admin, reason)).rejects.toBeInstanceOf(ConflictException);
      expect(accepted.tx.$queryRaw).toHaveBeenCalled();
    }
  });

  it('rejects recovery for unauthorized, short reason, too old, future, and already recovered session', async () => {
    const service = new AttendanceClassService({} as any);
    await expect(service.recoverMissedSession('session-1', guru, 'Pemulihan karena bukti tersedia')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.recoverMissedSession('session-1', admin, 'singkat')).rejects.toBeInstanceOf(BadRequestException);

    for (const businessDate of [new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), new Date(Date.now() + 24 * 60 * 60 * 1000)]) {
      const session = { ...legacySession, status: SessionStatus.MISSED, businessDate };
      const tx = { $queryRaw: jest.fn().mockResolvedValue([]), session: { findUnique: jest.fn().mockResolvedValue(session) } };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;
      await expect(new AttendanceClassService(prisma).recoverMissedSession('session-1', admin, 'Pemulihan karena bukti tersedia')).rejects.toBeInstanceOf(BadRequestException);
    }

    const session = { ...legacySession, status: SessionStatus.OPEN, rosterState: SessionRosterState.BACKFILLED_UNVERIFIED };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]), session: { findUnique: jest.fn().mockResolvedValue(session) } };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;
    await expect(new AttendanceClassService(prisma).recoverMissedSession('session-1', admin, 'Pemulihan karena bukti tersedia')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AttendanceClassService session journal', () => {
  const subject = { id: 'subject-1', code: 'MAT', name: 'Matematika' };
  const startsAt = new Date('2026-06-14T01:00:00.000Z');
  const endsAt = new Date('2026-06-14T02:30:00.000Z');
  const session = {
    id: 'session-1',
    teacherId: 'guru-1',
    startsAt,
    endsAt,
    status: SessionStatus.OPEN,
    subject
  };
  const payload = {
    learningObjective: '  Memahami persamaan linear  ',
    activity: '  Diskusi dan latihan kelompok  ',
    lessonHours: 2,
    completionStatus: SessionJournalCompletionStatus.BELUM_TUNTAS
  };

  function makeJournalService(existing: Record<string, unknown> | null = null, sessionOverride: Record<string, unknown> = {}) {
    const lockedSession = { ...session, ...sessionOverride };
    const saved = {
      id: 'journal-1',
      sessionId: 'session-1',
      learningObjective: 'Memahami persamaan linear',
      activity: 'Diskusi dan latihan kelompok',
      lessonHours: 2,
      completionStatus: SessionJournalCompletionStatus.BELUM_TUNTAS,
      createdAt: new Date('2026-06-14T01:10:00.000Z'),
      updatedAt: new Date('2026-06-14T01:10:00.000Z')
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      session: { findUnique: jest.fn().mockResolvedValue(lockedSession) },
      sessionJournal: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue(saved),
        update: jest.fn().mockResolvedValue(saved)
      },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) }
    };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue({ ...lockedSession, journal: existing }) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    return { service: new AttendanceClassService(prisma), prisma, tx, saved };
  }

  it('returns authoritative subject, scheduled duration, and journal to the owning teacher', async () => {
    const existing = { id: 'journal-1', sessionId: 'session-1' };
    const { service } = makeJournalService(existing);

    await expect(service.getJournal('session-1', guru)).resolves.toEqual({
      sessionId: 'session-1',
      subject,
      scheduledDurationMinutes: 90,
      journal: existing
    });
  });

  it('rejects non-owner teachers and every non-GURU_MAPEL actor', async () => {
    const { service, tx } = makeJournalService();

    await expect(service.getJournal('session-1', { sub: 'guru-lain', role: Role.GURU_MAPEL })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getJournal('session-1', { sub: 'developer-1', role: Role.DEVELOPER })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.upsertJournal('session-1', { sub: 'developer-1', role: Role.DEVELOPER }, payload)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.upsertJournal('session-1', { sub: 'guru-lain', role: Role.GURU_MAPEL }, payload)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.sessionJournal.create).not.toHaveBeenCalled();
    expect(tx.sessionJournal.update).not.toHaveBeenCalled();
  });

  it('creates a trimmed journal and audits before/after inside the transaction', async () => {
    const { service, tx, saved } = makeJournalService();

    await expect(service.upsertJournal('session-1', guru, payload)).resolves.toEqual(saved);
    expect(tx.sessionJournal.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        learningObjective: 'Memahami persamaan linear',
        activity: 'Diskusi dan latihan kelompok',
        lessonHours: 2,
        completionStatus: SessionJournalCompletionStatus.BELUM_TUNTAS
      }
    });
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'class.session.journal.created',
        resource: 'sessionJournal',
        resourceId: 'journal-1',
        before: expect.any(Object),
        after: saved,
        canonicalPayload: expect.objectContaining({ before: null })
      })
    }));
    expect(tx.$queryRaw.mock.calls.map(([query]) => rawQueryText(query))).toEqual([
      'SELECT "id" FROM "Session" WHERE "id" = ? FOR UPDATE'
    ]);
  });

  it('updates only with the exact current version and audits the prior value', async () => {
    const existing = {
      id: 'journal-1',
      sessionId: 'session-1',
      learningObjective: 'Tujuan lama',
      activity: 'Kegiatan lama',
      lessonHours: 1,
      completionStatus: SessionJournalCompletionStatus.BELUM_TUNTAS,
      updatedAt: new Date('2026-06-14T01:05:00.000Z')
    };
    const { service, tx } = makeJournalService(existing);

    await service.upsertJournal('session-1', guru, { ...payload, updatedAt: existing.updatedAt.toISOString() });

    expect(tx.sessionJournal.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'journal-1' } }));
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'class.session.journal.updated', before: existing })
    }));
  });

  it('returns typed conflicts for missing, stale, and unexpected versions', async () => {
    const existing = { id: 'journal-1', updatedAt: new Date('2026-06-14T01:05:00.000Z') };
    const missing = makeJournalService(existing);
    await expect(missing.service.upsertJournal('session-1', guru, payload)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_JOURNAL_VERSION_REQUIRED' })
    });

    const stale = makeJournalService(existing);
    await expect(stale.service.upsertJournal('session-1', guru, { ...payload, updatedAt: '2026-06-14T01:04:00.000Z' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_JOURNAL_STALE_VERSION' })
    });

    const unexpected = makeJournalService();
    await expect(unexpected.service.upsertJournal('session-1', guru, { ...payload, updatedAt: '2026-06-14T01:04:00.000Z' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_JOURNAL_STALE_VERSION' })
    });
  });

  it('rejects writes unless the locked session remains OPEN', async () => {
    const { service, tx } = makeJournalService(null, { status: SessionStatus.CLOSED });

    await expect(service.upsertJournal('session-1', guru, payload)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.sessionJournal.findUnique).not.toHaveBeenCalled();
  });
});

describe('AttendanceClassService teacher check-in/out', () => {
  it('mencatat checkInAt saat guru membuka sesi', async () => {
    const { service, tx } = makeService({ status: SessionStatus.SCHEDULED });

    await service.openSession('session-1', guru, browserGeo());

    expect(tx.teacherSessionPresence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        checkInAt: expect.any(Date),
        checkInLat: TEST_SCHOOL_LOCATION.latitude,
        checkInLng: TEST_SCHOOL_LOCATION.longitude,
        checkInById: 'guru-1',
        status: TeacherSessionStatus.HADIR
      })
    }));
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'teacher.session.checkin' })
    }));
    expect(tx.classEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        classId: 'class-1',
        active: true,
        administrativeStatus: 'ACTIVE',
        effectiveFrom: expect.objectContaining({ lte: expect.any(Date) }),
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: expect.any(Date) } }]
      })
    }));
  });

  it('mencatat checkOutAt saat guru menutup sesi setelah jam selesai', async () => {
    const { service, tx } = makeService(
      { endsAt: new Date(Date.now() - 5 * 60 * 1000), status: SessionStatus.OPEN },
      { id: 'presence-1', status: TeacherSessionStatus.HADIR, checkInAt: new Date(Date.now() - 60 * 60 * 1000) }
    );

    await service.closeSession('session-1', guru, browserGeo());

    expect(tx.sessionJournal.findUnique).toHaveBeenCalledWith({ where: { sessionId: 'session-1' }, select: { id: true } });
    expect(tx.teacherSessionPresence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        checkOutAt: expect.any(Date),
        checkOutLat: TEST_SCHOOL_LOCATION.latitude,
        checkOutLng: TEST_SCHOOL_LOCATION.longitude,
        checkOutById: 'guru-1',
        earlyCheckoutReason: null
      })
    }));
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'teacher.session.checkout' })
    }));
  });

  it('menolak koordinat pembukaan sesi di luar geofence', async () => {
    const { service } = makeService(
      { status: SessionStatus.SCHEDULED },
      null,
      { enforceSessionOpen: true, allowPicketOverride: true, requireGateTapForOpen: false, centerLat: -6.2, centerLng: 106.816666, radiusMeter: 50 }
    );

    await expect(service.openSession('session-1', guru, browserGeo({ latitude: -6.3, longitude: 106.9 }))).rejects.toThrow('Di luar area sekolah.');
  });

  it('menolak koordinat tidak valid dari panggilan API langsung', async () => {
    const { service } = makeService({ status: SessionStatus.SCHEDULED });

    await expect(service.openSession('session-1', guru, browserGeo({ latitude: 120 }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('menolak lokasi stale dan akurasi terlalu rendah', async () => {
    const { service } = makeService({ status: SessionStatus.SCHEDULED });
    const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    await expect(service.openSession('session-1', guru, browserGeo({ capturedAt: stale }))).rejects.toThrow('Lokasi sudah kedaluwarsa');
    await expect(service.openSession('session-1', guru, browserGeo({ accuracyMeter: 1000 }))).rejects.toThrow('Akurasi lokasi terlalu rendah');
  });

  it('menolak penutupan sesi jika masih ada ALPA default yang belum dikonfirmasi', async () => {
    const { service, tx } = makeService(
      { endsAt: new Date(Date.now() - 5 * 60 * 1000), status: SessionStatus.OPEN },
      { id: 'presence-1', status: TeacherSessionStatus.HADIR, checkInAt: new Date(Date.now() - 60 * 60 * 1000) }
    );
    tx.studentAttendance.count.mockResolvedValueOnce(1);

    await expect(service.closeSession('session-1', guru, browserGeo())).rejects.toBeInstanceOf(ConflictException);
    expect(tx.session.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: SessionStatus.CLOSED }) }));
  });

  it('menolak penutupan sebelum finalisasi jika jurnal belum tersimpan', async () => {
    const { service, tx } = makeService(
      { endsAt: new Date(Date.now() - 5 * 60 * 1000), status: SessionStatus.OPEN },
      { id: 'presence-1', status: TeacherSessionStatus.HADIR, checkInAt: new Date(Date.now() - 60 * 60 * 1000) }
    );
    tx.sessionJournal.findUnique.mockResolvedValue(null);

    await expect(service.closeSession('session-1', guru, browserGeo())).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SESSION_JOURNAL_REQUIRED',
        message: 'Jurnal pembelajaran wajib disimpan sebelum sesi ditutup.'
      })
    });
    expect(tx.sessionRoster.findMany).not.toHaveBeenCalled();
    expect(tx.studentAttendance.createMany).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: SessionStatus.CLOSED }) }));
  });

  it('finalisasi eksplisit mengonfirmasi ALPA default dan mencatat audit', async () => {
    const { service, tx } = makeService(
      { endsAt: new Date(Date.now() - 5 * 60 * 1000), status: SessionStatus.OPEN },
      { id: 'presence-1', status: TeacherSessionStatus.HADIR, checkInAt: new Date(Date.now() - 60 * 60 * 1000) }
    );
    tx.studentAttendance.count.mockResolvedValueOnce(2);

    await service.closeSession('session-1', guru, { ...browserGeo(), finalizeDefaultAlpa: true });

    expect(tx.studentAttendance.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sessionId: 'session-1' }),
      data: expect.objectContaining({ confirmedById: 'guru-1' })
    }));
    expect(tx.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'class.attendance.finalized_default_alpa' })
    }));
  });

  it('menolak absen keluar sebelum jam selesai tanpa alasan', async () => {
    const { service } = makeService({ endsAt: new Date(Date.now() + 30 * 60 * 1000), status: SessionStatus.OPEN });

    await expect(service.closeSession('session-1', guru, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('menerima absen keluar sebelum jam selesai jika alasan diisi', async () => {
    const { service, tx } = makeService(
      { endsAt: new Date(Date.now() + 30 * 60 * 1000), status: SessionStatus.OPEN },
      { id: 'presence-1', status: TeacherSessionStatus.HADIR, checkInAt: new Date(Date.now() - 30 * 60 * 1000) }
    );

    await service.closeSession('session-1', guru, { earlyCheckoutReason: 'Kelas selesai lebih awal karena kegiatan sekolah.' });

    expect(tx.teacherSessionPresence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        earlyCheckoutReason: 'Kelas selesai lebih awal karena kegiatan sekolah.'
      })
    }));
  });
});
