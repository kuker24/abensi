import { PrismaClient } from '@prisma/client';
import { verifyAuditTrustBoundary } from '../modules/security/audit-trust-boundary.core';
import {
  createReadinessQueryFailure,
  createSanitizedReadinessCheck,
  createSanitizedReadinessReport,
  sanitizedReadinessError,
  type ReadinessSeverity
} from '../modules/security/readiness-report';

const prisma = new PrismaClient();

type CheckResult = { name: string; severity: ReadinessSeverity; count: number; details: unknown[] };

function asCount(rows: Array<{ count?: bigint | number | string; count_text?: string }>) {
  const raw = rows[0]?.count ?? rows[0]?.count_text ?? 0;
  return Number(raw);
}

async function queryRows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}

async function appendQueryCheck<T extends Record<string, unknown>>(
  checks: CheckResult[],
  input: {
    name: string;
    severity: ReadinessSeverity;
    sql: string;
    toDetails: (rows: T[]) => unknown[];
    count?: (rows: T[]) => number;
  }
) {
  try {
    const rows = await queryRows<T>(input.sql);
    checks.push({
      name: input.name,
      severity: input.severity,
      count: input.count ? input.count(rows) : rows.length,
      details: input.toDetails(rows)
    });
  } catch {
    checks.push(createReadinessQueryFailure(input.name));
  }
}

async function main() {
  const allowBlocking = process.argv.includes('--allow-blocking');
  const checks: CheckResult[] = [];

  await appendQueryCheck<{ count: bigint }>(checks, {
    name: 'required_schema_tables_present',
    severity: 'BLOCKING',
    sql: `
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('_prisma_migrations', 'User', 'Session', 'GeofencePolicy', 'AuthSession', 'GateLog', 'AuditEntry', 'AuditChainEpoch', 'AuditIntegrityIncident')
    `,
    count: (rows) => asCount(rows) === 9 ? 0 : 1,
    toDetails: (rows) => [{ category: 'schema_table_count', present: asCount(rows), required: 9 }]
  });

  await appendQueryCheck<{ count: bigint }>(checks, {
    name: 'gate_business_date_mismatch',
    severity: 'BLOCKING',
    sql: `
      SELECT COUNT(*)::bigint AS count
      FROM "GateLog"
      WHERE "businessDate" <> ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
    `,
    count: asCount,
    toDetails: (rows) => [{ category: 'gate_business_date_mismatch', count: asCount(rows) }]
  });

  await appendQueryCheck<{ business_date: string; group_count: number; event_count: number }>(checks, {
    name: 'session_generation_collisions',
    severity: 'BLOCKING',
    sql: `
      SELECT business_date, group_count, event_count
      FROM (
        SELECT
          "businessDate"::text AS business_date,
          COUNT(DISTINCT "weeklyScheduleId") FILTER (WHERE session_count > 1)::int AS group_count,
          COUNT(*) FILTER (WHERE session_count > 1)::int AS event_count
        FROM (
          SELECT
            "weeklyScheduleId",
            "businessDate",
            COUNT(*) OVER (PARTITION BY "weeklyScheduleId", "businessDate")::int AS session_count
          FROM "Session"
          WHERE "weeklyScheduleId" IS NOT NULL
        ) per_schedule
        GROUP BY "businessDate"
      ) aggregated
      WHERE group_count > 0
      ORDER BY event_count DESC
      LIMIT 100
    `,
    count: (rows) => rows.reduce((total, row) => total + Number(row.group_count), 0),
    toDetails: (rows) => rows.map((row) => ({
      category: 'session_generation_collision',
      businessDate: row.business_date,
      groupCount: Number(row.group_count),
      eventCount: Number(row.event_count)
    }))
  });

  await appendQueryCheck<{ count: number }>(checks, {
    name: 'enrollment_period_overlaps',
    severity: 'BLOCKING',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "ClassEnrollment" a
      JOIN "ClassEnrollment" b ON a.id < b.id AND a."studentId" = b."studentId"
       AND daterange(a."effectiveFrom", COALESCE(a."effectiveTo" + 1, 'infinity'::date), '[)') && daterange(b."effectiveFrom", COALESCE(b."effectiveTo" + 1, 'infinity'::date), '[)')
    `,
    count: (rows) => Number(rows[0]?.count ?? 0),
    toDetails: (rows) => [{ category: 'enrollment_period_overlap', count: Number(rows[0]?.count ?? 0) }]
  });

  await appendQueryCheck<{ count: number }>(checks, {
    name: 'attendance_without_session_roster',
    severity: 'BLOCKING',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "StudentAttendance" sa
      LEFT JOIN "SessionRoster" sr ON sr."sessionId" = sa."sessionId" AND sr."studentId" = sa."studentId"
      WHERE sr.id IS NULL
    `,
    count: (rows) => Number(rows[0]?.count ?? 0),
    toDetails: (rows) => [{ category: 'attendance_without_roster', count: Number(rows[0]?.count ?? 0) }]
  });

  try {
    const [auditEntries, auditState, auditEpochs, auditIncidents] = await Promise.all([
      prisma.auditEntry.findMany({ orderBy: { sequence: 'asc' } }),
      prisma.auditChainState.findUnique({ where: { id: 1 } }),
      prisma.auditChainEpoch.findMany({ orderBy: { epochNumber: 'asc' } }),
      prisma.auditIntegrityIncident.findMany({ orderBy: { createdAt: 'asc' } })
    ]);
    const auditVerification = verifyAuditTrustBoundary({
      entries: auditEntries,
      state: auditState,
      epochs: auditEpochs,
      incidents: auditIncidents
    });
    checks.push(createSanitizedReadinessCheck({
      name: 'audit_chain_integrity',
      severity: auditVerification.ok ? 'INFO' : 'BLOCKING',
      count: auditVerification.ok ? 0 : auditVerification.issues.length,
      details: [{
        status: auditVerification.status,
        trustedThroughSequence: auditVerification.trustedThroughSequence,
        historicalUntrustedRange: auditVerification.historicalUntrustedRange,
        activeEpoch: auditVerification.activeEpoch,
        historicalFindings: auditVerification.historicalFindings,
        issueCodes: auditVerification.issues.map((entry) => entry.code)
      }]
    }));
  } catch {
    checks.push(createReadinessQueryFailure('audit_chain_integrity'));
  }

  const report = createSanitizedReadinessReport({ generatedAt: new Date().toISOString(), checks });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok && !allowBlocking) process.exitCode = 1;
}

main()
  .catch(() => {
    console.error(JSON.stringify(sanitizedReadinessError('READINESS_PREFLIGHT_FAILED')));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
