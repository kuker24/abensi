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
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function withTime(base: Date, hour: number, minute: number) {
  const date = new Date(base);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
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

  const subject = await prisma.subject.upsert({
    where: { code: 'MTK-W' },
    update: { name: 'Matematika Wajib' },
    create: { code: 'MTK-W', name: 'Matematika Wajib' }
  });

  for (const student of students) {
    await prisma.classEnrollment.upsert({
      where: {
        classId_studentId: {
          classId: schoolClass.id,
          studentId: student.id
        }
      },
      update: {},
      create: {
        classId: schoolClass.id,
        studentId: student.id
      }
    });
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
      apiKeyHash: sha256('shr_reader_gate_primary_2026'),
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
      { userId: admin.id, direction: 'IN', tappedAt: withTime(today, 6, 55), deviceId: 'reader-gerbang-1' },
      { userId: guruMapel.id, direction: 'IN', tappedAt: withTime(today, 7, 2), deviceId: 'reader-gerbang-1' },
      { userId: students[0].id, direction: 'IN', tappedAt: withTime(today, 7, 10), deviceId: 'reader-gerbang-1' },
      { userId: students[1].id, direction: 'IN', tappedAt: withTime(today, 7, 12), deviceId: 'reader-gerbang-1' }
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
