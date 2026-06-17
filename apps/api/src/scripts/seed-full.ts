import {
  CardStatus,
  PrismaClient,
  ReconciliationFlagType,
  ReconciliationStatus,
  Role,
  SessionStatus,
  StudentAttendanceStatus,
  TeacherSessionStatus
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { hashReaderApiKey } from '../modules/security/device-signature.service';

const prisma = new PrismaClient();

function jakartaDateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function jakartaDateTime(dateKey: string, hour: number, minute: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0));
}

function withTime(base: Date, hour: number, minute: number) {
  return jakartaDateTime(jakartaDateKey(base), hour, minute);
}

function gateBusinessDate(value: Date) {
  const [year, month, day] = jakartaDateKey(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function gateIn(userId: string, tappedAt: Date) {
  return { userId, direction: 'IN' as const, businessDate: gateBusinessDate(tappedAt), tappedAt, deviceId: 'reader-gerbang-1' };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} wajib diisi untuk seed.`);
  return value;
}

async function upsertUser(params: {
  username: string;
  fullName: string;
  role: Role;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);

  return prisma.user.upsert({
    where: { username: params.username },
    update: {
      fullName: params.fullName,
      role: params.role,
      passwordHash,
      active: true
    },
    create: {
      username: params.username,
      fullName: params.fullName,
      role: params.role,
      passwordHash,
      active: true
    }
  });
}

async function main() {
  const defaultPassword = requiredEnv('DEFAULT_USER_PASSWORD');
  const adminUsername = process.env.ADMIN_USERNAME ?? 'admin.tu';
  const adminPassword = requiredEnv('ADMIN_PASSWORD');
  const adminFullName = process.env.ADMIN_FULL_NAME ?? 'Admin TU';

  const [admin, operator, guruMapel, guruPiket] = await Promise.all([
    upsertUser({
      username: adminUsername,
      fullName: adminFullName,
      role: Role.ADMIN_TU,
      password: adminPassword
    }),
    upsertUser({
      username: 'operator.it',
      fullName: 'Operator IT Sekolah',
      role: Role.OPERATOR_IT,
      password: defaultPassword
    }),
    upsertUser({
      username: 'guru.matematika',
      fullName: 'Ibu Siti Rahma',
      role: Role.GURU_MAPEL,
      password: defaultPassword
    }),
    upsertUser({
      username: 'guru.piket',
      fullName: 'Pak Rudi Piket',
      role: Role.GURU_PIKET,
      password: defaultPassword
    })
  ]);

  const students = await Promise.all([
    upsertUser({ username: 'siswa.andi', fullName: 'Andi Pratama', role: Role.SISWA, password: defaultPassword }),
    upsertUser({ username: 'siswa.bunga', fullName: 'Bunga Lestari', role: Role.SISWA, password: defaultPassword }),
    upsertUser({ username: 'siswa.citra', fullName: 'Citra Azzahra', role: Role.SISWA, password: defaultPassword }),
    upsertUser({ username: 'siswa.dimas', fullName: 'Dimas Saputra', role: Role.SISWA, password: defaultPassword })
  ]);

  const schoolClass = await prisma.schoolClass.upsert({
    where: { code: 'X-MIA-1' },
    update: { name: 'Kelas X MIA 1', yearLabel: '2025/2026' },
    create: { code: 'X-MIA-1', name: 'Kelas X MIA 1', yearLabel: '2025/2026' }
  });

  const academicYear = await prisma.academicYear.upsert({
    where: { code: '2025/2026' },
    update: { name: 'Tahun Ajaran 2025/2026', active: true },
    create: { code: '2025/2026', name: 'Tahun Ajaran 2025/2026', startsAt: jakartaDateTime('2025-07-01', 0, 0), endsAt: jakartaDateTime('2026-06-30', 23, 59), active: true }
  });
  const semester = await prisma.semester.upsert({
    where: { academicYearId_code: { academicYearId: academicYear.id, code: 'GANJIL' } },
    update: { name: 'Semester Ganjil', active: true },
    create: { academicYearId: academicYear.id, code: 'GANJIL', name: 'Semester Ganjil', startsAt: jakartaDateTime('2025-07-01', 0, 0), endsAt: jakartaDateTime('2025-12-31', 23, 59), active: true }
  });
  const enrollmentStart = jakartaDateTime('2025-07-01', 0, 0);

  const subject = await prisma.subject.upsert({
    where: { code: 'MTK-W' },
    update: { name: 'Matematika Wajib' },
    create: { code: 'MTK-W', name: 'Matematika Wajib' }
  });

  for (const student of students) {
    const existingEnrollment = await prisma.classEnrollment.findFirst({
      where: { classId: schoolClass.id, studentId: student.id, effectiveFrom: enrollmentStart }
    });
    if (!existingEnrollment) {
      await prisma.classEnrollment.create({
        data: {
          classId: schoolClass.id,
          studentId: student.id,
          academicYearId: academicYear.id,
          semesterId: semester.id,
          effectiveFrom: enrollmentStart
        }
      });
    }
  }

  const today = new Date();
  const startsAt = withTime(today, 7, 30);
  const endsAt = withTime(today, 8, 15);

  const existingSession = await prisma.session.findFirst({
    where: {
      classId: schoolClass.id,
      subjectId: subject.id,
      teacherId: guruMapel.id,
      startsAt
    }
  });

  const session = existingSession
    ? await prisma.session.update({
        where: { id: existingSession.id },
        data: {
          endsAt,
          businessDate: gateBusinessDate(startsAt),
          status: SessionStatus.CLOSED,
          openedAt: startsAt,
          closedAt: endsAt
        }
      })
    : await prisma.session.create({
        data: {
          classId: schoolClass.id,
          subjectId: subject.id,
          teacherId: guruMapel.id,
          startsAt,
          endsAt,
          businessDate: gateBusinessDate(startsAt),
          status: SessionStatus.CLOSED,
          openedAt: startsAt,
          closedAt: endsAt
        }
      });

  const statuses: StudentAttendanceStatus[] = [
    StudentAttendanceStatus.HADIR,
    StudentAttendanceStatus.TELAT,
    StudentAttendanceStatus.IZIN,
    StudentAttendanceStatus.ALPA
  ];

  for (const [index, student] of students.entries()) {
    await prisma.studentAttendance.upsert({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: student.id
        }
      },
      update: {
        status: statuses[index]
      },
      create: {
        sessionId: session.id,
        studentId: student.id,
        status: statuses[index]
      }
    });
  }

  await prisma.teacherSessionPresence.upsert({
    where: {
      sessionId_teacherId: {
        sessionId: session.id,
        teacherId: guruMapel.id
      }
    },
    update: {
      status: TeacherSessionStatus.HADIR
    },
    create: {
      sessionId: session.id,
      teacherId: guruMapel.id,
      status: TeacherSessionStatus.HADIR
    }
  });

  await prisma.geofencePolicy.upsert({
    where: { id: 1 },
    update: {
      centerLat: 0,
      centerLng: 0,
      radiusMeter: 300,
      enforceSessionOpen: true,
      arrivalGraceMinutes: 15,
      autoMissedGraceMinutes: 15,
      requireGateTapForOpen: false,
      allowPicketOverride: true
    },
    create: {
      id: 1,
      centerLat: 0,
      centerLng: 0,
      radiusMeter: 300,
      enforceSessionOpen: true,
      arrivalGraceMinutes: 15,
      autoMissedGraceMinutes: 15,
      requireGateTapForOpen: false,
      allowPicketOverride: true
    }
  });

  await prisma.deviceReader.upsert({
    where: { id: 'reader-gerbang-utama' },
    update: { name: 'Reader Gerbang Utama', status: 'ACTIVE' },
    create: {
      id: 'reader-gerbang-utama',
      name: 'Reader Gerbang Utama',
      apiKeyHash: hashReaderApiKey('shr_reader_gate_primary_2026'),
      keyPrefix: 'shr_rea',
      keyLast4: '2026',
      keyRotatedAt: new Date(),
      status: 'ACTIVE'
    }
  });

  const cardOwners = [admin, operator, guruMapel, guruPiket, ...students];
  for (const [index, user] of cardOwners.entries()) {
    await prisma.smartCard.upsert({
      where: { uid: `UID-MAN1-${String(index + 1).padStart(4, '0')}` },
      update: {
        userId: user.id,
        status: CardStatus.ACTIVE,
        lastTappedAt: withTime(today, 7, 0 + index)
      },
      create: {
        uid: `UID-MAN1-${String(index + 1).padStart(4, '0')}`,
        userId: user.id,
        status: CardStatus.ACTIVE,
        lastTappedAt: withTime(today, 7, 0 + index)
      }
    });
  }

  await prisma.gateLog.createMany({
    data: [
      gateIn(admin.id, withTime(today, 6, 55)),
      gateIn(guruMapel.id, withTime(today, 7, 2)),
      gateIn(students[0].id, withTime(today, 7, 10)),
      gateIn(students[1].id, withTime(today, 7, 12))
    ],
    skipDuplicates: true
  });

  await prisma.reconciliationFlag.upsert({
    where: {
      type_sessionId_userId: {
        type: ReconciliationFlagType.BOLOS_KELAS,
        sessionId: session.id,
        userId: students[3].id
      }
    },
    update: {
      status: ReconciliationStatus.OPEN,
      details: {
        gateIn: true,
        classStatus: StudentAttendanceStatus.ALPA
      }
    },
    create: {
      type: ReconciliationFlagType.BOLOS_KELAS,
      sessionId: session.id,
      userId: students[3].id,
      status: ReconciliationStatus.OPEN,
      details: {
        gateIn: true,
        classStatus: StudentAttendanceStatus.ALPA
      }
    }
  });

  console.log('Seed full script completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
