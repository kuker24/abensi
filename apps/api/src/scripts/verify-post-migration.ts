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

async function appendQueryCheck<T extends Record<string, unknown>>(
  checks: CheckResult[],
  input: {
    name: string;
    sql: string;
    toDetails: (rows: T[]) => unknown[];
    count?: (rows: T[]) => number;
  }
) {
  try {
    const rows = await prisma.$queryRawUnsafe<T[]>(input.sql);
    checks.push({
      name: input.name,
      severity: 'BLOCKING',
      count: input.count ? input.count(rows) : rows.length,
      details: input.toDetails(rows)
    });
  } catch {
    checks.push(createReadinessQueryFailure(input.name));
  }
}

async function main() {
  const checks: CheckResult[] = [];

  await appendQueryCheck<{ business_date: string; direction: string; group_count: number; event_count: number }>(checks, {
    name: 'duplicate_gate_log_daily_direction',
    sql: `
      SELECT business_date, direction, group_count, event_count
      FROM (
        SELECT
          "businessDate"::text AS business_date,
          direction,
          COUNT(DISTINCT "userId") FILTER (WHERE gate_count > 1)::int AS group_count,
          COUNT(*) FILTER (WHERE gate_count > 1)::int AS event_count
        FROM (
          SELECT
            "userId",
            "businessDate",
            direction,
            COUNT(*) OVER (PARTITION BY "userId", "businessDate", direction)::int AS gate_count
          FROM "GateLog"
        ) per_user
        GROUP BY "businessDate", direction
      ) aggregated
      WHERE group_count > 0
      ORDER BY event_count DESC
      LIMIT 100
    `,
    count: (rows) => rows.reduce((total, row) => total + Number(row.group_count), 0),
    toDetails: (rows) => rows.map((row) => ({
      category: 'duplicate_gate_log_daily_direction',
      scope: row.direction,
      businessDate: row.business_date,
      groupCount: Number(row.group_count),
      eventCount: Number(row.event_count)
    }))
  });

  await appendQueryCheck<{ business_date: string; group_count: number; event_count: number }>(checks, {
    name: 'duplicate_generated_session_business_date',
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
      category: 'duplicate_generated_session_business_date',
      businessDate: row.business_date,
      groupCount: Number(row.group_count),
      eventCount: Number(row.event_count)
    }))
  });

  await appendQueryCheck<{ count: number }>(checks, {
    name: 'student_attendance_without_roster',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "StudentAttendance" sa
      LEFT JOIN "SessionRoster" sr ON sr."sessionId" = sa."sessionId" AND sr."studentId" = sa."studentId"
      WHERE sr.id IS NULL
    `,
    count: (rows) => Number(rows[0]?.count ?? 0),
    toDetails: (rows) => [{ category: 'student_attendance_without_roster', count: Number(rows[0]?.count ?? 0) }]
  });

  await appendQueryCheck<{ count: number }>(checks, {
    name: 'overlapping_enrollment_period',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM "ClassEnrollment" a
      JOIN "ClassEnrollment" b ON a.id < b.id AND a."studentId" = b."studentId"
       AND daterange(a."effectiveFrom", COALESCE(a."effectiveTo" + 1, 'infinity'::date), '[)') && daterange(b."effectiveFrom", COALESCE(b."effectiveTo" + 1, 'infinity'::date), '[)')
    `,
    count: (rows) => Number(rows[0]?.count ?? 0),
    toDetails: (rows) => [{ category: 'overlapping_enrollment_period', count: Number(rows[0]?.count ?? 0) }]
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

  const baseReport = createSanitizedReadinessReport({ generatedAt: new Date().toISOString(), checks });
  const report = {
    generatedAt: baseReport.generatedAt,
    ok: baseReport.ok,
    failures: baseReport.checks.filter((check) => check.severity === 'BLOCKING' && check.count > 0)
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main()
  .catch(() => {
    console.error(JSON.stringify(sanitizedReadinessError('POST_MIGRATION_VERIFICATION_FAILED')));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
