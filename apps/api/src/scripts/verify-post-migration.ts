import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function rows<T>(sql: string) {
  return prisma.$queryRawUnsafe<T[]>(sql);
}

async function main() {
  const failures: Array<{ name: string; count: number; details?: unknown[] }> = [];
  async function check<T>(name: string, sql: string) {
    const result = await rows<T>(sql);
    if (result.length) failures.push({ name, count: result.length, details: result.slice(0, 100) });
  }

  await check('duplicate_gate_log_daily_direction', `
    SELECT "userId", "businessDate"::text, direction, COUNT(*)::int AS count
    FROM "GateLog"
    GROUP BY "userId", "businessDate", direction
    HAVING COUNT(*) > 1
  `);

  await check('duplicate_generated_session_business_date', `
    SELECT "weeklyScheduleId", "businessDate"::text, COUNT(*)::int AS count
    FROM "Session"
    WHERE "weeklyScheduleId" IS NOT NULL
    GROUP BY "weeklyScheduleId", "businessDate"
    HAVING COUNT(*) > 1
  `);

  await check('student_attendance_without_roster', `
    SELECT sa.id, sa."sessionId", sa."studentId"
    FROM "StudentAttendance" sa
    LEFT JOIN "SessionRoster" sr ON sr."sessionId" = sa."sessionId" AND sr."studentId" = sa."studentId"
    WHERE sr.id IS NULL
  `);

  await check('overlapping_enrollment_period', `
    SELECT a."studentId", a.id AS left_id, b.id AS right_id
    FROM "ClassEnrollment" a
    JOIN "ClassEnrollment" b ON a.id < b.id AND a."studentId" = b."studentId"
     AND daterange(a."effectiveFrom", COALESCE(a."effectiveTo" + 1, 'infinity'::date), '[)') && daterange(b."effectiveFrom", COALESCE(b."effectiveTo" + 1, 'infinity'::date), '[)')
  `);

  const report = { generatedAt: new Date().toISOString(), ok: failures.length === 0, failures };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
