import { Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

type ScheduleMutationLockRows = {
  userIds?: Iterable<string | null | undefined>;
  academicYearIds?: Iterable<string | null | undefined>;
  semesterIds?: Iterable<string | null | undefined>;
  teachingAssignmentIds?: Iterable<string | null | undefined>;
  sessionIds?: Iterable<string | null | undefined>;
};

function sortedIds(ids: Iterable<string | null | undefined>) {
  return [...new Set([...ids].filter((id): id is string => Boolean(id)))].sort();
}

/**
 * Global schedule-mutation row-lock order:
 *
 * - Paths without a leave prelude: teacher/date transaction advisory lock(s),
 *   then User, AcademicYear, Semester, TeachingAssignment, and Session IDs.
 * - Leave review: TeacherLeave, advisory lock(s), then the same User through
 *   Session order. Its substitute User lock must never precede advisory locks.
 *
 * IDs at every row-lock tier are lexical. WeeklySchedule can be locked before
 * advisory locks by weekly update/generation only; no academic, leave, or
 * session path locks it, so it cannot form a reverse cycle. Session
 * create/generation intentionally take no explicit User row lock: their final
 * FK existence check does not establish reverse User mutation authority, while
 * an explicit User lock after advisory acquisition would change this order.
 * Discovery reads happen before this helper and must be reread after locking
 * before a mutation relies on them.
 */
export async function lockUser(tx: TransactionClient, userId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
}

export async function lockAcademicYear(tx: TransactionClient, academicYearId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AcademicYear" WHERE "id" = ${academicYearId} FOR UPDATE`);
}

export async function lockSemester(tx: TransactionClient, semesterId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Semester" WHERE "id" = ${semesterId} FOR UPDATE`);
}

export async function lockTeachingAssignment(tx: TransactionClient, assignmentId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "TeachingAssignment" WHERE "id" = ${assignmentId} FOR UPDATE`);
}

export async function lockSession(tx: TransactionClient, sessionId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Session" WHERE "id" = ${sessionId} FOR UPDATE`);
}

export async function lockScheduleMutationRows(tx: TransactionClient, rows: ScheduleMutationLockRows) {
  for (const id of sortedIds(rows.userIds ?? [])) await lockUser(tx, id);
  for (const id of sortedIds(rows.academicYearIds ?? [])) await lockAcademicYear(tx, id);
  for (const id of sortedIds(rows.semesterIds ?? [])) await lockSemester(tx, id);
  for (const id of sortedIds(rows.teachingAssignmentIds ?? [])) await lockTeachingAssignment(tx, id);
  for (const id of sortedIds(rows.sessionIds ?? [])) await lockSession(tx, id);
}
