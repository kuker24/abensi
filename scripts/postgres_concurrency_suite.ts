import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient, Role, RosterCaptureSource, SessionStatus } from '@prisma/client';
import { writeAudit } from '../apps/api/src/common/audit-log';

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dbDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

async function main() {
  const prisma = new PrismaClient();
  const outputPath = resolve(process.argv.find((arg) => arg.startsWith('--json='))?.slice('--json='.length) ?? 'artifacts/concurrency/postgres-concurrency.json');
  const prefix = id('pgconc');
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  const adminId = `${prefix}-admin`;
  const teacherId = `${prefix}-teacher`;
  const studentId = `${prefix}-student`;
  const classA = `${prefix}-class-a`;
  const classB = `${prefix}-class-b`;
  const subjectId = `${prefix}-subject`;
  const yearId = `${prefix}-year`;
  const semesterId = `${prefix}-semester`;
  const sessionId = `${prefix}-session`;

  await prisma.$transaction(async (tx) => {
    await tx.user.createMany({ data: [
      { id: adminId, username: `${prefix}.admin`, fullName: 'Concurrency Admin', role: Role.ADMIN_TU, passwordHash: 'test' },
      { id: teacherId, username: `${prefix}.teacher`, fullName: 'Concurrency Teacher', role: Role.GURU_MAPEL, passwordHash: 'test' },
      { id: studentId, username: `${prefix}.student`, fullName: 'Concurrency Student', role: Role.SISWA, passwordHash: 'test' }
    ] });
    await tx.schoolClass.createMany({ data: [
      { id: classA, code: `${prefix}-A`, name: 'Concurrency A', yearLabel: '2026/2027' },
      { id: classB, code: `${prefix}-B`, name: 'Concurrency B', yearLabel: '2026/2027' }
    ] });
    await tx.subject.create({ data: { id: subjectId, code: `${prefix}-SUB`, name: 'Concurrency Subject' } });
    await tx.academicYear.create({ data: { id: yearId, code: `${prefix}-Y`, name: 'Concurrency Year', active: true } });
    await tx.semester.create({ data: { id: semesterId, academicYearId: yearId, code: `${prefix}-S1`, name: 'Concurrency Semester', active: true } });
    await tx.session.create({ data: { id: sessionId, classId: classA, subjectId, teacherId, startsAt: new Date('2026-06-15T01:00:00.000Z'), endsAt: new Date('2026-06-15T02:00:00.000Z'), businessDate: dbDate('2026-06-15'), status: SessionStatus.OPEN } });
  });

  try {
    await Promise.all(Array.from({ length: 50 }, (_, index) => prisma.$transaction(async (tx) => {
      await writeAudit(tx as any, {
        actorId: adminId,
        actorRole: Role.ADMIN_TU,
        module: 'concurrency-suite',
        action: 'concurrency.audit.write',
        resource: 'suite',
        resourceId: `${prefix}-${index}`,
        after: { index }
      });
    })));
    const written = await prisma.auditEntry.count({ where: { module: 'concurrency-suite', resourceId: { startsWith: prefix } } });
    results.push({ name: 'audit_x50_concurrent_writes', ok: written === 50, detail: `written=${written}` });
  } catch (error) {
    results.push({ name: 'audit_x50_concurrent_writes', ok: false, detail: String(error) });
  }

  try {
    const attempts = await Promise.allSettled([
      prisma.classEnrollment.create({ data: { id: `${prefix}-enroll-a`, classId: classA, studentId, academicYearId: yearId, semesterId, effectiveFrom: dbDate('2026-06-15'), createdById: adminId } }),
      prisma.classEnrollment.create({ data: { id: `${prefix}-enroll-b`, classId: classB, studentId, academicYearId: yearId, semesterId, effectiveFrom: dbDate('2026-06-15'), createdById: adminId } })
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled').length;
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected').length;
    results.push({ name: 'concurrent_enrollment_overlap_one_winner', ok: fulfilled === 1 && rejected === 1, detail: `fulfilled=${fulfilled}, rejected=${rejected}` });
  } catch (error) {
    results.push({ name: 'concurrent_enrollment_overlap_one_winner', ok: false, detail: String(error) });
  }

  try {
    await Promise.all(Array.from({ length: 5 }, () => prisma.sessionRoster.createMany({
      data: [{
        id: id(`${prefix}-roster`),
        sessionId,
        studentId,
        enrollmentId: null,
        studentNameSnapshot: 'Concurrency Student',
        studentUsernameSnapshot: `${prefix}.student`,
        classIdSnapshot: classA,
        classCodeSnapshot: `${prefix}-A`,
        classNameSnapshot: 'Concurrency A',
        academicYearIdSnapshot: yearId,
        academicYearNameSnapshot: 'Concurrency Year',
        semesterIdSnapshot: semesterId,
        semesterNameSnapshot: 'Concurrency Semester',
        captureSource: RosterCaptureSource.BACKFILL
      }],
      skipDuplicates: true
    })));
    const rosterCount = await prisma.sessionRoster.count({ where: { sessionId, studentId } });
    results.push({ name: 'roster_capture_x5_exactly_once', ok: rosterCount === 1, detail: `rosterCount=${rosterCount}` });
  } catch (error) {
    results.push({ name: 'roster_capture_x5_exactly_once', ok: false, detail: String(error) });
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
