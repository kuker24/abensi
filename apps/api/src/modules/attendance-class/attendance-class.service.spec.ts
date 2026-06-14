import { BadRequestException } from '@nestjs/common';
import { Role, SessionStatus, TeacherSessionStatus } from '@prisma/client';
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
      findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }])
    },
    studentAttendance: {
      createMany: jest.fn().mockResolvedValue({ count: 1 })
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
    const session = { id: 'session-1', teacherId: 'guru-1', classId: 'class-1', startsAt: new Date(), status: SessionStatus.OPEN };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session) },
      classEnrollment: { findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1' }]) },
      auditEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      $transaction: jest.fn(async (callback) => callback(prisma))
    } as any;
    const service = new AttendanceClassService(prisma);

    await expect(service.recordAttendance('session-1', guru, { items: [{ studentId: 'siswa-luar', status: 'HADIR' as any }] })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.auditEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'attendance.class.rejected_out_of_roster' }) }));
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
