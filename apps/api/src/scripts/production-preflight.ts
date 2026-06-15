import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type CheckResult = { name: string; severity: 'INFO' | 'WARNING' | 'BLOCKING'; count: number; details: unknown[] };

function asCount(rows: Array<{ count?: bigint | number | string; count_text?: string }>) {
  const raw = rows[0]?.count ?? rows[0]?.count_text ?? 0;
  return Number(raw);
}

async function countRows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}

async function main() {
  const allowBlocking = process.argv.includes('--allow-blocking');
  const checks: CheckResult[] = [];

  const requiredTables = await countRows<{ count: bigint }>(`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('_prisma_migrations', 'User', 'Session', 'GeofencePolicy', 'AuthSession', 'GateLog', 'AuditEntry')
  `);
  checks.push({ name: 'required_schema_tables_present', severity: 'BLOCKING', count: asCount(requiredTables) === 7 ? 0 : 1, details: [{ present: asCount(requiredTables), required: 7 }] });

  const gateBusinessDateMismatch = await countRows<{ count: bigint }>(`
    SELECT COUNT(*)::bigint AS count
    FROM "GateLog"
    WHERE "businessDate" <> ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
  `).catch(() => [{ count: 0n }]);
  checks.push({ name: 'gate_business_date_mismatch', severity: 'BLOCKING', count: asCount(gateBusinessDateMismatch), details: [] });

  const sessionCollisions = await countRows(`
    SELECT "weeklyScheduleId", "businessDate"::text AS "businessDate", COUNT(*)::int AS count
    FROM "Session"
    WHERE "weeklyScheduleId" IS NOT NULL
    GROUP BY "weeklyScheduleId", "businessDate"
    HAVING COUNT(*) > 1
    LIMIT 100
  `).catch(() => []);
  checks.push({ name: 'session_generation_collisions', severity: 'BLOCKING', count: sessionCollisions.length, details: sessionCollisions });

  const enrollmentOverlaps = await countRows(`
    SELECT a."studentId", a.id AS left_id, b.id AS right_id
    FROM "ClassEnrollment" a
    JOIN "ClassEnrollment" b ON a.id < b.id AND a."studentId" = b."studentId"
     AND daterange(a."effectiveFrom", COALESCE(a."effectiveTo" + 1, 'infinity'::date), '[)') && daterange(b."effectiveFrom", COALESCE(b."effectiveTo" + 1, 'infinity'::date), '[)')
    LIMIT 100
  `).catch(() => []);
  checks.push({ name: 'enrollment_period_overlaps', severity: 'BLOCKING', count: enrollmentOverlaps.length, details: enrollmentOverlaps });

  const rosterGaps = await countRows(`
    SELECT sa.id AS "attendanceId", sa."sessionId", sa."studentId"
    FROM "StudentAttendance" sa
    LEFT JOIN "SessionRoster" sr ON sr."sessionId" = sa."sessionId" AND sr."studentId" = sa."studentId"
    WHERE sr.id IS NULL
    LIMIT 100
  `).catch(() => []);
  checks.push({ name: 'attendance_without_session_roster', severity: 'BLOCKING', count: rosterGaps.length, details: rosterGaps });

  const auditCounts = await countRows<{ count: bigint }>('SELECT COUNT(*)::bigint AS count FROM "AuditEntry"').catch(() => [{ count: 0n }]);
  checks.push({ name: 'audit_entry_count', severity: 'INFO', count: asCount(auditCounts), details: [] });

  const blockingCount = checks.filter((check) => check.severity === 'BLOCKING' && check.count > 0).length;
  const report = { generatedAt: new Date().toISOString(), blockingCount, checks };
  console.log(JSON.stringify(report, null, 2));
  if (blockingCount > 0 && !allowBlocking) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
