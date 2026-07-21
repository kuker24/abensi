import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertBusinessDateKey, businessDateKey } from '../../common/business-time';

type TransactionClient = Prisma.TransactionClient;

export function teacherLeaveBusinessDateKey(value: Date | string) {
  const key = typeof value === 'string' ? value : businessDateKey(value, 'Asia/Jakarta');
  try {
    assertBusinessDateKey(key);
  } catch {
    throw new BadRequestException({ code: 'SCHEDULE_INVALID_DATE', message: 'Tanggal bisnis tidak valid.' });
  }
  return key;
}

export function teacherLeaveAdvisoryLockKey(teacherId: string, businessDate: Date | string) {
  const normalizedTeacherId = teacherId.trim();
  if (!normalizedTeacherId) {
    throw new BadRequestException({ code: 'TEACHER_LEAVE_TEACHER_REQUIRED', message: 'Guru wajib diisi.' });
  }
  return `teacher-leave:${normalizedTeacherId}:${teacherLeaveBusinessDateKey(businessDate)}`;
}

type TeacherLeaveBusinessDateLock = {
  teacherId: string;
  businessDate: Date | string;
};

/**
 * Serializes leave approval and schedule mutation for one formal teacher and
 * Jakarta business date. PostgreSQL releases this transaction lock at commit.
 */
export async function lockTeacherLeaveBusinessDates(
  tx: TransactionClient,
  locks: Iterable<TeacherLeaveBusinessDateLock>
) {
  const keys = [...new Set([...locks].map(({ teacherId, businessDate }) => teacherLeaveAdvisoryLockKey(teacherId, businessDate)))].sort();
  for (const key of keys) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
  return keys;
}

export async function lockTeacherLeaveBusinessDate(
  tx: TransactionClient,
  teacherId: string,
  businessDate: Date | string
) {
  const [key] = await lockTeacherLeaveBusinessDates(tx, [{ teacherId, businessDate }]);
  return key;
}
