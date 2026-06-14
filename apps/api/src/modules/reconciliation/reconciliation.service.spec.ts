import { PrayerType, ReconciliationFlagType, Role, SessionStatus, StudentAttendanceStatus, TeacherSessionStatus } from '@prisma/client';
import { localDateTimeToUtc } from '../../common/business-time';
import { ReconciliationService } from './reconciliation.service';

function atLocal(hour: number, minute = 0) {
  return localDateTimeToUtc('2026-04-26', `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
}

describe('ReconciliationService Ashar policy', () => {
  it('membuat anomali BELUM_SCAN_ASHAR untuk siswa hadir yang jadwalnya sampai sore', async () => {
    const session = {
      id: 'session-sore',
      teacherId: 'guru-1',
      startsAt: atLocal(13),
      endsAt: atLocal(15, 30),
      status: SessionStatus.CLOSED,
      schoolClass: { enrollments: [{ studentId: 'siswa-1' }] },
      attendances: [{ studentId: 'siswa-1', status: StudentAttendanceStatus.HADIR }],
      teacherPresence: [{ teacherId: 'guru-1', status: TeacherSessionStatus.HADIR }]
    };
    const tx = { session: { update: jest.fn().mockResolvedValue(session) }, auditEntry: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session), update: jest.fn() },
      gateLog: { findMany: jest.fn().mockResolvedValue([{ userId: 'siswa-1', direction: 'IN', tappedAt: atLocal(7) }, { userId: 'guru-1', direction: 'IN', tappedAt: atLocal(7) }]) },
      prayerAttendanceLog: { findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1', prayerType: PrayerType.DHUHA }, { studentId: 'siswa-1', prayerType: PrayerType.DZUHUR }]) },
      attendancePolicy: { findUnique: jest.fn().mockResolvedValue({ requireStudentDhuha: true, requireStudentDzuhur: true, requireStudentAsharForAfternoon: true, asharRequiredClassEndTime: '15:00' }) },
      attendanceOverride: { findMany: jest.fn().mockResolvedValue([]) },
      reconciliationFlag: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn) => fn(tx))
    } as any;
    const service = new ReconciliationService(prisma);

    const result = await service.reconcileSession('session-sore', 'system');

    expect(result.createdFlags).toBe(1);
    expect(prisma.reconciliationFlag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        type: ReconciliationFlagType.BELUM_SCAN_ASHAR,
        userId: 'siswa-1'
      })
    }));
  });

  it('tidak membuat anomali Ashar jika sesi selesai sebelum batas sore', async () => {
    const session = {
      id: 'session-pagi',
      teacherId: 'guru-1',
      startsAt: atLocal(7),
      endsAt: atLocal(10),
      status: SessionStatus.CLOSED,
      schoolClass: { enrollments: [{ studentId: 'siswa-1' }] },
      attendances: [{ studentId: 'siswa-1', status: StudentAttendanceStatus.HADIR }],
      teacherPresence: [{ teacherId: 'guru-1', status: TeacherSessionStatus.HADIR }]
    };
    const tx = { session: { update: jest.fn().mockResolvedValue(session) }, auditEntry: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      session: { findUnique: jest.fn().mockResolvedValue(session), update: jest.fn() },
      gateLog: { findMany: jest.fn().mockResolvedValue([{ userId: 'siswa-1', direction: 'IN', tappedAt: atLocal(7) }, { userId: 'guru-1', direction: 'IN', tappedAt: atLocal(7) }]) },
      prayerAttendanceLog: { findMany: jest.fn().mockResolvedValue([{ studentId: 'siswa-1', prayerType: PrayerType.DHUHA }, { studentId: 'siswa-1', prayerType: PrayerType.DZUHUR }]) },
      attendancePolicy: { findUnique: jest.fn().mockResolvedValue({ requireStudentDhuha: true, requireStudentDzuhur: true, requireStudentAsharForAfternoon: true, asharRequiredClassEndTime: '15:00' }) },
      attendanceOverride: { findMany: jest.fn().mockResolvedValue([]) },
      reconciliationFlag: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn) => fn(tx))
    } as any;
    const service = new ReconciliationService(prisma);

    const result = await service.reconcileSession('session-pagi', 'system');

    expect(result.createdFlags).toBe(0);
    expect(prisma.reconciliationFlag.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ type: ReconciliationFlagType.BELUM_SCAN_ASHAR })
    }));
  });
  it('skips auto-missed side effects when session state changed concurrently', async () => {
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
      $transaction: jest.fn(async (fn) => fn(tx))
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
