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

type CheckResult = {
  name: string;
  severity: ReadinessSeverity;
  count: number;
  details: unknown[];
};

function argValue(name: string, fallback: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}


export type SanitizedDatabaseEndpoint = { host: string; port: number | null } | null;

/** Returns only endpoint host/port. Never return URL credentials, path, or query. */
export function parseSanitizedDatabaseEndpoint(value: string | undefined): SanitizedDatabaseEndpoint {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return null;
    if (!url.hostname) return null;
    const port = url.port === '' ? null : Number(url.port);
    if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) return null;
    return { host: url.hostname, port };
  } catch {
    return null;
  }
}

async function queryRows<T extends Record<string, unknown>>(prisma: PrismaClient, sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}

function asCount(rows: Array<{ count?: bigint | number | string; count_text?: string }>) {
  const raw = rows[0]?.count ?? rows[0]?.count_text ?? 0;
  return Number(raw);
}

async function appendQueryCheck<T extends Record<string, unknown>>(
  checks: CheckResult[],
  input: {
    name: string;
    severity: ReadinessSeverity;
    sql: string;
    toDetails: (rows: T[]) => unknown[];
    count?: (rows: T[]) => number;
  },
  prisma: PrismaClient
) {
  try {
    const rows = await queryRows<T>(prisma, input.sql);
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

export async function runProductionReadinessPreflight() {
  const prisma = new PrismaClient();
  const outputPath = resolve(argValue('--json', 'artifacts/preflight/production-readiness-preflight.json'));
  const allowBlocking = process.argv.includes('--allow-blocking');
  const checks: CheckResult[] = [];

  try {
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
    }, prisma);

    await appendQueryCheck<{ direction: string; business_date: string; group_count: number; event_count: number }>(checks, {
      name: 'gate_log_corrected_date_collisions',
      severity: 'BLOCKING',
      sql: `
        SELECT direction, business_date, group_count, event_count
        FROM (
          SELECT
            direction,
            ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)::text AS business_date,
            COUNT(DISTINCT "userId") FILTER (WHERE tap_count > 1)::int AS group_count,
            COUNT(*) FILTER (WHERE tap_count > 1)::int AS event_count
          FROM (
            SELECT
              "userId",
              direction,
              "tappedAt",
              COUNT(*) OVER (
                PARTITION BY "userId", direction, ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
              )::int AS tap_count
            FROM "GateLog"
          ) per_user
          GROUP BY direction, ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
        ) aggregated
        WHERE group_count > 0
        ORDER BY event_count DESC
        LIMIT 100
      `,
      count: (rows) => rows.reduce((total, row) => total + Number(row.group_count), 0),
      toDetails: (rows) => rows.map((row) => ({
        category: 'gate_log_collision',
        scope: row.direction,
        businessDate: row.business_date,
        groupCount: Number(row.group_count),
        eventCount: Number(row.event_count)
      }))
    }, prisma);

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
    }, prisma);

    await appendQueryCheck<{ scope: string; count: number }>(checks, {
      name: 'active_session_schedule_overlaps',
      severity: 'BLOCKING',
      sql: `
        WITH active AS (
          SELECT id, "teacherId", "classId", "roomId", "startsAt", "endsAt"
          FROM "Session"
          WHERE status IN ('SCHEDULED', 'OPEN')
        ), overlaps AS (
          SELECT 'teacher' AS scope
          FROM active a JOIN active b ON a.id < b.id AND a."teacherId" = b."teacherId" AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
          UNION ALL
          SELECT 'class' AS scope
          FROM active a JOIN active b ON a.id < b.id AND a."classId" = b."classId" AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
          UNION ALL
          SELECT 'room' AS scope
          FROM active a JOIN active b ON a.id < b.id AND a."roomId" IS NOT NULL AND a."roomId" = b."roomId" AND tstzrange(a."startsAt", a."endsAt", '[)') && tstzrange(b."startsAt", b."endsAt", '[)')
        )
        SELECT scope, COUNT(*)::int AS count
        FROM overlaps
        GROUP BY scope
        ORDER BY scope
      `,
      count: (rows) => rows.reduce((total, row) => total + Number(row.count), 0),
      toDetails: (rows) => rows.map((row) => ({
        category: 'session_schedule_overlap',
        scope: row.scope,
        count: Number(row.count)
      }))
    }, prisma);

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
    }, prisma);

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
    }, prisma);

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
      ...baseReport,
      databaseEndpoint: parseSanitizedDatabaseEndpoint(process.env.DATABASE_URL)
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

    console.log(JSON.stringify(report, null, 2));
    if (!report.ok && !allowBlocking) process.exitCode = 1;
    return report;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runProductionReadinessPreflight().catch(() => {
    console.error(JSON.stringify(sanitizedReadinessError('READINESS_PREFLIGHT_FAILED')));
    process.exitCode = 1;
  });
}
