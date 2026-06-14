import {
  CardStatus,
  PrismaClient,
  ReconciliationStatus,
  ReconciliationFlagType,
  Role,
  SessionStatus,
  StudentAttendanceStatus,
  TeacherSessionStatus,
  ReaderType,
  PrayerType
} from '@prisma/client';
import bcrypt from 'bcryptjs';

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

function dateOnly(base: Date) {
  return jakartaDateTime(jakartaDateKey(base), 0, 0);
}

function dayBounds(base: Date) {
  const key = jakartaDateKey(base);
  const start = jakartaDateTime(key, 0, 0);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
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
  cardStatus?: CardStatus;
  active?: boolean;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);

  return prisma.user.upsert({
    where: { username: params.username },
    update: {
      fullName: params.fullName,
      passwordHash,
      role: params.role,
      active: params.active ?? true,
      cardStatus: params.cardStatus ?? (params.active === false ? CardStatus.INACTIVE : CardStatus.ACTIVE)
    },
    create: {
      username: params.username,
      fullName: params.fullName,
      passwordHash,
      role: params.role,
      active: params.active ?? true,
      cardStatus: params.cardStatus ?? (params.active === false ? CardStatus.INACTIVE : CardStatus.ACTIVE)
    }
  });
}

async function ensureSession(params: {
  classId: string;
  subjectId: string;
  teacherId: string;
  startsAt: Date;
  endsAt: Date;
  status: SessionStatus;
}) {
  const existing = await prisma.session.findFirst({
    where: {
      classId: params.classId,
      subjectId: params.subjectId,
      teacherId: params.teacherId,
      startsAt: params.startsAt
    }
  });

  if (existing) {
    return prisma.session.update({
      where: { id: existing.id },
      data: {
        endsAt: params.endsAt,
        businessDate: gateBusinessDate(params.startsAt),
        status: params.status,
        openedAt: params.status === SessionStatus.SCHEDULED ? null : params.startsAt,
        closedAt: params.status === SessionStatus.CLOSED ? params.endsAt : null
      }
    });
  }

  return prisma.session.create({
    data: {
      classId: params.classId,
      subjectId: params.subjectId,
      teacherId: params.teacherId,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      businessDate: gateBusinessDate(params.startsAt),
      status: params.status,
      openedAt: params.status === SessionStatus.SCHEDULED ? null : params.startsAt,
      closedAt: params.status === SessionStatus.CLOSED ? params.endsAt : null
    }
  });
}

function gateBusinessDate(value: Date) {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

async function ensureGateLog(userId: string, tappedAt: Date) {
  const { start: dayStart, end: dayEnd } = dayBounds(tappedAt);

  const exists = await prisma.gateLog.findFirst({
    where: {
      userId,
      direction: 'IN',
      tappedAt: {
        gte: dayStart,
        lte: dayEnd
      }
    }
  });

  if (exists) return exists;

  return prisma.gateLog.create({
    data: {
      userId,
      direction: 'IN',
      businessDate: gateBusinessDate(tappedAt),
      tappedAt,
      deviceId: 'reader-gerbang-1'
    }
  });
}

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME ?? 'admin.tu';
  const adminPassword = requiredEnv('ADMIN_PASSWORD');
  const adminFullName = process.env.ADMIN_FULL_NAME ?? 'Admin TU';

  const defaultPassword = requiredEnv('DEFAULT_USER_PASSWORD');
  const developerUsername = process.env.DEVELOPER_USERNAME ?? 'developer';
  const developerPassword = process.env.DEVELOPER_PASSWORD ?? adminPassword;
  const developerFullName = process.env.DEVELOPER_FULL_NAME ?? 'Developer SchoolHub';

  const [admin, operator, guruMapelA, guruMapelB, guruPiket, developer] = await Promise.all([
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
      password: defaultPassword,
      active: false
    }),
    upsertUser({
      username: 'guru.matematika',
      fullName: 'Ibu Siti Rahma',
      role: Role.GURU_MAPEL,
      password: defaultPassword
    }),
    upsertUser({
      username: 'guru.fisika',
      fullName: 'Bapak Ahmad Fauzi',
      role: Role.GURU_MAPEL,
      password: defaultPassword,
      active: false
    }),
    upsertUser({
      username: 'guru.piket',
      fullName: 'Pak Rudi Piket',
      role: Role.GURU_PIKET,
      password: defaultPassword,
      active: false
    }),
    upsertUser({
      username: developerUsername,
      fullName: developerFullName,
      role: Role.DEVELOPER,
      password: developerPassword
    })
  ]);

  const students = await Promise.all([
    upsertUser({
      username: 'siswa.andi',
      fullName: 'Andi Pratama',
      role: Role.SISWA,
      password: defaultPassword,
      active: false
    }),
    upsertUser({
      username: 'siswa.bunga',
      fullName: 'Bunga Lestari',
      role: Role.SISWA,
      password: defaultPassword,
      active: false
    }),
    upsertUser({
      username: 'siswa.citra',
      fullName: 'Citra Azzahra',
      role: Role.SISWA,
      password: defaultPassword
    }),
    upsertUser({
      username: 'siswa.dimas',
      fullName: 'Dimas Saputra',
      role: Role.SISWA,
      password: defaultPassword,
      active: false
    }),
    upsertUser({
      username: 'siswa.eka',
      fullName: 'Eka Nurhaliza',
      role: Role.SISWA,
      password: defaultPassword,
      active: false
    }),
    upsertUser({
      username: 'siswa.farhan',
      fullName: 'Farhan Maulana',
      role: Role.SISWA,
      password: defaultPassword,
      active: false
    })
  ]);

  const classXmia1 = await prisma.schoolClass.upsert({
    where: { code: 'X-MIA-1' },
    update: {
      name: 'Kelas X MIA 1',
      yearLabel: '2025/2026'
    },
    create: {
      code: 'X-MIA-1',
      name: 'Kelas X MIA 1',
      yearLabel: '2025/2026'
    }
  });

  const classXmia2 = await prisma.schoolClass.upsert({
    where: { code: 'X-MIA-2' },
    update: {
      name: 'Kelas X MIA 2',
      yearLabel: '2025/2026'
    },
    create: {
      code: 'X-MIA-2',
      name: 'Kelas X MIA 2',
      yearLabel: '2025/2026'
    }
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

  const [matematika, fisika, bahasaArab] = await Promise.all([
    prisma.subject.upsert({
      where: { code: 'MTK-W' },
      update: { name: 'Matematika Wajib' },
      create: { code: 'MTK-W', name: 'Matematika Wajib' }
    }),
    prisma.subject.upsert({
      where: { code: 'FIS-X' },
      update: { name: 'Fisika Dasar' },
      create: { code: 'FIS-X', name: 'Fisika Dasar' }
    }),
    prisma.subject.upsert({
      where: { code: 'BAR-X' },
      update: { name: 'Bahasa Arab' },
      create: { code: 'BAR-X', name: 'Bahasa Arab' }
    })
  ]);

  for (const [index, student] of students.entries()) {
    const classId = index < 4 ? classXmia1.id : classXmia2.id;
    const existingEnrollment = await prisma.classEnrollment.findFirst({
      where: { classId, studentId: student.id, effectiveFrom: enrollmentStart }
    });
    if (!existingEnrollment) {
      await prisma.classEnrollment.create({
        data: {
          classId,
          studentId: student.id,
          academicYearId: academicYear.id,
          semesterId: semester.id,
          effectiveFrom: enrollmentStart
        }
      });
    }
  }

  const today = new Date();

  const sessionA = await ensureSession({
    classId: classXmia1.id,
    subjectId: matematika.id,
    teacherId: guruMapelA.id,
    startsAt: withTime(today, 7, 30),
    endsAt: withTime(today, 8, 15),
    status: SessionStatus.CLOSED
  });

  const sessionB = await ensureSession({
    classId: classXmia1.id,
    subjectId: fisika.id,
    teacherId: guruMapelB.id,
    startsAt: withTime(today, 9, 0),
    endsAt: withTime(today, 9, 45),
    status: SessionStatus.OPEN
  });

  const sessionC = await ensureSession({
    classId: classXmia2.id,
    subjectId: bahasaArab.id,
    teacherId: guruMapelA.id,
    startsAt: withTime(today, 10, 0),
    endsAt: withTime(today, 10, 45),
    status: SessionStatus.SCHEDULED
  });

  const closedStatuses: StudentAttendanceStatus[] = [
    StudentAttendanceStatus.HADIR,
    StudentAttendanceStatus.HADIR,
    StudentAttendanceStatus.TELAT,
    StudentAttendanceStatus.ALPA
  ];

  const openStatuses: StudentAttendanceStatus[] = [
    StudentAttendanceStatus.HADIR,
    StudentAttendanceStatus.IZIN,
    StudentAttendanceStatus.HADIR,
    StudentAttendanceStatus.SAKIT
  ];

  for (const [index, student] of students.slice(0, 4).entries()) {
    await prisma.studentAttendance.upsert({
      where: {
        sessionId_studentId: {
          sessionId: sessionA.id,
          studentId: student.id
        }
      },
      update: {
        status: closedStatuses[index]
      },
      create: {
        sessionId: sessionA.id,
        studentId: student.id,
        status: closedStatuses[index]
      }
    });

    await prisma.studentAttendance.upsert({
      where: {
        sessionId_studentId: {
          sessionId: sessionB.id,
          studentId: student.id
        }
      },
      update: {
        status: openStatuses[index]
      },
      create: {
        sessionId: sessionB.id,
        studentId: student.id,
        status: openStatuses[index]
      }
    });
  }

  await prisma.teacherSessionPresence.upsert({
    where: {
      sessionId_teacherId: {
        sessionId: sessionA.id,
        teacherId: guruMapelA.id
      }
    },
    update: {
      status: TeacherSessionStatus.HADIR
    },
    create: {
      sessionId: sessionA.id,
      teacherId: guruMapelA.id,
      status: TeacherSessionStatus.HADIR
    }
  });

  await prisma.teacherSessionPresence.upsert({
    where: {
      sessionId_teacherId: {
        sessionId: sessionB.id,
        teacherId: guruMapelB.id
      }
    },
    update: {
      status: TeacherSessionStatus.HADIR
    },
    create: {
      sessionId: sessionB.id,
      teacherId: guruMapelB.id,
      status: TeacherSessionStatus.HADIR
    }
  });

  const gateTime = withTime(today, 7, 10);

  await Promise.all([
    ensureGateLog(admin.id, withTime(today, 6, 55)),
    ensureGateLog(operator.id, withTime(today, 6, 58)),
    ensureGateLog(guruMapelA.id, withTime(today, 7, 2)),
    ensureGateLog(guruPiket.id, withTime(today, 6, 50)),
    ensureGateLog(students[0].id, gateTime),
    ensureGateLog(students[1].id, withTime(today, 7, 12)),
    ensureGateLog(students[2].id, withTime(today, 7, 14))
  ]);

  const cardOwners = [
    admin,
    operator,
    guruMapelA,
    guruMapelB,
    guruPiket,
    developer,
    ...students
  ];

  for (const [index, user] of cardOwners.entries()) {
    await prisma.smartCard.upsert({
      where: {
        uid: `UID-MAN1-${String(index + 1).padStart(4, '0')}`
      },
      update: {
        status: user.active ? CardStatus.ACTIVE : CardStatus.INACTIVE,
        userId: user.id,
        lastTappedAt: user.active ? withTime(today, 7, 0 + (index % 20)) : null,
        note: user.active ? 'Kartu operasional' : 'Kartu akun demo nonaktif'
      },
      create: {
        uid: `UID-MAN1-${String(index + 1).padStart(4, '0')}`,
        status: user.active ? CardStatus.ACTIVE : CardStatus.INACTIVE,
        userId: user.id,
        lastTappedAt: user.active ? withTime(today, 7, 0 + (index % 20)) : null,
        note: user.active ? 'Kartu operasional' : 'Kartu akun demo nonaktif'
      }
    });
  }

  await prisma.deviceReader.upsert({
    where: { apiKey: 'shr_reader_gate_primary_2026' },
    update: {
      name: 'Reader Gerbang Utama',
      status: 'ACTIVE',
      type: ReaderType.GATE,
      locationLabel: 'Gerbang utama',
      locationLat: 0,
      locationLng: 0
    },
    create: {
      name: 'Reader Gerbang Utama',
      apiKey: 'shr_reader_gate_primary_2026',
      status: 'ACTIVE',
      type: ReaderType.GATE,
      locationLabel: 'Gerbang utama',
      locationLat: 0,
      locationLng: 0
    }
  });

  await prisma.deviceReader.upsert({
    where: { apiKey: 'shr_reader_mushola_2026' },
    update: {
      name: 'Reader Mushola',
      status: 'ACTIVE',
      type: ReaderType.MUSHOLA,
      locationLabel: 'Mushola'
    },
    create: {
      name: 'Reader Mushola',
      apiKey: 'shr_reader_mushola_2026',
      status: 'ACTIVE',
      type: ReaderType.MUSHOLA,
      locationLabel: 'Mushola'
    }
  });

  for (const student of students) {
    for (const prayerType of [PrayerType.DHUHA, PrayerType.DZUHUR]) {
      const scannedAt = prayerType === PrayerType.DHUHA ? withTime(today, 7, 20) : withTime(today, 12, 10);
      await prisma.prayerAttendanceLog.upsert({
        where: {
          studentId_prayerType_attendanceDate: {
            studentId: student.id,
            prayerType,
            attendanceDate: dateOnly(scannedAt)
          }
        },
        update: { scannedAt, deviceId: 'shr_reader_mushola_2026' },
        create: {
          studentId: student.id,
          prayerType,
          attendanceDate: dateOnly(scannedAt),
          scannedAt,
          deviceId: 'shr_reader_mushola_2026',
          source: ReaderType.MUSHOLA
        }
      });
    }
  }

  await prisma.attendancePolicy.upsert({
    where: { id: 1 },
    update: {
      requireStudentGateInBeforeClass: true,
      requireStudentDhuha: true,
      requireStudentDzuhur: true,
      requireStudentAsharForAfternoon: true,
      requireStudentClassEligibility: true,
      requireTeacherGateIn: true,
      requireTeacherGateOut: true,
      requireStaffGateIn: true,
      requireStaffGateOut: true,
      allowManualOverride: true,
      allowStudentAsharCheckoutOverride: true,
      dhuhaStartTime: '07:00',
      dhuhaEndTime: '10:30',
      dzuhurStartTime: '11:45',
      dzuhurEndTime: '13:30',
      asharStartTime: '15:00',
      asharEndTime: '16:30',
      asharRequiredClassEndTime: '15:00',
      duplicateScanWindowMinutes: 5
    },
    create: {
      id: 1,
      requireStudentGateInBeforeClass: true,
      requireStudentDhuha: true,
      requireStudentDzuhur: true,
      requireStudentAsharForAfternoon: true,
      requireStudentClassEligibility: true,
      requireTeacherGateIn: true,
      requireTeacherGateOut: true,
      requireStaffGateIn: true,
      requireStaffGateOut: true,
      allowManualOverride: true,
      allowStudentAsharCheckoutOverride: true,
      dhuhaStartTime: '07:00',
      dhuhaEndTime: '10:30',
      dzuhurStartTime: '11:45',
      dzuhurEndTime: '13:30',
      asharStartTime: '15:00',
      asharEndTime: '16:30',
      asharRequiredClassEndTime: '15:00',
      duplicateScanWindowMinutes: 5
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

  await prisma.reconciliationFlag.upsert({
    where: {
      type_sessionId_userId: {
        type: ReconciliationFlagType.BOLOS_KELAS,
        sessionId: sessionA.id,
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
      sessionId: sessionA.id,
      userId: students[3].id,
      status: ReconciliationStatus.OPEN,
      details: {
        gateIn: true,
        classStatus: StudentAttendanceStatus.ALPA
      }
    }
  });

  await prisma.reconciliationFlag.upsert({
    where: {
      type_sessionId_userId: {
        type: ReconciliationFlagType.ANOMALI_BUKA_TANPA_GERBANG,
        sessionId: sessionB.id,
        userId: guruMapelB.id
      }
    },
    update: {
      status: ReconciliationStatus.OPEN,
      details: {
        gateIn: false,
        teacherPresence: TeacherSessionStatus.HADIR
      }
    },
    create: {
      type: ReconciliationFlagType.ANOMALI_BUKA_TANPA_GERBANG,
      sessionId: sessionB.id,
      userId: guruMapelB.id,
      status: ReconciliationStatus.OPEN,
      details: {
        gateIn: false,
        teacherPresence: TeacherSessionStatus.HADIR
      }
    }
  });

  await prisma.auditEntry.create({
    data: {
      actorId: admin.id,
      action: 'seed.full.completed',
      resource: 'system',
      resourceId: 'seed',
      after: {
        classes: 2,
        subjects: 3,
        sessions: [sessionA.id, sessionB.id, sessionC.id],
        users: 11
      }
    }
  });

  console.log('Seed full production demo completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
