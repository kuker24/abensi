/**
 * Amnesty historical MISSED sessions (ops policy AMNESTY_MISSED_2026-08).
 *
 * Default: read-only preflight.
 * Apply: --apply --confirm-backup-path=/path/to/pg_dump.file
 *
 * Effects (idempotent, no hard-delete, no fake student HADIR):
 * - Session status MISSED → CLOSED (businessDate in [from, to])
 * - TeacherSessionPresence for session.teacherId → EXCUSED_ABSENCE (upsert)
 * - Open ReconciliationFlag on those sessions → RESOLVED with reason
 *
 * Does NOT:
 * - recover to OPEN / capture roster
 * - invent GateLog for staff
 * - create StudentAttendance rows
 *
 * Never prints DATABASE_URL or secrets.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PrismaClient,
  ReconciliationStatus,
  SessionStatus,
  TeacherSessionStatus
} from '@prisma/client';

const REASON = 'AMNESTY_MISSED_2026-08';
const ACTOR_NOTE = 'ops.amnesty_missed_sessions';

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
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

function parseDateArg(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${value}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL unset.');
    process.exit(2);
  }

  const apply = hasFlag('--apply');
  const backupPath = argValue('--confirm-backup-path');
  const jsonOut = resolve(argValue('--json') ?? 'artifacts/ops/amnesty-missed-sessions.json');
  const from = parseDateArg(argValue('--from'), new Date('2026-07-01T00:00:00.000Z'));
  const to = parseDateArg(argValue('--to'), jakartaTodayUtcDate());

  if (from.getTime() > to.getTime()) {
    console.error('BLOCKED: --from must be <= --to');
    process.exit(2);
  }

  if (apply) {
    if (!backupPath) {
      console.error('BLOCKED: --apply requires --confirm-backup-path=...');
      process.exit(2);
    }
    try {
      const st = statSync(backupPath);
      if (!st.isFile() || st.size < 1024) {
        console.error('BLOCKED: backup path invalid');
        process.exit(2);
      }
    } catch {
      console.error('BLOCKED: backup path not found');
      process.exit(2);
    }
  }

  const prisma = new PrismaClient();
  const report: Record<string, unknown> = {
    mode: apply ? 'apply' : 'preflight',
    reason: REASON,
    actor: ACTOR_NOTE,
    from: dateKey(from),
    to: dateKey(to),
    startedAt: new Date().toISOString()
  };

  try {
    const missed = await prisma.session.findMany({
      where: {
        status: SessionStatus.MISSED,
        businessDate: { gte: from, lte: to }
      },
      select: {
        id: true,
        teacherId: true,
        businessDate: true,
        classId: true,
        schoolClass: { select: { code: true } },
        subject: { select: { code: true, name: true } },
        teacher: { select: { fullName: true, username: true } },
        _count: { select: { rosters: true, attendances: true } }
      },
      orderBy: [{ businessDate: 'asc' }, { startsAt: 'asc' }]
    });

    const sessionIds = missed.map((row) => row.id);
    const presenceAlpa = sessionIds.length
      ? await prisma.teacherSessionPresence.count({
        where: {
          sessionId: { in: sessionIds },
          status: TeacherSessionStatus.ALPA_MENGAJAR
        }
      })
      : 0;
    const openFlags = sessionIds.length
      ? await prisma.reconciliationFlag.count({
        where: {
          sessionId: { in: sessionIds },
          status: ReconciliationStatus.OPEN
        }
      })
      : 0;

    const byGrade = { x: 0, xi: 0, xii: 0, other: 0 };
    for (const row of missed) {
      const code = row.schoolClass.code;
      if (/^XII(\s|$)/i.test(code)) byGrade.xii += 1;
      else if (/^XI(\s|$)/i.test(code)) byGrade.xi += 1;
      else if (/^X(\s|$)/i.test(code)) byGrade.x += 1;
      else byGrade.other += 1;
    }

    report.preflight = {
      missedSessions: missed.length,
      presenceAlpaMengajar: presenceAlpa,
      openReconciliationFlags: openFlags,
      byGrade,
      withRoster: missed.filter((row) => row._count.rosters > 0).length,
      withAttendance: missed.filter((row) => row._count.attendances > 0).length
    };
    report.sample = missed.slice(0, 15).map((row) => ({
      id: row.id,
      businessDate: dateKey(row.businessDate),
      classCode: row.schoolClass.code,
      subject: row.subject.code,
      teacher: row.teacher.fullName,
      rosters: row._count.rosters,
      attendances: row._count.attendances
    }));

    if (!apply) {
      report.ok = true;
      report.message = 'Preflight only. Re-run with --apply --confirm-backup-path=... to mutate.';
      mkdirSync(dirname(jsonOut), { recursive: true });
      writeFileSync(jsonOut, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({
        ok: true,
        mode: 'preflight',
        jsonOut,
        preflight: report.preflight
      }, null, 2));
      return;
    }

    if (!sessionIds.length) {
      report.ok = true;
      report.applied = { sessionsClosed: 0, presenceUpdated: 0, presenceCreated: 0, flagsResolved: 0 };
      report.message = 'Nothing to amnesty';
      mkdirSync(dirname(jsonOut), { recursive: true });
      writeFileSync(jsonOut, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ ok: true, mode: 'apply', closed: 0 }, null, 2));
      return;
    }

    const now = new Date();
    const applied = await prisma.$transaction(async (tx) => {
      const closed = await tx.session.updateMany({
        where: {
          id: { in: sessionIds },
          status: SessionStatus.MISSED
        },
        data: {
          status: SessionStatus.CLOSED,
          closedAt: now
        }
      });

      let presenceUpdated = 0;
      let presenceCreated = 0;
      for (const row of missed) {
        const existing = await tx.teacherSessionPresence.findUnique({
          where: {
            sessionId_teacherId: {
              sessionId: row.id,
              teacherId: row.teacherId
            }
          }
        });
        if (existing) {
          if (existing.status !== TeacherSessionStatus.EXCUSED_ABSENCE) {
            await tx.teacherSessionPresence.update({
              where: { id: existing.id },
              data: { status: TeacherSessionStatus.EXCUSED_ABSENCE }
            });
            presenceUpdated += 1;
          }
        } else {
          await tx.teacherSessionPresence.create({
            data: {
              sessionId: row.id,
              teacherId: row.teacherId,
              status: TeacherSessionStatus.EXCUSED_ABSENCE
            }
          });
          presenceCreated += 1;
        }
      }

      const flagsResolved = await tx.reconciliationFlag.updateMany({
        where: {
          sessionId: { in: sessionIds },
          status: ReconciliationStatus.OPEN
        },
        data: {
          status: ReconciliationStatus.RESOLVED,
          resolvedAt: now,
          resolvedReason: REASON
        }
      });

      return {
        action: ACTOR_NOTE,
        reason: REASON,
        sessionsClosed: closed.count,
        presenceUpdated,
        presenceCreated,
        flagsResolved: flagsResolved.count
      };
    }, { timeout: 180_000 });

    const remainingMissed = await prisma.session.count({
      where: {
        status: SessionStatus.MISSED,
        businessDate: { gte: from, lte: to }
      }
    });
    const remainingAlpa = sessionIds.length
      ? await prisma.teacherSessionPresence.count({
        where: {
          sessionId: { in: sessionIds },
          status: TeacherSessionStatus.ALPA_MENGAJAR
        }
      })
      : 0;

    report.applied = applied;
    report.postcondition = {
      remainingMissedInRange: remainingMissed,
      remainingAlpaMengajarOnAmnestiedSessions: remainingAlpa
    };
    report.ok = remainingMissed === 0 && remainingAlpa === 0;

    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      ok: report.ok,
      mode: 'apply',
      jsonOut,
      applied,
      postcondition: report.postcondition
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
