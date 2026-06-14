import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type CheckResult = {
  name: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  count: number;
  details: unknown[];
};

function argValue(name: string, fallback: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function countRows<T extends Record<string, unknown>>(prisma: PrismaClient, sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}

function asCount(rows: Array<{ count?: bigint | number | string; count_text?: string }>) {
  const raw = rows[0]?.count ?? rows[0]?.count_text ?? 0;
  return Number(raw);
}

async function main() {
  const prisma = new PrismaClient();
  const outputPath = resolve(argValue('--json', 'artifacts/preflight/production-readiness-preflight.json'));
  const writeSqlTable = hasFlag('--write-sql-table');
  const allowBlocking = hasFlag('--allow-blocking');

  const checks: CheckResult[] = [];

  const gateBusinessDateMismatch = await countRows<{ count: bigint }>(prisma, `
    SELECT COUNT(*)::bigint AS count
    FROM "GateLog"
    WHERE "businessDate" <> ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
  `);
  checks.push({ name: 'gate_business_date_mismatch', severity: 'BLOCKING', count: asCount(gateBusinessDateMismatch), details: [] });

  const gateCollisions = await countRows(prisma, `
    SELECT "userId", direction, ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)::text AS "jakartaBusinessDate", COUNT(*)::int AS count
    FROM "GateLog"
    GROUP BY "userId", direction, ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, "userId"
    LIMIT 100
  `);
  checks.push({ name: 'gate_log_corrected_date_collisions', severity: 'BLOCKING', count: gateCollisions.length, details: gateCollisions });

  const sessionCollisions = await countRows(prisma, `
    SELECT "weeklyScheduleId", "businessDate"::text AS "businessDate", COUNT(*)::int AS count, array_agg(id ORDER BY "startsAt", id) AS ids
    FROM "Session"
    WHERE "weeklyScheduleId" IS NOT NULL
    GROUP BY "weeklyScheduleId", "businessDate"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 100
  `);
  checks.push({ name: 'session_generation_collisions', severity: 'BLOCKING', count: sessionCollisions.length, details: sessionCollisions });

  const scheduleOverlaps = await countRows(prisma, `
    WITH active AS (
      SELECT id, "teacherId", "classId", "roomId", "startsAt", "endsAt", status
      FROM "Session"
      WHERE status IN ('SCHEDULED', 'OPEN')
    )
    SELECT 'teacher' AS scope, a.id AS left_id, b.id AS right_id
    FROM active a JOIN active b ON a.id < b.id AND a."teacherId" = b."teacherId" AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
    UNION ALL
    SELECT 'class' AS scope, a.id AS left_id, b.id AS right_id
    FROM active a JOIN active b ON a.id < b.id AND a."classId" = b."classId" AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
    UNION ALL
    SELECT 'room' AS scope, a.id AS left_id, b.id AS right_id
    FROM active a JOIN active b ON a.id < b.id AND a."roomId" IS NOT NULL AND a."roomId" = b."roomId" AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
    LIMIT 100
  `);
  checks.push({ name: 'active_session_schedule_overlaps', severity: 'BLOCKING', count: scheduleOverlaps.length, details: scheduleOverlaps });

  const enrollmentOverlaps = await countRows(prisma, `
    SELECT a."studentId", a.id AS left_id, b.id AS right_id
    FROM "ClassEnrollment" a
    JOIN "ClassEnrollment" b ON a.id < b.id AND a."studentId" = b."studentId"
     AND daterange(a."effectiveFrom", COALESCE(a."effectiveTo" + 1, 'infinity'::date), '[)') && daterange(b."effectiveFrom", COALESCE(b."effectiveTo" + 1, 'infinity'::date), '[)')
    LIMIT 100
  `);
  checks.push({ name: 'enrollment_period_overlaps', severity: 'BLOCKING', count: enrollmentOverlaps.length, details: enrollmentOverlaps });

  const rosterGaps = await countRows(prisma, `
    SELECT sa.id AS "attendanceId", sa."sessionId", sa."studentId"
    FROM "StudentAttendance" sa
    LEFT JOIN "SessionRoster" sr ON sr."sessionId" = sa."sessionId" AND sr."studentId" = sa."studentId"
    WHERE sr.id IS NULL
    LIMIT 100
  `);
  checks.push({ name: 'attendance_without_session_roster', severity: 'BLOCKING', count: rosterGaps.length, details: rosterGaps });

  const auditCounts = await countRows<{ count: bigint }>(prisma, `SELECT COUNT(*)::bigint AS count FROM "AuditEntry"`);
  checks.push({ name: 'audit_entry_count', severity: 'INFO', count: asCount(auditCounts), details: [] });

  const blockingCount = checks.filter((check) => check.severity === 'BLOCKING' && check.count > 0).length;
  const report = {
    generatedAt: new Date().toISOString(),
    databaseUrlHost: process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':***@') ?? null,
    blockingCount,
    checks
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  if (writeSqlTable) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProductionReadinessPreflightReport" (
        id TEXT PRIMARY KEY,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        name TEXT NOT NULL,
        severity TEXT NOT NULL,
        count INTEGER NOT NULL,
        details JSONB NOT NULL
      )
    `);
    for (const check of checks) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ProductionReadinessPreflightReport" (id, name, severity, count, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (id) DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP, severity = EXCLUDED.severity, count = EXCLUDED.count, details = EXCLUDED.details`,
        `latest-${check.name}`,
        check.name,
        check.severity,
        check.count,
        JSON.stringify(check.details)
      );
    }
  }

  await prisma.$disconnect();
  console.log(JSON.stringify(report, null, 2));
  if (blockingCount > 0 && !allowBlocking) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
