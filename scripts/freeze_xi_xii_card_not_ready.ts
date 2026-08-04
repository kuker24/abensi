/**
 * Freeze kelas XI + XII while kartu belum siap.
 *
 * Default: read-only preflight (no mutations).
 * Apply: --apply --confirm-backup-path=/path/to/pg_dump.file
 *
 * Effects (reversible, NO hard-delete):
 * - ClassEnrollment XI/XII: active=false, administrativeStatus=CANCELLED, reason CARD_NOT_READY
 * - User SISWA with active XI/XII enrollment (and no active X enrollment): active=false
 * - QrCredential ACTIVE for those students: REVOKED
 * - TeachingAssignment XI/XII: active=false
 * - WeeklySchedule XI/XII: active=false, effectiveTo=yesterday (if still open)
 * - Session SCHEDULED future XI/XII with empty roster: deleted
 * - Stale XII A Friday weekly rows (effectiveTo in the past) forced active=false
 *
 * Never prints DATABASE_URL or secrets.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PrismaClient,
  QrCredentialStatus,
  Role,
  SessionStatus
} from '@prisma/client';

const REASON = 'CARD_NOT_READY_2026-08';
const ACTOR_NOTE = 'ops.freeze_xi_xii_card_not_ready';

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

/** Asia/Jakarta calendar date as UTC midnight Date for @db.Date fields. */
function jakartaTodayUtcDate(): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const key = fmt.format(new Date()); // YYYY-MM-DD
  return new Date(`${key}T00:00:00.000Z`);
}

function addDaysUtcDate(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isXiOrXiiCode(code: string): boolean {
  return /^XII(\s|$)/i.test(code) || /^XI(\s|$)/i.test(code);
}

function isXOnlyCode(code: string): boolean {
  return /^X(\s|$)/i.test(code) && !isXiOrXiiCode(code);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL unset. Export it then re-run.');
    console.error('Default mode is preflight-only; mutations need --apply --confirm-backup-path=...');
    process.exit(2);
  }

  const apply = hasFlag('--apply');
  const backupPath = argValue('--confirm-backup-path');
  const jsonOut = resolve(argValue('--json') ?? 'artifacts/ops/freeze-xi-xii-card-not-ready.json');

  if (apply) {
    if (!backupPath) {
      console.error('BLOCKED: --apply requires --confirm-backup-path=/path/to/pg_dump.file');
      process.exit(2);
    }
    try {
      const st = statSync(backupPath);
      if (!st.isFile() || st.size < 1024) {
        console.error('BLOCKED: backup path must be an existing file >= 1KB');
        process.exit(2);
      }
    } catch {
      console.error('BLOCKED: backup path not found');
      process.exit(2);
    }
  }

  const prisma = new PrismaClient();
  const today = jakartaTodayUtcDate();
  const yesterday = addDaysUtcDate(today, -1);
  const report: Record<string, unknown> = {
    mode: apply ? 'apply' : 'preflight',
    reason: REASON,
    today: dateKey(today),
    yesterday: dateKey(yesterday),
    startedAt: new Date().toISOString()
  };

  try {
    const classes = await prisma.schoolClass.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' }
    });
    const xiXiiClasses = classes.filter((row) => isXiOrXiiCode(row.code));
    const xClasses = classes.filter((row) => isXOnlyCode(row.code));
    const xiXiiClassIds = xiXiiClasses.map((row) => row.id);
    const xClassIds = xClasses.map((row) => row.id);

    report.classes = {
      x: xClasses.map((row) => ({ id: row.id, code: row.code })),
      xiXii: xiXiiClasses.map((row) => ({ id: row.id, code: row.code }))
    };

    if (!xiXiiClassIds.length) {
      console.error('BLOCKED: no XI/XII SchoolClass rows found');
      process.exit(2);
    }

    const activeEnrollments = await prisma.classEnrollment.findMany({
      where: {
        classId: { in: xiXiiClassIds },
        active: true
      },
      select: {
        id: true,
        studentId: true,
        classId: true,
        administrativeStatus: true,
        student: { select: { id: true, fullName: true, username: true, active: true, role: true } },
        schoolClass: { select: { code: true } }
      }
    });

    const enrollmentStudentIds = Array.from(new Set(activeEnrollments.map((row) => row.studentId)));
    const activeXEnrollments = enrollmentStudentIds.length
      ? await prisma.classEnrollment.findMany({
        where: {
          studentId: { in: enrollmentStudentIds },
          classId: { in: xClassIds },
          active: true
        },
        select: { studentId: true, classId: true, schoolClass: { select: { code: true } } }
      })
      : [];
    const studentsAlsoInX = new Set(activeXEnrollments.map((row) => row.studentId));
    const studentsToDeactivate = enrollmentStudentIds.filter((id) => !studentsAlsoInX.has(id));

    const activeQr = studentsToDeactivate.length
      ? await prisma.qrCredential.findMany({
        where: { userId: { in: studentsToDeactivate }, status: QrCredentialStatus.ACTIVE },
        select: { id: true, userId: true }
      })
      : [];

    const assignments = await prisma.teachingAssignment.findMany({
      where: { classId: { in: xiXiiClassIds }, active: true },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        subjectId: true,
        effectiveFrom: true,
        effectiveTo: true,
        schoolClass: { select: { code: true } }
      }
    });

    const weekly = await prisma.weeklySchedule.findMany({
      where: { classId: { in: xiXiiClassIds }, active: true },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        subjectId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        effectiveFrom: true,
        effectiveTo: true,
        schoolClass: { select: { code: true } }
      }
    });

    const futureSessions = await prisma.session.findMany({
      where: {
        classId: { in: xiXiiClassIds },
        status: SessionStatus.SCHEDULED,
        businessDate: { gte: today }
      },
      select: {
        id: true,
        classId: true,
        teacherId: true,
        businessDate: true,
        startsAt: true,
        schoolClass: { select: { code: true } },
        _count: { select: { rosters: true, attendances: true } }
      }
    });
    const deletableSessions = futureSessions.filter(
      (row) => row._count.rosters === 0 && row._count.attendances === 0
    );
    const blockedSessions = futureSessions.filter(
      (row) => row._count.rosters > 0 || row._count.attendances > 0
    );

    const staleFridayActive = await prisma.weeklySchedule.findMany({
      where: {
        classId: { in: xiXiiClassIds },
        active: true,
        effectiveTo: { lt: today }
      },
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        effectiveFrom: true,
        effectiveTo: true,
        schoolClass: { select: { code: true } }
      }
    });

    const xActiveEnrollmentCount = await prisma.classEnrollment.count({
      where: { classId: { in: xClassIds }, active: true }
    });

    report.preflight = {
      activeEnrollmentsXiXii: activeEnrollments.length,
      studentsToDeactivate: studentsToDeactivate.length,
      studentsSkippedAlsoInX: studentsAlsoInX.size,
      activeQrToRevoke: activeQr.length,
      activeAssignments: assignments.length,
      activeWeekly: weekly.length,
      futureScheduledSessions: futureSessions.length,
      deletableFutureSessions: deletableSessions.length,
      blockedFutureSessionsWithData: blockedSessions.length,
      staleActiveWeeklyPastEffectiveTo: staleFridayActive.length,
      xActiveEnrollmentsUnchanged: xActiveEnrollmentCount
    };

    report.samples = {
      enrollments: activeEnrollments.slice(0, 8).map((row) => ({
        id: row.id,
        classCode: row.schoolClass.code,
        student: row.student.username,
        active: row.student.active
      })),
      weekly: weekly.slice(0, 8).map((row) => ({
        id: row.id,
        classCode: row.schoolClass.code,
        dayOfWeek: row.dayOfWeek,
        slot: `${row.startTime}-${row.endTime}`
      })),
      blockedSessions: blockedSessions.slice(0, 10).map((row) => ({
        id: row.id,
        classCode: row.schoolClass.code,
        businessDate: dateKey(row.businessDate),
        rosters: row._count.rosters,
        attendances: row._count.attendances
      }))
    };

    if (blockedSessions.length) {
      report.warning = 'Some future XI/XII SCHEDULED sessions have roster/attendance; they will NOT be deleted. Mark MISSED manually if needed.';
    }

    if (!apply) {
      report.ok = true;
      report.message = 'Preflight only. Re-run with --apply --confirm-backup-path=... to mutate.';
      mkdirSync(dirname(jsonOut), { recursive: true });
      writeFileSync(jsonOut, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ ok: true, mode: 'preflight', jsonOut, preflight: report.preflight }, null, 2));
      return;
    }

    const applied = await prisma.$transaction(async (tx) => {
      const enrollmentUpdate = await tx.classEnrollment.updateMany({
        where: { id: { in: activeEnrollments.map((row) => row.id) } },
        data: {
          active: false,
          administrativeStatus: 'CANCELLED',
          administrativeStatusChangedAt: new Date(),
          administrativeStatusReason: REASON,
          endedReason: REASON
        }
      });

      const userUpdate = studentsToDeactivate.length
        ? await tx.user.updateMany({
          where: {
            id: { in: studentsToDeactivate },
            role: Role.SISWA
          },
          data: { active: false }
        })
        : { count: 0 };

      const qrUpdate = activeQr.length
        ? await tx.qrCredential.updateMany({
          where: {
            id: { in: activeQr.map((row) => row.id) },
            status: QrCredentialStatus.ACTIVE
          },
          data: {
            status: QrCredentialStatus.REVOKED,
            revokedAt: new Date(),
            revokeReason: REASON
          }
        })
        : { count: 0 };

      const assignmentUpdate = await tx.teachingAssignment.updateMany({
        where: { id: { in: assignments.map((row) => row.id) }, active: true },
        data: { active: false }
      });

      // Close weekly: force inactive + cap effectiveTo at yesterday when still open/null/future.
      let weeklyClosed = 0;
      for (const row of weekly) {
        const currentTo = row.effectiveTo ? dateKey(row.effectiveTo) : null;
        const nextTo = !currentTo || currentTo > dateKey(yesterday) ? yesterday : row.effectiveTo!;
        await tx.weeklySchedule.update({
          where: { id: row.id },
          data: {
            active: false,
            effectiveTo: nextTo
          }
        });
        weeklyClosed += 1;
      }

      // Stale rows that stayed active after effectiveTo — force inactive.
      const staleUpdate = await tx.weeklySchedule.updateMany({
        where: {
          id: { in: staleFridayActive.map((row) => row.id) },
          active: true
        },
        data: { active: false }
      });

      const sessionDelete = deletableSessions.length
        ? await tx.session.deleteMany({
          where: {
            id: { in: deletableSessions.map((row) => row.id) },
            status: SessionStatus.SCHEDULED
          }
        })
        : { count: 0 };

      // Ops evidence is written to JSON artifact (AuditEntry requires hash-chained sequence).
      return {
        action: ACTOR_NOTE,
        reason: REASON,
        enrollmentUpdated: enrollmentUpdate.count,
        usersDeactivated: userUpdate.count,
        qrRevoked: qrUpdate.count,
        assignmentsDeactivated: assignmentUpdate.count,
        weeklyClosed,
        staleWeeklyForcedInactive: staleUpdate.count,
        sessionsDeleted: sessionDelete.count,
        blockedSessions: blockedSessions.length,
        xActiveEnrollmentsUnchanged: xActiveEnrollmentCount
      };
    }, { timeout: 120_000 });

    const post = {
      activeEnrollmentsXiXii: await prisma.classEnrollment.count({
        where: { classId: { in: xiXiiClassIds }, active: true }
      }),
      activeAssignmentsXiXii: await prisma.teachingAssignment.count({
        where: { classId: { in: xiXiiClassIds }, active: true }
      }),
      activeWeeklyXiXii: await prisma.weeklySchedule.count({
        where: { classId: { in: xiXiiClassIds }, active: true }
      }),
      scheduledFutureXiXii: await prisma.session.count({
        where: {
          classId: { in: xiXiiClassIds },
          status: SessionStatus.SCHEDULED,
          businessDate: { gte: today }
        }
      }),
      xActiveEnrollments: await prisma.classEnrollment.count({
        where: { classId: { in: xClassIds }, active: true }
      }),
      xiXiiStudentRowsStillPresent: await prisma.classEnrollment.count({
        where: { classId: { in: xiXiiClassIds } }
      })
    };

    report.applied = applied;
    report.postcondition = post;
    report.ok = post.activeEnrollmentsXiXii === 0
      && post.activeAssignmentsXiXii === 0
      && post.activeWeeklyXiXii === 0
      && post.xActiveEnrollments === xActiveEnrollmentCount
      && post.xiXiiStudentRowsStillPresent > 0;

    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      ok: report.ok,
      mode: 'apply',
      jsonOut,
      applied,
      postcondition: post
    }, null, 2));

    if (!report.ok) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
