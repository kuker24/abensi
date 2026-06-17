import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient, Role, SessionStatus, StudentAttendanceStatus, AttendanceReviewState, RosterCaptureSource } from '@prisma/client';

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function dbDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

async function main() {
  const prisma = new PrismaClient();
  const outputPath = resolve(process.argv.find((arg) => arg.startsWith('--json='))?.slice('--json='.length) ?? 'artifacts/integration/postgres-integration.json');
  const prefix = id('pgint');
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  const adminId = `${prefix}-admin`;
  const teacherId = `${prefix}-teacher`;
  const studentId = `${prefix}-student`;
  const outsiderId = `${prefix}-outsider`;
  const openEndedStudentId = `${prefix}-student-open`;
  const classId = `${prefix}-class`;
  const classLaterId = `${prefix}-class-later`;
  const subjectId = `${prefix}-subject`;
  const yearId = `${prefix}-year`;
  const semesterId = `${prefix}-semester`;
  const semesterLaterId = `${prefix}-semester-later`;
  const sessionId = `${prefix}-session`;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.createMany({ data: [
        { id: adminId, username: `${prefix}.admin`, fullName: 'Integration Admin', role: Role.ADMIN_TU, passwordHash: 'test' },
        { id: teacherId, username: `${prefix}.teacher`, fullName: 'Integration Teacher', role: Role.GURU_MAPEL, passwordHash: 'test' },
        { id: studentId, username: `${prefix}.student`, fullName: 'Integration Student', role: Role.SISWA, passwordHash: 'test' },
        { id: outsiderId, username: `${prefix}.outsider`, fullName: 'Integration Outsider', role: Role.SISWA, passwordHash: 'test' },
        { id: openEndedStudentId, username: `${prefix}.open`, fullName: 'Integration Open Ended', role: Role.SISWA, passwordHash: 'test' }
      ] });
      await tx.schoolClass.createMany({ data: [
        { id: classId, code: `${prefix}-A`, name: 'Integration A', yearLabel: '2026/2027' },
        { id: classLaterId, code: `${prefix}-B`, name: 'Integration B', yearLabel: '2026/2027' }
      ] });
      await tx.subject.create({ data: { id: subjectId, code: `${prefix}-SUB`, name: 'Integration Subject' } });
      await tx.academicYear.create({ data: { id: yearId, code: `${prefix}-Y`, name: 'Integration Year', startsAt: dbDate('2026-06-01'), endsAt: dbDate('2026-12-31'), active: true } });
      await tx.semester.create({ data: { id: semesterId, academicYearId: yearId, code: `${prefix}-S1`, name: 'Integration Semester', startsAt: dbDate('2026-06-01'), endsAt: dbDate('2026-06-30'), active: true } });
      await tx.semester.create({ data: { id: semesterLaterId, academicYearId: yearId, code: `${prefix}-S2`, name: 'Integration Later Semester', startsAt: dbDate('2026-07-01'), endsAt: dbDate('2026-12-31'), active: true } });
      await tx.classEnrollment.create({ data: { id: `${prefix}-enrollment-1`, classId, studentId, academicYearId: yearId, semesterId, effectiveFrom: dbDate('2026-06-14'), effectiveTo: dbDate('2026-06-20'), active: true, administrativeStatus: 'ACTIVE', createdById: adminId } });
      await tx.classEnrollment.create({ data: { id: `${prefix}-enrollment-2`, classId, studentId, academicYearId: yearId, semesterId, effectiveFrom: dbDate('2026-06-21'), effectiveTo: dbDate('2026-06-30'), active: true, administrativeStatus: 'ACTIVE', createdById: adminId } });
      await tx.classEnrollment.create({ data: { id: `${prefix}-enrollment-open`, classId, studentId: openEndedStudentId, academicYearId: yearId, semesterId, effectiveFrom: dbDate('2026-06-14'), active: true, administrativeStatus: 'ACTIVE', createdById: adminId } });
      await tx.classEnrollment.create({ data: { id: `${prefix}-enrollment-cancelled`, classId, studentId: outsiderId, academicYearId: yearId, semesterId, effectiveFrom: dbDate('2026-06-14'), effectiveTo: dbDate('2026-06-30'), active: false, administrativeStatus: 'CANCELLED', administrativeStatusChangedAt: new Date(), administrativeStatusChangedById: adminId, administrativeStatusReason: 'Integration fixture cancelled enrollment should not count', createdById: adminId } });
      await tx.session.create({ data: { id: sessionId, classId, subjectId, teacherId, startsAt: new Date('2026-06-14T01:00:00.000Z'), endsAt: new Date('2026-06-14T02:00:00.000Z'), businessDate: dbDate('2026-06-14'), status: SessionStatus.OPEN } });
      await tx.sessionRoster.create({ data: { id: `${prefix}-roster`, sessionId, studentId, enrollmentId: `${prefix}-enrollment-1`, studentNameSnapshot: 'Historical Student Name', studentUsernameSnapshot: `${prefix}.student`, classIdSnapshot: classId, classCodeSnapshot: `${prefix}-A`, classNameSnapshot: 'Integration A', academicYearIdSnapshot: yearId, academicYearNameSnapshot: 'Integration Year', semesterIdSnapshot: semesterId, semesterNameSnapshot: 'Integration Semester', captureSource: RosterCaptureSource.BACKFILL } });
      await tx.studentAttendance.create({ data: { id: `${prefix}-attendance`, sessionId, studentId, status: StudentAttendanceStatus.ALPA, reviewState: AttendanceReviewState.DEFAULTED } });
    });
    results.push({ name: 'valid_snapshot_attendance_insert', ok: true });
  } catch (error) {
    results.push({ name: 'valid_snapshot_attendance_insert', ok: false, detail: String(error) });
  }

  try {
    const asOfInside = dbDate('2026-06-16');
    const asOfAfterEnd = dbDate('2026-07-01');
    const validInside = await prisma.classEnrollment.findMany({
      where: {
        classId,
        active: true,
        administrativeStatus: 'ACTIVE',
        effectiveFrom: { lte: asOfInside },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfInside } }]
      },
      orderBy: { id: 'asc' }
    });
    const validAfterEnd = await prisma.classEnrollment.findMany({
      where: {
        studentId,
        active: true,
        administrativeStatus: 'ACTIVE',
        effectiveFrom: { lte: asOfAfterEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfAfterEnd } }]
      }
    });
    const includesBoundedFutureEnd = validInside.some((item) => item.id === `${prefix}-enrollment-1` && item.active === true && item.effectiveTo !== null);
    const includesOpenEnded = validInside.some((item) => item.id === `${prefix}-enrollment-open`);
    const excludesCancelled = validInside.every((item) => item.id !== `${prefix}-enrollment-cancelled` && item.studentId !== outsiderId);
    results.push({
      name: 'enrollment_effective_period_semantics',
      ok: includesBoundedFutureEnd && includesOpenEnded && excludesCancelled && validAfterEnd.length === 0,
      detail: `inside=${validInside.map((item) => item.id).join(',')}; afterEnd=${validAfterEnd.length}`
    });
  } catch (error) {
    results.push({ name: 'enrollment_effective_period_semantics', ok: false, detail: String(error) });
  }

  try {
    await prisma.classEnrollment.create({ data: { id: `${prefix}-same-class-later-semester`, classId, studentId, academicYearId: yearId, semesterId: semesterLaterId, effectiveFrom: dbDate('2026-07-01'), effectiveTo: dbDate('2026-12-31'), active: true, administrativeStatus: 'ACTIVE', createdById: adminId } });
    const created = await prisma.classEnrollment.findUnique({ where: { id: `${prefix}-same-class-later-semester` } });
    results.push({ name: 'same_class_later_semester_allowed_after_previous_end', ok: Boolean(created), detail: `created=${Boolean(created)}` });
  } catch (error) {
    results.push({ name: 'same_class_later_semester_allowed_after_previous_end', ok: false, detail: String(error) });
  }

  try {
    await prisma.$executeRawUnsafe(`INSERT INTO "StudentAttendance" (id, "sessionId", "studentId", status, "reviewState", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'ALPA', 'DEFAULTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, `${prefix}-bad-attendance`, sessionId, outsiderId);
    results.push({ name: 'out_of_roster_attendance_rejected_by_database', ok: false, detail: 'insert unexpectedly succeeded' });
  } catch {
    results.push({ name: 'out_of_roster_attendance_rejected_by_database', ok: true });
  }

  try {
    await prisma.classEnrollment.create({ data: { id: `${prefix}-overlap`, classId: classLaterId, studentId, academicYearId: yearId, semesterId, effectiveFrom: dbDate('2026-06-18'), createdById: adminId } });
    results.push({ name: 'overlapping_enrollment_rejected', ok: false, detail: 'overlap unexpectedly succeeded' });
  } catch {
    results.push({ name: 'overlapping_enrollment_rejected', ok: true });
  }

  const ok = results.every((result) => result.ok);
  const report = { generatedAt: new Date().toISOString(), prefix, ok, results };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  await prisma.$disconnect();
  console.log(JSON.stringify(report, null, 2));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
