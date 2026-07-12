import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { verifyAuditTrustBoundary } from '../apps/api/src/modules/security/audit-trust-boundary.core';
import {
  createReadinessQueryFailure,
  createSanitizedReadinessCheck,
  createSanitizedReadinessReport,
  sanitizedReadinessError,
  type ReadinessSeverity
} from '../apps/api/src/modules/security/readiness-report';

function argValue(name: string, fallback: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

type CheckResult = { name: string; severity: ReadinessSeverity; count: number; details: unknown[] };

async function appendQueryCheck<T extends Record<string, unknown>>(
  prisma: PrismaClient,
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
  const prisma = new PrismaClient();
  const outputPath = resolve(argValue('--json', 'artifacts/preflight/post-migration-verify.json'));
  const checks: CheckResult[] = [];

  try {
    await appendQueryCheck<{ business_date: string; direction: string; group_count: number; event_count: number }>(prisma, checks, {
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

    await appendQueryCheck<{ business_date: string; group_count: number; event_count: number }>(prisma, checks, {
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

    await appendQueryCheck<{ count: number }>(prisma, checks, {
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

    await appendQueryCheck<{ count: number }>(prisma, checks, {
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

    const archiveRows = await prisma.$queryRawUnsafe<Array<{ archive_count: bigint; report_deleted_count: bigint }>>(`
      SELECT
        (SELECT COUNT(*)::bigint FROM "GateLogArchive") AS archive_count,
        COALESCE((
          SELECT SUM((details->>'archivedCount')::bigint)
          FROM "BusinessDateBackfillReport"
          WHERE category IN ('GATELOG_DEDUPLICATION', 'GATELOG_ARCHIVE')
        ), 0)::bigint AS report_deleted_count
    `).catch(() => null);
    if (archiveRows === null) {
      checks.push(createReadinessQueryFailure('gate_log_archive_parity'));
    } else {
      const archive = archiveRows[0] ?? { archive_count: 0n, report_deleted_count: 0n };
      const archiveCount = Number(archive.archive_count);
      const reportDeletedCount = Number(archive.report_deleted_count);
      checks.push(createSanitizedReadinessCheck({
        name: 'gate_log_archive_parity',
        severity: reportDeletedCount > 0 && archiveCount !== reportDeletedCount ? 'BLOCKING' : 'INFO',
        count: reportDeletedCount > 0 && archiveCount !== reportDeletedCount ? 1 : 0,
        details: [{
          category: 'gate_log_archive_parity',
          count: archiveCount,
          eventCount: reportDeletedCount
        }]
      }));
    }

    const baseReport = createSanitizedReadinessReport({ generatedAt: new Date().toISOString(), checks });
    const report = {
      generatedAt: baseReport.generatedAt,
      ok: baseReport.ok,
      failures: baseReport.checks.filter((check) => check.severity === 'BLOCKING' && check.count > 0),
      archiveCount: baseReport.checks.find((check) => check.name === 'gate_log_archive_parity')?.details[0]?.count ?? 0,
      reportDeletedCount: baseReport.checks.find((check) => check.name === 'gate_log_archive_parity')?.details[0]?.eventCount ?? 0,
      archiveParityChecked: (baseReport.checks.find((check) => check.name === 'gate_log_archive_parity')?.details[0]?.eventCount ?? 0) > 0
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error(JSON.stringify(sanitizedReadinessError('POST_MIGRATION_VERIFICATION_FAILED')));
  process.exitCode = 1;
});
