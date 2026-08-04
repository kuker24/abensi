/**
 * Deduplicate overlapping active KKA WeeklySchedule rows (FAHMI vs Salmi pattern).
 *
 * Default: read-only preflight.
 * Apply: --apply --confirm-backup-path=...
 * Default keep policy: keep newer createdAt (Salmi 2026-07-28), close older (FAHMI).
 * Override: --keep-teacher-name=Salmi  or  --keep-teacher-name=FAHMI
 *
 * Never prints DATABASE_URL or secrets.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient, Role } from '@prisma/client';

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

function addDaysUtcDate(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL unset.');
    process.exit(2);
  }

  const apply = hasFlag('--apply');
  const backupPath = argValue('--confirm-backup-path');
  const keepNameHint = (argValue('--keep-teacher-name') ?? 'Salmi').toLowerCase();
  const jsonOut = resolve(argValue('--json') ?? 'artifacts/ops/dedupe-kka-weekly.json');

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
  const today = jakartaTodayUtcDate();
  const yesterday = addDaysUtcDate(today, -1);
  const report: Record<string, unknown> = {
    mode: apply ? 'apply' : 'preflight',
    keepNameHint,
    today: dateKey(today),
    startedAt: new Date().toISOString()
  };

  try {
    const kkaSubjects = await prisma.subject.findMany({
      where: {
        OR: [
          { code: { equals: 'KKA', mode: 'insensitive' } },
          { name: { contains: 'KKA', mode: 'insensitive' } }
        ]
      },
      select: { id: true, code: true, name: true }
    });
    if (!kkaSubjects.length) {
      console.error('BLOCKED: Subject KKA not found');
      process.exit(2);
    }
    const subjectIds = kkaSubjects.map((row) => row.id);

    // All active KKA rows (including stale active=true with past effectiveTo).
    const rows = await prisma.weeklySchedule.findMany({
      where: {
        active: true,
        subjectId: { in: subjectIds }
      },
      include: {
        schoolClass: { select: { code: true } },
        teacher: { select: { id: true, fullName: true, username: true } },
        subject: { select: { code: true, name: true } }
      },
      orderBy: [{ classId: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }]
    });

    type Row = (typeof rows)[number];
    const closeIds: string[] = [];
    const pairs: Array<{
      classCode: string;
      dayOfWeek: number;
      slot: string;
      keep: { id: string; teacher: string; createdAt: string };
      close: { id: string; teacher: string; createdAt: string };
    }> = [];

    // Force-close stale active rows whose effective window already ended.
    const staleActivePastEnd = rows.filter((row) => row.effectiveTo && dateKey(row.effectiveTo) < dateKey(today));
    for (const row of staleActivePastEnd) {
      if (!closeIds.includes(row.id)) closeIds.push(row.id);
      pairs.push({
        classCode: row.schoolClass.code,
        dayOfWeek: row.dayOfWeek,
        slot: `${row.startTime}-${row.endTime} (stale effectiveTo)`,
        keep: { id: 'n/a', teacher: 'effective-now successor or none', createdAt: '' },
        close: {
          id: row.id,
          teacher: row.teacher.fullName,
          createdAt: row.createdAt.toISOString()
        }
      });
    }

    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i];
        const b = rows[j];
        if (a.classId !== b.classId || a.dayOfWeek !== b.dayOfWeek) continue;
        if (!overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
        // Only treat as live overlap when both are still effective-now.
        const aLive = !a.effectiveTo || dateKey(a.effectiveTo) >= dateKey(today);
        const bLive = !b.effectiveTo || dateKey(b.effectiveTo) >= dateKey(today);
        if (!aLive || !bLive) continue;

        const aHint = a.teacher.fullName.toLowerCase().includes(keepNameHint)
          || a.teacher.username.toLowerCase().includes(keepNameHint);
        const bHint = b.teacher.fullName.toLowerCase().includes(keepNameHint)
          || b.teacher.username.toLowerCase().includes(keepNameHint);

        let keep: Row;
        let close: Row;
        if (aHint && !bHint) {
          keep = a;
          close = b;
        } else if (bHint && !aHint) {
          keep = b;
          close = a;
        } else if (a.createdAt.getTime() >= b.createdAt.getTime()) {
          keep = a;
          close = b;
        } else {
          keep = b;
          close = a;
        }

        if (closeIds.includes(close.id)) continue;
        closeIds.push(close.id);
        pairs.push({
          classCode: a.schoolClass.code,
          dayOfWeek: a.dayOfWeek,
          slot: `${a.startTime}-${a.endTime} vs ${b.startTime}-${b.endTime}`,
          keep: {
            id: keep.id,
            teacher: keep.teacher.fullName,
            createdAt: keep.createdAt.toISOString()
          },
          close: {
            id: close.id,
            teacher: close.teacher.fullName,
            createdAt: close.createdAt.toISOString()
          }
        });
      }
    }

    // Also report any active effective-now class overlaps (all subjects) for visibility.
    const allActive = await prisma.weeklySchedule.findMany({
      where: {
        active: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }]
      },
      select: {
        id: true,
        classId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        schoolClass: { select: { code: true } },
        subject: { select: { code: true } },
        teacher: { select: { fullName: true } }
      }
    });
    const allOverlapPairs: Array<Record<string, unknown>> = [];
    for (let i = 0; i < allActive.length; i += 1) {
      for (let j = i + 1; j < allActive.length; j += 1) {
        const a = allActive[i];
        const b = allActive[j];
        if (a.classId !== b.classId || a.dayOfWeek !== b.dayOfWeek) continue;
        if (!overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
        allOverlapPairs.push({
          classCode: a.schoolClass.code,
          dayOfWeek: a.dayOfWeek,
          a: `${a.subject.code} ${a.startTime}-${a.endTime} ${a.teacher.fullName}`,
          b: `${b.subject.code} ${b.startTime}-${b.endTime} ${b.teacher.fullName}`
        });
      }
    }

    report.preflight = {
      kkaActiveRows: rows.length,
      kkaOverlapPairsToClose: pairs.length,
      closeIds,
      allSubjectOverlapPairsEffectiveNow: allOverlapPairs.length
    };
    report.pairs = pairs;
    report.allSubjectOverlapSample = allOverlapPairs.slice(0, 30);

    if (!apply) {
      report.ok = true;
      mkdirSync(dirname(jsonOut), { recursive: true });
      writeFileSync(jsonOut, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({
        ok: true,
        mode: 'preflight',
        jsonOut,
        kkaPairs: pairs.length,
        allOverlaps: allOverlapPairs.length
      }, null, 2));
      return;
    }

    if (!closeIds.length) {
      report.ok = true;
      report.message = 'Nothing to close';
      mkdirSync(dirname(jsonOut), { recursive: true });
      writeFileSync(jsonOut, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ ok: true, mode: 'apply', closed: 0 }, null, 2));
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      let closed = 0;
      for (const id of closeIds) {
        const row = await tx.weeklySchedule.findUnique({ where: { id } });
        if (!row || !row.active) continue;
        const currentTo = row.effectiveTo ? dateKey(row.effectiveTo) : null;
        const nextTo = !currentTo || currentTo > dateKey(yesterday) ? yesterday : row.effectiveTo!;
        await tx.weeklySchedule.update({
          where: { id },
          data: { active: false, effectiveTo: nextTo }
        });
        closed += 1;
      }

      // Ops evidence is written to JSON artifact (AuditEntry requires hash-chained sequence).
      return { closed, keepNameHint, pairs };
    });

    // postcondition: no KKA active overlaps
    const remaining = await prisma.weeklySchedule.findMany({
      where: {
        active: true,
        subjectId: { in: subjectIds },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }]
      },
      select: {
        id: true,
        classId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true
      }
    });
    let remainingPairs = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const a = remaining[i];
        const b = remaining[j];
        if (a.classId !== b.classId || a.dayOfWeek !== b.dayOfWeek) continue;
        if (overlaps(a.startTime, a.endTime, b.startTime, b.endTime)) remainingPairs += 1;
      }
    }

    report.applied = result;
    report.postcondition = { remainingKkaActive: remaining.length, remainingKkaOverlapPairs: remainingPairs };
    report.ok = remainingPairs === 0;

    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      ok: report.ok,
      mode: 'apply',
      jsonOut,
      closed: result.closed,
      remainingKkaOverlapPairs: remainingPairs
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
