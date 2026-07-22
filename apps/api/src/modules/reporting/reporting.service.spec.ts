import { AttendanceReviewState, GateDirection, PrayerType, Role, SessionRosterState, SessionStatus, StudentAttendanceStatus } from '@prisma/client';
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
  classReviewState?: AttendanceReviewState;
  prayers?: readonly PrayerType[];
} = {}) {
  const gateLogs = [
    options.gateIn && { userId: student.id, direction: GateDirection.IN, businessDate, tappedAt: new Date('2026-06-19T00:00:00.000Z') },
    options.gateOut && { userId: student.id, direction: GateDirection.OUT, businessDate, tappedAt: new Date('2026-06-19T08:00:00.000Z') }
  ].filter(Boolean);
  const attendances = options.classStatus
    ? [{ studentId: student.id, status: options.classStatus, reviewState: options.classReviewState ?? AttendanceReviewState.CONFIRMED }]
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

  it('treats DEFAULTED ALPA as belum diabsen guru', async () => {
    const { result, row } = await firstRow({
      gateIn: true,
      gateOut: true,
      classStatus: StudentAttendanceStatus.ALPA,
      classReviewState: AttendanceReviewState.DEFAULTED,
      prayers: [PrayerType.DHUHA, PrayerType.DZUHUR]
    });

    expect(row.finalStatus).toBe('BELUM_ABSEN_KELAS');
    expect(row.classAttendanceLabel).toBe('Belum diabsen guru');
    expect(row.classAttendanceSummary).toEqual(expect.objectContaining({ recordedCount: 0, defaultedCount: 1, missingCount: 1 }));
    expect(row.missingRequirementCodes).toContain('BELUM_ABSEN_KELAS');
    expect(result.summary.missingClassAttendanceCount).toBe(1);
  });

  it.each([
    StudentAttendanceStatus.HADIR,
    StudentAttendanceStatus.TELAT,
    StudentAttendanceStatus.IZIN,
    StudentAttendanceStatus.SAKIT,
    StudentAttendanceStatus.ALPA
  ])('counts teacher-confirmed %s as class attendance evidence', async (classStatus) => {
    const { row } = await firstRow({ gateIn: true, gateOut: true, classStatus, prayers: [PrayerType.DHUHA, PrayerType.DZUHUR] });

    expect(row.missingRequirementCodes).not.toContain('BELUM_ABSEN_KELAS');
    expect(row.classAttendanceSummary.recordedCount).toBe(1);
  });

  it('exports Hadir Kelas Tanpa Scan Gerbang from teacher-confirmed rows only', async () => {
    const confirmed = makeService({ classStatus: StudentAttendanceStatus.HADIR, prayers: [PrayerType.DHUHA, PrayerType.DZUHUR] });
    const defaulted = makeService({ classStatus: StudentAttendanceStatus.HADIR, classReviewState: AttendanceReviewState.DEFAULTED, prayers: [PrayerType.DHUHA, PrayerType.DZUHUR] });

    const confirmedCsv = await confirmed.service.exportReport('class_present_no_gate_scan', 'csv', { from: dateKey, to: dateKey }, { sub: 'admin-1', role: Role.ADMIN_TU });
    const defaultedCsv = await defaulted.service.exportReport('class_present_no_gate_scan', 'csv', { from: dateKey, to: dateKey }, { sub: 'admin-1', role: Role.ADMIN_TU });

    expect(confirmedCsv.buffer.toString('utf8')).toContain('Siswa Satu');
    expect(defaultedCsv.buffer.toString('utf8')).not.toContain('Siswa Satu');
    expect(defaultedCsv.buffer.toString('utf8')).not.toMatch(/report_metadata|\{"/);
  });

  it('exports Scan Gerbang Tanpa Absensi Kelas when gate scan exists without teacher-confirmed class row', async () => {
    const { service } = makeService({
      gateIn: true,
      classStatus: StudentAttendanceStatus.ALPA,
      classReviewState: AttendanceReviewState.DEFAULTED,
      prayers: [PrayerType.DHUHA, PrayerType.DZUHUR]
    });

    const csv = await service.exportReport('gate_scan_no_class_attendance', 'csv', { from: dateKey, to: dateKey }, { sub: 'admin-1', role: Role.ADMIN_TU });
    const text = csv.buffer.toString('utf8');

    expect(text).toContain('Siswa Satu');
    expect(text).toContain('Belum diabsen guru');
    expect(text).not.toMatch(/DEFAULTED|BELUM_ABSEN_KELAS/);
  });
});

function makeReportSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    classId: 'class-1',
    subjectId: 'subject-1',
    teacherId: 'guru-1',
    startsAt: new Date('2026-06-19T01:00:00.000Z'),
    status: SessionStatus.CLOSED,
    rosterState: SessionRosterState.VERIFIED,
    schoolClass: { id: 'class-1', code: 'X-A', name: 'Kelas X A' },
    subject: { id: 'subject-1', code: 'MTK', name: 'Matematika' },
    teacher: { id: 'guru-1', fullName: 'Guru Satu', username: 'guru1' },
    attendances: [{ status: StudentAttendanceStatus.HADIR }],
    teacherPresence: [],
    ...overrides
  };
}

function makeProvenanceService(options: {
  sessions?: Array<Record<string, unknown>>;
  attendanceRecords?: Array<Record<string, unknown>>;
  studentAttendances?: Array<Record<string, unknown>>;
  teacherPresence?: Array<Record<string, unknown>>;
} = {}) {
  const sessions = options.sessions ?? [makeReportSession()];
  const prisma = {
    session: { findMany: jest.fn().mockResolvedValue(sessions) },
    studentAttendance: {
      findMany: jest.fn().mockResolvedValue(options.attendanceRecords ?? options.studentAttendances ?? [])
    },
    gateLog: { findMany: jest.fn().mockResolvedValue([]) },
    teacherSessionPresence: { findMany: jest.fn().mockResolvedValue(options.teacherPresence ?? []) }
  } as any;
  const redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() } as any;
  return { service: new ReportingService(prisma, redis), prisma };
}

const recapPagination = { page: 1, limit: 20, skip: 0 };
const recapFilters = { from: '2026-06-19', to: '2026-06-19' };

describe('ReportingService roster provenance', () => {
  const rosterSessions = [
    makeReportSession({ id: 'verified', rosterState: SessionRosterState.VERIFIED }),
    makeReportSession({ id: 'backfilled', rosterState: SessionRosterState.BACKFILLED_UNVERIFIED }),
    makeReportSession({ id: 'legacy', rosterState: SessionRosterState.LEGACY_ROSTER_MISSING }),
    makeReportSession({ id: 'pending', rosterState: SessionRosterState.PENDING })
  ];

  it('adds roster provenance to class, subject, and teacher recaps', async () => {
    const { service } = makeProvenanceService({ sessions: rosterSessions });

    const [classes, subjects, teachers] = await Promise.all([
      service.recapClasses(recapPagination, recapFilters),
      service.recapSubjects(recapPagination, recapFilters),
      service.recapTeachers(recapPagination, recapFilters)
    ]);

    for (const result of [classes, subjects, teachers]) {
      expect(result.items[0]).toMatchObject({
        verifiedSessionCount: 1,
        backfilledUnverifiedSessionCount: 1,
        legacyRosterMissingSessionCount: 1,
        pendingRosterSessionCount: 1
      });
      expect(result.summary).toMatchObject({
        verifiedSessionCount: 1,
        backfilledUnverifiedSessionCount: 1,
        legacyRosterMissingSessionCount: 1,
        pendingRosterSessionCount: 1
      });
    }
  });

  it('counts student roster provenance by distinct session', async () => {
    const session = makeReportSession({ id: 'backfilled', rosterState: SessionRosterState.BACKFILLED_UNVERIFIED });
    const records = [
      { studentId: 'siswa-1', status: StudentAttendanceStatus.HADIR, student, session },
      { studentId: 'siswa-1', status: StudentAttendanceStatus.TELAT, student, session }
    ];
    const { service } = makeProvenanceService({ attendanceRecords: records });

    const result = await service.recapStudents(recapPagination, recapFilters);

    expect(result.items[0]).toMatchObject({ attendanceCount: 2, backfilledUnverifiedSessionCount: 1, verifiedSessionCount: 0 });
    expect(result.summary).toMatchObject({ backfilledUnverifiedSessionCount: 1 });
  });

  it('counts summary roster provenance once for each session across students', async () => {
    const verifiedSession = makeReportSession({ id: 'verified', rosterState: SessionRosterState.VERIFIED });
    const backfilledSession = makeReportSession({ id: 'backfilled', rosterState: SessionRosterState.BACKFILLED_UNVERIFIED });
    const secondStudent = { id: 'siswa-2', fullName: 'Siswa Dua', username: 'siswa2' };
    const records = [
      { studentId: student.id, status: StudentAttendanceStatus.HADIR, student, session: verifiedSession },
      { studentId: secondStudent.id, status: StudentAttendanceStatus.HADIR, student: secondStudent, session: verifiedSession },
      { studentId: student.id, status: StudentAttendanceStatus.TELAT, student, session: backfilledSession }
    ];
    const { service } = makeProvenanceService({ attendanceRecords: records });

    const result = await service.recapStudents(recapPagination, recapFilters);

    expect(result.summary).toMatchObject({
      verifiedSessionCount: 1,
      backfilledUnverifiedSessionCount: 1,
      legacyRosterMissingSessionCount: 0,
      pendingRosterSessionCount: 0
    });
    expect(result.summary.verifiedSessionCount + result.summary.backfilledUnverifiedSessionCount).toBe(2);
  });

  it('makes student and teacher attendance roster trust explicit', async () => {
    const session = makeReportSession({ rosterState: SessionRosterState.BACKFILLED_UNVERIFIED });
    const { service, prisma } = makeProvenanceService({
      studentAttendances: [{ id: 'attendance-1', studentId: student.id, session }],
      teacherPresence: [{ id: 'presence-1', teacherId: 'guru-1', session: makeReportSession({ rosterState: SessionRosterState.LEGACY_ROSTER_MISSING }) }]
    });

    const siswa = await service.myAttendance({ sub: student.id, role: Role.SISWA }, 1);
    const guru = await service.myAttendance({ sub: 'guru-1', role: Role.GURU_MAPEL }, 1);

    expect(siswa.classAttendances?.[0]).toMatchObject({
      rosterState: SessionRosterState.BACKFILLED_UNVERIFIED,
      rosterVerified: false,
      rosterUnverified: true
    });
    expect(guru.teacherPresence?.[0]).toMatchObject({
      rosterState: SessionRosterState.LEGACY_ROSTER_MISSING,
      rosterVerified: false,
      rosterUnverified: true
    });
    expect(prisma.gateLog.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('ReportingService school personnel gate attendance', () => {
  it('includes teachers and the principal while excluding students', async () => {
    const prisma = { gateLog: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const service = new ReportingService(prisma, {} as any);

    await service.staffGateAttendance(recapPagination, recapFilters);

    expect(prisma.gateLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        user: {
          role: {
            in: [
              Role.ADMIN_TU,
              Role.KEPALA_SEKOLAH,
              Role.GURU_MAPEL,
              Role.GURU_PIKET,
              Role.OPERATOR_IT,
              Role.DEVELOPER
            ]
          },
          active: true
        }
      })
    }));
  });
});
