/**
 * Read-only teacher schedule readiness report.
 * Focus: kelas X wajib absensi; XI/XII should be frozen.
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/teacher_schedule_readiness.ts
 *   optional: --json=artifacts/ops/teacher-schedule-readiness.json
 *
 * Never prints DATABASE_URL or secrets.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient, Role, SessionStatus } from '@prisma/client';

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function jakartaTodayUtcDate(): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return new Date(`${fmt.format(new Date())}T00:00:00.000Z`);
}

function isXiOrXiiCode(code: string): boolean {
  return /^XII(\s|$)/i.test(code) || /^XI(\s|$)/i.test(code);
}

function isXOnlyCode(code: string): boolean {
  return /^X(\s|$)/i.test(code) && !isXiOrXiiCode(code);
}

/** Prisma/JS: Sunday=0 … Saturday=6. School JP uses Monday=1 … Friday=5 (same as Prisma for Mon–Sat). */
function jakartaDayOfWeek(): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[fmt.format(new Date())] ?? 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL unset.');
    process.exit(2);
  }

  const jsonOut = resolve(argValue('--json') ?? 'artifacts/ops/teacher-schedule-readiness.json');
  const prisma = new PrismaClient();
  const today = jakartaTodayUtcDate();
  const dayOfWeek = jakartaDayOfWeek();

  try {
    const teachers = await prisma.user.findMany({
      where: { role: Role.GURU_MAPEL, active: true },
      select: { id: true, fullName: true, username: true },
      orderBy: { fullName: 'asc' }
    });

    const classes = await prisma.schoolClass.findMany({ select: { id: true, code: true } });
    const xClassIds = new Set(classes.filter((row) => isXOnlyCode(row.code)).map((row) => row.id));
    const xiXiiClassIds = new Set(classes.filter((row) => isXiOrXiiCode(row.code)).map((row) => row.id));

    const [assignments, weekly, sessionsToday, gateIns] = await Promise.all([
      prisma.teachingAssignment.findMany({
        where: { active: true },
        select: { teacherId: true, classId: true, schoolClass: { select: { code: true } } }
      }),
      prisma.weeklySchedule.findMany({
        where: {
          active: true,
          dayOfWeek,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
          effectiveFrom: { lte: today }
        },
        select: {
          teacherId: true,
          classId: true,
          startTime: true,
          endTime: true,
          schoolClass: { select: { code: true } },
          subject: { select: { code: true } }
        }
      }),
      prisma.session.findMany({
        where: { businessDate: today },
        select: {
          id: true,
          teacherId: true,
          classId: true,
          status: true,
          startsAt: true,
          schoolClass: { select: { code: true } },
          subject: { select: { code: true } },
          _count: { select: { rosters: true } }
        }
      }),
      prisma.gateLog.findMany({
        where: { direction: 'IN', businessDate: today },
        select: { userId: true },
        distinct: ['userId']
      })
    ]);

    const gateSet = new Set(gateIns.map((row) => row.userId));

    const items = teachers.map((teacher) => {
      const ta = assignments.filter((row) => row.teacherId === teacher.id);
      const w = weekly.filter((row) => row.teacherId === teacher.id);
      const s = sessionsToday.filter((row) => row.teacherId === teacher.id);
      const taX = ta.filter((row) => xClassIds.has(row.classId));
      const taXiXii = ta.filter((row) => xiXiiClassIds.has(row.classId));
      const wX = w.filter((row) => xClassIds.has(row.classId));
      const wXiXii = w.filter((row) => xiXiiClassIds.has(row.classId));
      const sX = s.filter((row) => xClassIds.has(row.classId));
      const sXiXii = s.filter((row) => xiXiiClassIds.has(row.classId));
      const flags: string[] = [];
      if (taXiXii.length) flags.push('ACTIVE_ASSIGNMENT_XI_XII');
      if (wXiXii.length) flags.push('ACTIVE_WEEKLY_TODAY_XI_XII');
      if (sXiXii.some((row) => row.status === SessionStatus.SCHEDULED)) flags.push('SCHEDULED_SESSION_TODAY_XI_XII');
      if (taX.length && !wX.length && dayOfWeek >= 1 && dayOfWeek <= 5) flags.push('HAS_X_ASSIGNMENT_NO_WEEKLY_TODAY');
      if (wX.length && !sX.length) flags.push('HAS_X_WEEKLY_NO_SESSION_TODAY');
      if (sX.some((row) => row.status === SessionStatus.OPEN && row._count.rosters === 0)) flags.push('OPEN_X_EMPTY_ROSTER');
      return {
        teacherId: teacher.id,
        fullName: teacher.fullName,
        username: teacher.username,
        gateInToday: gateSet.has(teacher.id),
        assignmentX: taX.length,
        assignmentXiXii: taXiXii.length,
        weeklyTodayX: wX.map((row) => `${row.schoolClass.code} ${row.subject.code} ${row.startTime}-${row.endTime}`),
        weeklyTodayXiXii: wXiXii.map((row) => `${row.schoolClass.code} ${row.subject.code} ${row.startTime}-${row.endTime}`),
        sessionsTodayX: sX.map((row) => ({
          id: row.id,
          classCode: row.schoolClass.code,
          subject: row.subject.code,
          status: row.status,
          roster: row._count.rosters
        })),
        sessionsTodayXiXii: sXiXii.map((row) => ({
          id: row.id,
          classCode: row.schoolClass.code,
          subject: row.subject.code,
          status: row.status,
          roster: row._count.rosters
        })),
        flags
      };
    });

    const summary = {
      teachers: teachers.length,
      withFlags: items.filter((row) => row.flags.length).length,
      activeAssignmentXiXii: items.filter((row) => row.assignmentXiXii > 0).length,
      weeklyTodayXiXii: items.filter((row) => row.weeklyTodayXiXii.length > 0).length,
      scheduledXiXiiToday: items.filter((row) => row.flags.includes('SCHEDULED_SESSION_TODAY_XI_XII')).length,
      xWeeklyNoSession: items.filter((row) => row.flags.includes('HAS_X_WEEKLY_NO_SESSION_TODAY')).length,
      gateInToday: items.filter((row) => row.gateInToday).length
    };

    const report = {
      generatedAt: new Date().toISOString(),
      businessDate: today.toISOString().slice(0, 10),
      dayOfWeek,
      summary,
      flagged: items.filter((row) => row.flags.length),
      all: items
    };

    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: true, jsonOut, summary }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
