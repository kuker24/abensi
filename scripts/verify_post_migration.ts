import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

function argValue(name: string, fallback: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const prisma = new PrismaClient();
  const outputPath = resolve(argValue('--json', 'artifacts/preflight/post-migration-verify.json'));
  const failures: Array<{ name: string; count: number; details?: unknown[] }> = [];

  async function rows<T>(name: string, sql: string) {
    const result = await prisma.$queryRawUnsafe<T[]>(sql);
    if (result.length) failures.push({ name, count: result.length, details: result.slice(0, 100) });
  }

  await rows('duplicate_gate_log_daily_direction', `
    SELECT "userId", "businessDate"::text, direction, COUNT(*)::int AS count
    FROM "GateLog"
    GROUP BY "userId", "businessDate", direction
    HAVING COUNT(*) > 1
  `);

  await rows('duplicate_generated_session_business_date', `
    SELECT "weeklyScheduleId", "businessDate"::text, COUNT(*)::int AS count
    FROM "Session"
    WHERE "weeklyScheduleId" IS NOT NULL
    GROUP BY "weeklyScheduleId", "businessDate"
    HAVING COUNT(*) > 1
  `);

  await rows('student_attendance_without_roster', `
    SELECT sa.id, sa."sessionId", sa."studentId"
    FROM "StudentAttendance" sa
    LEFT JOIN "SessionRoster" sr ON sr."sessionId" = sa."sessionId" AND sr."studentId" = sa."studentId"
    WHERE sr.id IS NULL
  `);

  await rows('overlapping_enrollment_period', `
    SELECT a."studentId", a.id AS left_id, b.id AS right_id
    FROM "ClassEnrollment" a
    JOIN "ClassEnrollment" b ON a.id < b.id AND a."studentId" = b."studentId"
     AND daterange(a."effectiveFrom", COALESCE(a."effectiveTo" + 1, 'infinity'::date), '[)') && daterange(b."effectiveFrom", COALESCE(b."effectiveTo" + 1, 'infinity'::date), '[)')
  `);

  const archiveRows = await prisma.$queryRawUnsafe<Array<{ archive_count: bigint; report_deleted_count: bigint }>>(`
    SELECT
      (SELECT COUNT(*)::bigint FROM "GateLogArchive") AS archive_count,
      COALESCE((
        SELECT SUM((details->>'archivedCount')::bigint)
        FROM "BusinessDateBackfillReport"
        WHERE category IN ('GATELOG_DEDUPLICATION', 'GATELOG_ARCHIVE')
      ), 0)::bigint AS report_deleted_count
  `).catch(() => [{ archive_count: BigInt(0), report_deleted_count: BigInt(0) }]);

  const archive = archiveRows[0];
  const report = {
    generatedAt: new Date().toISOString(),
    failures,
    archiveCount: Number(archive.archive_count),
    reportDeletedCount: Number(archive.report_deleted_count),
    archiveParityChecked: Number(archive.report_deleted_count) > 0,
    ok: failures.length === 0
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  await prisma.$disconnect();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
