/**
 * Amnesty / resolve historical OPEN ReconciliationFlag rows (ops policy).
 *
 * Default: read-only preflight.
 * Apply: --apply --confirm-backup-path=/path/to/pg_dump.file
 *
 * Effects (idempotent, no hard-delete, no fake student HADIR, no GateLog invent):
 * - ReconciliationFlag OPEN → RESOLVED with reason (default AMNESTY_OPEN_FLAGS_2026-08)
 * - Optional filter by --type=CSV and createdAt range --from/--to (YYYY-MM-DD, Jakarta day)
 *
 * Does NOT:
 * - mutate Session / TeacherSessionPresence / StudentAttendance / GateLog
 * - bulk-insert AuditEntry (hash chain)
 *
 * Never prints DATABASE_URL or secrets.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PrismaClient,
  ReconciliationFlagType,
  ReconciliationStatus
} from '@prisma/client';

const DEFAULT_REASON = 'AMNESTY_OPEN_FLAGS_2026-08';
const ACTOR_NOTE = 'ops.amnesty_open_flags';
const BATCH_SIZE = 2000;

const ALL_TYPES = new Set<string>(Object.values(ReconciliationFlagType));

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

function parseTypes(raw: string | null): ReconciliationFlagType[] | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    if (!ALL_TYPES.has(part)) {
      throw new Error(`Unknown flag type: ${part}. Valid: ${[...ALL_TYPES].join(', ')}`);
    }
  }
  return parts as ReconciliationFlagType[];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL unset.');
    process.exit(2);
  }

  const apply = hasFlag('--apply');
  const backupPath = argValue('--confirm-backup-path');
  const jsonOut = resolve(argValue('--json') ?? 'artifacts/ops/amnesty-open-flags.json');
  const from = parseDateArg(argValue('--from'), new Date('2026-07-01T00:00:00.000Z'));
  const to = parseDateArg(argValue('--to'), jakartaTodayUtcDate());
  // Inclusive end-of-day (next midnight exclusive via lt endExclusive)
  const endExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);
  const reason = (argValue('--reason') ?? DEFAULT_REASON).trim() || DEFAULT_REASON;
  const types = parseTypes(argValue('--type'));
  const maxRows = Number(argValue('--max') ?? '0') || 0;

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
    reason,
    actor: ACTOR_NOTE,
    from: dateKey(from),
    to: dateKey(to),
    types: types ?? 'ALL',
    maxRows: maxRows || null,
    startedAt: new Date().toISOString()
  };

  try {
    const where = {
      status: ReconciliationStatus.OPEN,
      createdAt: { gte: from, lt: endExclusive },
      ...(types ? { type: { in: types } } : {})
    };

    const totalOpen = await prisma.reconciliationFlag.count({ where });
    const byTypeRows = await prisma.reconciliationFlag.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
      orderBy: { _count: { type: 'desc' } }
    });
    const byType = Object.fromEntries(byTypeRows.map((row) => [row.type, row._count._all]));
    const sample = await prisma.reconciliationFlag.findMany({
      where,
      select: {
        id: true,
        type: true,
        createdAt: true,
        sessionId: true,
        userId: true,
        user: { select: { fullName: true, username: true, role: true } }
      },
      orderBy: { createdAt: 'asc' },
      take: 20
    });

    report.preflight = {
      openFlags: totalOpen,
      byType,
      sample: sample.map((row) => ({
        id: row.id,
        type: row.type,
        createdAt: row.createdAt.toISOString(),
        sessionId: row.sessionId,
        user: row.user.fullName,
        username: row.user.username,
        role: row.user.role
      }))
    };

    if (!apply) {
      report.ok = true;
      report.message = 'Preflight only. Re-run with --apply --confirm-backup-path=... to mutate. Prefer --type=... for scoped cleanup.';
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

    if (!totalOpen) {
      report.ok = true;
      report.applied = { flagsResolved: 0, batches: 0 };
      report.message = 'Nothing to amnesty';
      mkdirSync(dirname(jsonOut), { recursive: true });
      writeFileSync(jsonOut, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ ok: true, mode: 'apply', flagsResolved: 0 }, null, 2));
      return;
    }

    const now = new Date();
    let flagsResolved = 0;
    let batches = 0;
    const limit = maxRows > 0 ? maxRows : totalOpen;

    while (flagsResolved < limit) {
      const take = Math.min(BATCH_SIZE, limit - flagsResolved);
      const batch = await prisma.reconciliationFlag.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take
      });
      if (!batch.length) break;

      const ids = batch.map((row) => row.id);
      const updated = await prisma.reconciliationFlag.updateMany({
        where: {
          id: { in: ids },
          status: ReconciliationStatus.OPEN
        },
        data: {
          status: ReconciliationStatus.RESOLVED,
          reviewStatus: 'RESOLVED',
          resolvedAt: now,
          resolvedReason: reason
        }
      });
      flagsResolved += updated.count;
      batches += 1;
      if (updated.count === 0) break;
    }

    const remaining = await prisma.reconciliationFlag.count({ where });
    report.applied = { flagsResolved, batches, reason };
    report.postcondition = { remainingOpenMatchingFilter: remaining };
    report.ok = maxRows > 0 ? flagsResolved >= 0 : remaining === 0;

    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      ok: report.ok,
      mode: 'apply',
      jsonOut,
      applied: report.applied,
      postcondition: report.postcondition
    }, null, 2));
    if (!report.ok && maxRows <= 0) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
