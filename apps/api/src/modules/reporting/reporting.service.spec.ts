import { GateDirection, PrayerType, StudentAttendanceStatus } from '@prisma/client';
import { ReportingService } from './reporting.service';

const dateKey = '2026-06-19';
const businessDate = new Date('2026-06-18T17:00:00.000Z');
const student = { id: 'siswa-1', fullName: 'Siswa Satu', username: 'siswa1' };
const enrollment = {
  id: 'enroll-1', classId: 'class-1', studentId: student.id, active: true, administrativeStatus: 'ACTIVE',
  schoolClass: { id: 'class-1', code: 'X-A', name: 'Kelas X A' },
  student
};
const sessionBase = {
  id: 'session-1',
  classId: 'class-1',
  startsAt: new Date('2026-06-19T01:00:00.000Z'),
  endsAt: new Date('2026-06-19T02:00:00.000Z')
};

function makeService(options: {
  gateIn?: boolean;
  gateOut?: boolean;
  classStatus?: StudentAttendanceStatus | null;
  prayers?: readonly PrayerType[];
} = {}) {
  const gateLogs = [
    options.gateIn && { userId: student.id, direction: GateDirection.IN, businessDate, tappedAt: new Date('2026-06-19T00:00:00.000Z') },
    options.gateOut && { userId: student.id, direction: GateDirection.OUT, businessDate, tappedAt: new Date('2026-06-19T08:00:00.000Z') }
  ].filter(Boolean);
  const attendances = options.classStatus
    ? [{ studentId: student.id, status: options.classStatus, reviewState: 'CONFIRMED' }]
    : [];
  const prayerLogs = (options.prayers ?? []).map((prayerType, index) => ({
    studentId: student.id,
    prayerType,
    attendanceDate: businessDate,
    scannedAt: new Date(`2026-06-19T0${index + 1}:30:00.000Z`)
  }));

  const prisma = {
    attendancePolicy: { findUnique: jest.fn().mockResolvedValue({ id: 1, requireStudentDhuha: true, requireStudentDzuhur: true, requireStudentAsharForAfternoon: false, asharRequiredClassEndTime: '15:00' }) },
    classEnrollment: { findMany: jest.fn().mockResolvedValue([enrollment]) },
    session: { findMany: jest.fn().mockResolvedValue([{ ...sessionBase, attendances }]) },
    gateLog: { findMany: jest.fn().mockResolvedValue(gateLogs) },
    prayerAttendanceLog: { findMany: jest.fn().mockResolvedValue(prayerLogs) },
    reconciliationFlag: { count: jest.fn().mockResolvedValue(0) },
    attendanceOverride: { count: jest.fn().mockResolvedValue(0) },
    attendanceCorrectionEvent: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (callback: any) => callback({ auditEntry: { create: jest.fn() }, auditChainState: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() } }))
  } as any;
  const redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() } as any;
  return { service: new ReportingService(prisma, redis), prisma };
}

async function firstRow(options: Parameters<typeof makeService>[0]) {
  const { service } = makeService(options);
  const result = await service.studentDailyCompleteness({ page: 1, limit: 20, skip: 0 }, { from: dateKey, to: dateKey });
  return { result, row: result.items[0] as any };
}

describe('ReportingService student daily completeness', () => {
  it('returns HADIR_LENGKAP only when gate arrival, gate departure, class attendance, and required prayers exist', async () => {
    const { result, row } = await firstRow({ gateIn: true, gateOut: true, classStatus: StudentAttendanceStatus.HADIR, prayers: [PrayerType.DHUHA, PrayerType.DZUHUR] });

    expect(row.finalStatus).toBe('HADIR_LENGKAP');
    expect(row.finalStatusLabel).toBe('Hadir lengkap');
    expect(row.missingRequirementCodes).toEqual([]);
    expect(result.summary.completeCount).toBe(1);
  });

  it.each([
    ['missing arrival', { gateOut: true, classStatus: StudentAttendanceStatus.HADIR, prayers: [PrayerType.DHUHA, PrayerType.DZUHUR] }, 'BELUM_SCAN_DATANG', 'Belum scan datang'],
    ['missing departure', { gateIn: true, classStatus: StudentAttendanceStatus.HADIR, prayers: [PrayerType.DHUHA, PrayerType.DZUHUR] }, 'BELUM_SCAN_PULANG', 'Belum scan pulang'],
    ['missing class attendance', { gateIn: true, gateOut: true, prayers: [PrayerType.DHUHA, PrayerType.DZUHUR] }, 'BELUM_ABSEN_KELAS', 'Belum diabsen guru'],
    ['missing prayer', { gateIn: true, gateOut: true, classStatus: StudentAttendanceStatus.HADIR, prayers: [PrayerType.DHUHA] }, 'BELUM_SCAN_SHOLAT', 'Belum scan sholat']
  ] as const)('returns %s safely', async (_name, options, code, label) => {
    const { row } = await firstRow(options);

    expect(row.finalStatus).toBe(code);
    expect(row.missingRequirementCodes).toContain(code);
    expect(row.missingRequirements).toContain(label);
    expect(row.note).toContain(label);
  });

  it('returns multiple missing requirements without raw technical text', async () => {
    const { result, row } = await firstRow({ classStatus: null, prayers: [] });

    expect(row.finalStatus).toBe('BELUM_SCAN_DATANG');
    expect(row.missingRequirementCodes).toEqual(['BELUM_SCAN_DATANG', 'BELUM_SCAN_PULANG', 'BELUM_ABSEN_KELAS', 'BELUM_SCAN_SHOLAT']);
    expect(row.note).toBe('Belum scan datang, Belum scan pulang, Belum diabsen guru, Belum scan sholat');
    expect(JSON.stringify(row)).not.toMatch(/secret|token|stack/i);
    expect(result.summary.missingArrivalCount).toBe(1);
    expect(result.summary.missingDepartureCount).toBe(1);
    expect(result.summary.missingClassAttendanceCount).toBe(1);
    expect(result.summary.missingPrayerCount).toBe(1);
  });

  it('marks non-present class attendance as perlu verifikasi instead of hadir lengkap', async () => {
    const { row } = await firstRow({ gateIn: true, gateOut: true, classStatus: StudentAttendanceStatus.ALPA, prayers: [PrayerType.DHUHA, PrayerType.DZUHUR] });

    expect(row.finalStatus).toBe('PERLU_VERIFIKASI');
    expect(row.missingRequirements).toEqual(['Perlu verifikasi']);
  });
});
