import { ForbiddenException } from '@nestjs/common';
import { AttendanceReviewState, GateDirection, PrayerType, Role, StudentAttendanceStatus } from '@prisma/client';
import { StudentsService } from './students.service';

const student = { id: 'siswa-1', username: 'siswa.aisyah', fullName: 'Aisyah Putri', role: Role.SISWA, active: true };
const enrollment = {
  id: 'enrollment-1',
  classId: 'class-1',
  studentId: 'siswa-1',
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveTo: null,
  active: true,
  administrativeStatus: 'ACTIVE',
  schoolClass: { id: 'class-1', code: 'X IPA 1', name: 'X IPA 1' }
};

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    startsAt: new Date('2026-06-20T00:30:00.000Z'),
    endsAt: new Date('2026-06-20T02:00:00.000Z'),
    attendances: [],
    ...overrides
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(student) },
    classEnrollment: { findFirst: jest.fn().mockResolvedValue(enrollment) },
    attendancePolicy: { findUnique: jest.fn().mockResolvedValue({ requireStudentDhuha: true, requireStudentDzuhur: true, requireStudentAsharForAfternoon: true, asharRequiredClassEndTime: '15:00' }) },
    gateLog: { findMany: jest.fn().mockResolvedValue([]) },
    prayerAttendanceLog: { findMany: jest.fn().mockResolvedValue([]) },
    session: { findMany: jest.fn().mockResolvedValue([makeSession()]) },
    ...overrides
  } as any;
  return prisma;
}

const actor = { sub: 'siswa-1', role: Role.SISWA };

describe('StudentsService today attendance status', () => {
  it('siswa gets own today status and never queries another student id', async () => {
    const prisma = makePrisma();
    const service = new StudentsService(prisma);

    const result = await service.todayStatus(actor, '2026-06-20');

    expect(result.student).toMatchObject({ id: 'siswa-1', fullName: 'Aisyah Putri', className: 'X IPA 1' });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'siswa-1' } }));
    expect(prisma.classEnrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ studentId: 'siswa-1' }) }));
    expect(prisma.gateLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'siswa-1' }) }));
    expect(prisma.prayerAttendanceLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ studentId: 'siswa-1' }) }));
    expect(prisma.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ attendances: expect.objectContaining({ where: { studentId: 'siswa-1' } }) })
    }));
  });

  it('non-siswa cannot access student self status', async () => {
    const prisma = makePrisma();
    const service = new StudentsService(prisma);

    await expect(service.todayStatus({ sub: 'admin-1', role: Role.ADMIN_TU }, '2026-06-20')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('no gate/class/prayer data returns safe pending statuses', async () => {
    const prisma = makePrisma({
      session: { findMany: jest.fn().mockResolvedValue([makeSession({ endsAt: new Date('2026-06-20T03:00:00.000Z') })]) }
    });
    const service = new StudentsService(prisma);

    const result = await service.todayStatus(actor, '2026-06-20');

    expect(result.summary).toMatchObject({ overallStatus: 'PERLU_DILENGKAPI', pendingCount: 5 });
    expect(Object.fromEntries(result.items.map((item) => [item.key, item.status]))).toMatchObject({
      GATE_IN: 'PENDING',
      CLASS_ATTENDANCE: 'PENDING',
      PRAYER_DHUHA: 'PENDING',
      PRAYER_DZUHUR: 'PENDING',
      PRAYER_ASHAR: 'NOT_REQUIRED',
      GATE_OUT: 'PENDING'
    });
    expect(result.nextActions).toEqual(expect.arrayContaining([
      'Scan datang di gerbang.',
      'Ikuti presensi kelas dengan guru.',
      'Scan Dhuha di mushola.',
      'Scan Dzuhur di mushola.',
      'Scan pulang sebelum keluar sekolah.'
    ]));
  });

  it('complete gate/class/prayer data returns done statuses and JSON serializable payload', async () => {
    const prisma = makePrisma({
      gateLog: { findMany: jest.fn().mockResolvedValue([
        { direction: GateDirection.IN, tappedAt: new Date('2026-06-20T00:03:00.000Z') },
        { direction: GateDirection.OUT, tappedAt: new Date('2026-06-20T08:10:00.000Z') }
      ]) },
      prayerAttendanceLog: { findMany: jest.fn().mockResolvedValue([
        { prayerType: PrayerType.DHUHA, scannedAt: new Date('2026-06-20T01:00:00.000Z') },
        { prayerType: PrayerType.DZUHUR, scannedAt: new Date('2026-06-20T05:15:00.000Z') },
        { prayerType: PrayerType.ASHAR, scannedAt: new Date('2026-06-20T08:20:00.000Z') }
      ]) },
      session: { findMany: jest.fn().mockResolvedValue([makeSession({
        endsAt: new Date('2026-06-20T09:00:00.000Z'),
        attendances: [{ status: StudentAttendanceStatus.HADIR, reviewState: AttendanceReviewState.CONFIRMED }]
      })]) }
    });
    const service = new StudentsService(prisma);

    const result = await service.todayStatus(actor, '2026-06-20');

    expect(result.summary).toEqual({ completedCount: 6, pendingCount: 0, overallStatus: 'LENGKAP' });
    expect(result.items.every((item) => item.status === 'DONE')).toBe(true);
    expect(result.items.find((item) => item.key === 'GATE_IN')?.time).toBe('07:03');
    expect(result.items.find((item) => item.key === 'CLASS_ATTENDANCE')?.description).toContain('Hadir 1');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('date and business timezone are stable for Asia/Jakarta day bounds', async () => {
    const prisma = makePrisma();
    const service = new StudentsService(prisma);

    const result = await service.todayStatus(actor, '2026-06-20');

    expect(result.date).toBe('2026-06-20');
    expect(prisma.gateLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ businessDate: new Date('2026-06-19T17:00:00.000Z') })
    }));
    expect(prisma.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ startsAt: { gte: new Date('2026-06-19T17:00:00.000Z'), lte: new Date('2026-06-20T16:59:59.999Z') } })
    }));
  });
});
