import { BadRequestException, ConflictException } from '@nestjs/common';
import { AttendanceConfirmationSource, AttendanceReviewState, Role, SessionStatus, StudentAttendanceStatus, TeacherSessionStatus } from '@prisma/client';
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
    ...sessionOverrides
  };
  const updatedSession = { ...session, status: SessionStatus.CLOSED, closedAt: now };
  const tx = {
    session: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(updatedSession)
    },
    classEnrollment: {
      findMany: jest.fn().mockResolvedValue([{ id: 'enrollment-1', studentId: 'siswa-1', active: true, academicYearId: null, semesterId: null, student: { id: 'siswa-1', fullName: 'Siswa Satu', username: 'siswa1' }, schoolClass: { id: 'class-1', code: 'X-1', name: 'X 1' } }])
    },
    sessionRoster: {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }])
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

describe('AttendanceClassService record attendance policy', () => {
  it('menolak presensi siswa di luar roster kelas', async () => {
    const session = { id: 'session-1', teacherId: 'guru-1', classId: 'class-1', startsAt: new Date(), businessDate: new Date(Date.UTC(2026, 5, 14)), status: SessionStatus.OPEN };
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
    status: SessionStatus.OPEN
  };

  function makeRecordService(existingUpdatedAt = new Date('2026-06-14T01:05:00.000Z')) {
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
      attendancePolicy: { findUnique: jest.fn().mockResolvedValue({ requireStudentClassEligibility: false }) },
      $transaction: jest.fn((callback) => callback(tx))
    } as any;
    return { service: new AttendanceClassService(prisma), prisma, tx, existingUpdatedAt };
  }

  it('save tanpa baris eksplisit tidak mengonfirmasi ALPA default', async () => {
    const tx = { auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) } };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
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

  it('konfirmasi massal hadir hanya mengubah baris DEFAULTED yang eligible', async () => {
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

    const result = await service.bulkConfirmPresent('session-1', guru);

    expect(result.updated).toBe(2);
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
  });

  it('mencatat checkOutAt saat guru menutup sesi setelah jam selesai', async () => {
    const { service, tx } = makeService(
      { endsAt: new Date(Date.now() - 5 * 60 * 1000), status: SessionStatus.OPEN },
      { id: 'presence-1', status: TeacherSessionStatus.HADIR, checkInAt: new Date(Date.now() - 60 * 60 * 1000) }
    );

    await service.closeSession('session-1', guru, browserGeo());

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
