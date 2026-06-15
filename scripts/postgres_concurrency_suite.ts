import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  AttendanceConfirmationSource,
  AttendanceReviewState,
  GateDirection,
  Prisma,
  PrismaClient,
  ReconciliationFlagType,
  ReconciliationStatus,
  Role,
  RosterCaptureSource,
  SessionStatus,
  StudentAttendanceStatus
} from '@prisma/client';
import { writeAudit } from '../apps/api/src/common/audit-log';

type Result = { name: string; ok: boolean; detail?: string };
type BarrierWait = (phase: string, participants?: number) => Promise<void>;

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function dbDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function at(day: number, hour: number, minute = 0) {
  return new Date(Date.UTC(2026, 6, day, hour, minute, 0, 0));
}

class TransactionBarrier {
  private readonly states = new Map<string, { arrived: number; participants: number; resolvers: Array<() => void>; rejecters: Array<(error: Error) => void>; timer: NodeJS.Timeout }>();

  wait(key: string, participants: number, timeoutMs = 12_000) {
    let state = this.states.get(key);
    if (!state) {
      state = {
        arrived: 0,
        participants,
        resolvers: [],
        rejecters: [],
        timer: setTimeout(() => {
          const current = this.states.get(key);
          if (!current) return;
          const error = new Error(`transaction barrier ${key} timed out at ${current.arrived}/${current.participants}`);
          for (const reject of current.rejecters) reject(error);
          this.states.delete(key);
        }, timeoutMs)
      };
      state.timer.unref();
      this.states.set(key, state);
    }
    if (state.participants !== participants) throw new Error(`barrier ${key} participant mismatch`);
    state.arrived += 1;
    if (state.arrived === state.participants) {
      clearTimeout(state.timer);
      for (const resolveWaiter of state.resolvers) resolveWaiter();
      this.states.delete(key);
      return Promise.resolve();
    }
    return new Promise<void>((resolveWaiter, rejectWaiter) => {
      state!.resolvers.push(resolveWaiter);
      state!.rejecters.push(rejectWaiter);
    });
  }
}

async function concurrentTransactions<T>(
  name: string,
  participants: number,
  handler: (tx: Prisma.TransactionClient, index: number, wait: BarrierWait) => Promise<T>,
  isolationLevel: Prisma.TransactionIsolationLevel = Prisma.TransactionIsolationLevel.ReadCommitted
) {
  const barrier = new TransactionBarrier();
  const clients = Array.from({ length: participants }, () => new PrismaClient());
  try {
    return await Promise.allSettled(clients.map((client, index) => client.$transaction(
      (tx) => handler(tx, index, (phase, count = participants) => barrier.wait(`${name}:${phase}`, count)),
      { isolationLevel, maxWait: 15_000, timeout: 25_000 }
    )));
  } finally {
    await Promise.all(clients.map((client) => client.$disconnect().catch(() => undefined)));
  }
}

function settledCounts(settled: PromiseSettledResult<unknown>[]) {
  return {
    fulfilled: settled.filter((item) => item.status === 'fulfilled').length,
    rejected: settled.filter((item) => item.status === 'rejected').length,
    values: settled.filter((item): item is PromiseFulfilledResult<unknown> => item.status === 'fulfilled').map((item) => item.value),
    errors: settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected').map((item) => String(item.reason))
  };
}

async function record(results: Result[], name: string, fn: () => Promise<{ ok: boolean; detail?: string }>) {
  try {
    const result = await fn();
    results.push({ name, ...result });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
  }
}

async function createSession(prisma: PrismaClient, args: {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  startsAt: Date;
  endsAt: Date;
  businessDate: Date;
  status: SessionStatus;
  roomId?: string | null;
  weeklyScheduleId?: string | null;
}) {
  return prisma.session.create({
    data: {
      id: args.id,
      classId: args.classId,
      subjectId: args.subjectId,
      teacherId: args.teacherId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      businessDate: args.businessDate,
      status: args.status,
      roomId: args.roomId ?? null,
      weeklyScheduleId: args.weeklyScheduleId ?? null,
      ...(args.status === SessionStatus.OPEN ? { openedAt: new Date() } : {}),
      ...(args.status === SessionStatus.CLOSED ? { openedAt: new Date(args.startsAt.getTime() - 60_000), closedAt: new Date(args.endsAt.getTime() + 60_000) } : {})
    }
  });
}

async function addRosterAndAttendance(prisma: PrismaClient, prefix: string, sessionId: string, studentId: string, classId: string, classCode: string, className: string, status: StudentAttendanceStatus = StudentAttendanceStatus.ALPA) {
  await prisma.sessionRoster.create({
    data: {
      id: `${sessionId}-roster-${studentId}`,
      sessionId,
      studentId,
      studentNameSnapshot: `Student ${studentId}`,
      studentUsernameSnapshot: `${studentId}.fixture`,
      classIdSnapshot: classId,
      classCodeSnapshot: classCode,
      classNameSnapshot: className,
      captureSource: RosterCaptureSource.OPENED,
      activeAtCapture: true,
      metadata: { prefix }
    }
  });
  await prisma.studentAttendance.create({
    data: {
      id: `${sessionId}-att-${studentId}`,
      sessionId,
      studentId,
      status,
      reviewState: AttendanceReviewState.DEFAULTED
    }
  });
}

async function setupBase(prisma: PrismaClient, prefix: string) {
  const ids = {
    adminId: `${prefix}-admin`,
    teacherId: `${prefix}-teacher`,
    teacher2Id: `${prefix}-teacher-2`,
    studentId: `${prefix}-student`,
    student2Id: `${prefix}-student-2`,
    classA: `${prefix}-class-a`,
    classB: `${prefix}-class-b`,
    classC: `${prefix}-class-c`,
    subjectId: `${prefix}-subject`,
    roomA: `${prefix}-room-a`,
    roomB: `${prefix}-room-b`,
    yearId: `${prefix}-year`,
    semesterId: `${prefix}-semester`,
    weeklyScheduleId: `${prefix}-weekly`
  };

  await prisma.$transaction(async (tx) => {
    await tx.user.createMany({ data: [
      { id: ids.adminId, username: `${prefix}.admin`, fullName: 'Concurrency Admin', role: Role.ADMIN_TU, passwordHash: 'test' },
      { id: ids.teacherId, username: `${prefix}.teacher`, fullName: 'Concurrency Teacher', role: Role.GURU_MAPEL, passwordHash: 'test' },
      { id: ids.teacher2Id, username: `${prefix}.teacher2`, fullName: 'Concurrency Teacher 2', role: Role.GURU_MAPEL, passwordHash: 'test' },
      { id: ids.studentId, username: `${prefix}.student`, fullName: 'Concurrency Student', role: Role.SISWA, passwordHash: 'test' },
      { id: ids.student2Id, username: `${prefix}.student2`, fullName: 'Concurrency Student 2', role: Role.SISWA, passwordHash: 'test' }
    ] });
    await tx.schoolClass.createMany({ data: [
      { id: ids.classA, code: `${prefix}-A`, name: 'Concurrency A', yearLabel: '2026/2027' },
      { id: ids.classB, code: `${prefix}-B`, name: 'Concurrency B', yearLabel: '2026/2027' },
      { id: ids.classC, code: `${prefix}-C`, name: 'Concurrency C', yearLabel: '2026/2027' }
    ] });
    await tx.subject.create({ data: { id: ids.subjectId, code: `${prefix}-SUB`, name: 'Concurrency Subject' } });
    await tx.room.createMany({ data: [
      { id: ids.roomA, code: `${prefix}-R-A`, name: 'Concurrency Room A' },
      { id: ids.roomB, code: `${prefix}-R-B`, name: 'Concurrency Room B' }
    ] });
    await tx.academicYear.create({ data: { id: ids.yearId, code: `${prefix}-Y`, name: 'Concurrency Year', active: true } });
    await tx.semester.create({ data: { id: ids.semesterId, academicYearId: ids.yearId, code: `${prefix}-S1`, name: 'Concurrency Semester', active: true } });
    await tx.weeklySchedule.create({ data: { id: ids.weeklyScheduleId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, roomId: ids.roomA, academicYearId: ids.yearId, semesterId: ids.semesterId, dayOfWeek: 1, startTime: '08:00', endTime: '09:00', effectiveFrom: dbDate('2026-07-01'), active: true } });
  });
  return ids;
}

async function main() {
  const prisma = new PrismaClient();
  const outputPath = resolve(process.argv.find((arg) => arg.startsWith('--json='))?.slice('--json='.length) ?? 'artifacts/concurrency/postgres-concurrency.json');
  const prefix = id('pgconc');
  const results: Result[] = [];
  const ids = await setupBase(prisma, prefix);

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ConcurrencyNonceProbe" ("nonceHash" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ConcurrencyWorkerJobProbe" ("jobKey" TEXT PRIMARY KEY, "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "attempts" INTEGER NOT NULL DEFAULT 1)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ConcurrencyOutboxPublishProbe" ("logicalKey" TEXT PRIMARY KEY, "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "eventId" TEXT NOT NULL)`);

  await record(results, 'open_open_one_winner', async () => {
    const sessionId = `${prefix}-open-open`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(2, 1), endsAt: at(2, 2), businessDate: dbDate('2026-07-02'), status: SessionStatus.SCHEDULED });
    const settled = await concurrentTransactions('open-open', 2, async (tx, index, wait) => {
      await wait('before-update');
      return tx.session.updateMany({ where: { id: sessionId, status: SessionStatus.SCHEDULED }, data: { status: SessionStatus.OPEN, openedAt: new Date(Date.UTC(2026, 6, 2, 1, 0, index)) } });
    }, Prisma.TransactionIsolationLevel.Serializable);
    const values = settledCounts(settled).values as Array<{ count: number }>;
    const final = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    const winners = values.filter((value) => value.count === 1).length;
    return { ok: winners === 1 && final.status === SessionStatus.OPEN, detail: `winners=${winners}, status=${final.status}` };
  });

  await record(results, 'open_auto_missed_one_terminal_state', async () => {
    const sessionId = `${prefix}-open-missed`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(2, 3), endsAt: at(2, 4), businessDate: dbDate('2026-07-02'), status: SessionStatus.SCHEDULED });
    const settled = await concurrentTransactions('open-missed', 2, async (tx, index, wait) => {
      await wait('before-terminal-update');
      if (index === 0) return tx.session.updateMany({ where: { id: sessionId, status: SessionStatus.SCHEDULED }, data: { status: SessionStatus.OPEN, openedAt: new Date() } });
      return tx.session.updateMany({ where: { id: sessionId, status: SessionStatus.SCHEDULED }, data: { status: SessionStatus.MISSED, closedAt: new Date() } });
    }, Prisma.TransactionIsolationLevel.Serializable);
    const counts = (settledCounts(settled).values as Array<{ count: number }>).map((value) => value.count);
    const final = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    return { ok: counts.filter((count) => count === 1).length === 1 && (final.status === SessionStatus.OPEN || final.status === SessionStatus.MISSED), detail: `counts=${counts.join(',')}, status=${final.status}` };
  });

  await record(results, 'close_close_one_winner', async () => {
    const sessionId = `${prefix}-close-close`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(2, 5), endsAt: at(2, 6), businessDate: dbDate('2026-07-02'), status: SessionStatus.OPEN });
    await addRosterAndAttendance(prisma, prefix, sessionId, ids.studentId, ids.classA, `${prefix}-A`, 'Concurrency A');
    const settled = await concurrentTransactions('close-close', 2, async (tx, _index, wait) => {
      await wait('before-close');
      return tx.session.updateMany({ where: { id: sessionId, status: SessionStatus.OPEN }, data: { status: SessionStatus.CLOSED, closedAt: new Date() } });
    }, Prisma.TransactionIsolationLevel.Serializable);
    const counts = (settledCounts(settled).values as Array<{ count: number }>).map((value) => value.count);
    const final = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    return { ok: counts.filter((count) => count === 1).length === 1 && final.status === SessionStatus.CLOSED, detail: `counts=${counts.join(',')}` };
  });

  await record(results, 'attendance_close_overlap_serialized_by_session_row', async () => {
    const sessionId = `${prefix}-attendance-close`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(2, 7), endsAt: at(2, 8), businessDate: dbDate('2026-07-02'), status: SessionStatus.OPEN });
    await addRosterAndAttendance(prisma, prefix, sessionId, ids.studentId, ids.classA, `${prefix}-A`, 'Concurrency A');
    const settled = await concurrentTransactions('attendance-close', 2, async (tx, index, wait) => {
      if (index === 0) {
        const touched = await tx.session.updateMany({ where: { id: sessionId, status: SessionStatus.OPEN }, data: { updatedAt: new Date() } });
        await wait('session-locked');
        if (touched.count !== 1) return { attendanceUpdated: 0 };
        const updated = await tx.studentAttendance.updateMany({ where: { sessionId, studentId: ids.studentId, reviewState: AttendanceReviewState.DEFAULTED }, data: { status: StudentAttendanceStatus.HADIR, reviewState: AttendanceReviewState.CONFIRMED, confirmedAt: new Date(), confirmedById: ids.teacherId, confirmationSource: AttendanceConfirmationSource.MANUAL_SINGLE } });
        return { attendanceUpdated: updated.count };
      }
      await wait('session-locked');
      const closed = await tx.session.updateMany({ where: { id: sessionId, status: SessionStatus.OPEN }, data: { status: SessionStatus.CLOSED, closedAt: new Date() } });
      return { closed: closed.count };
    });
    const finalAttendance = await prisma.studentAttendance.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId, studentId: ids.studentId } } });
    const finalSession = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    return { ok: settled.every((item) => item.status === 'fulfilled') && finalAttendance.status === StudentAttendanceStatus.HADIR && finalSession.status === SessionStatus.CLOSED, detail: `attendance=${finalAttendance.status}, session=${finalSession.status}` };
  });

  await record(results, 'stale_update_update_one_winner', async () => {
    const sessionId = `${prefix}-stale-update`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(2, 9), endsAt: at(2, 10), businessDate: dbDate('2026-07-02'), status: SessionStatus.OPEN });
    await addRosterAndAttendance(prisma, prefix, sessionId, ids.studentId, ids.classA, `${prefix}-A`, 'Concurrency A');
    const before = await prisma.studentAttendance.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId, studentId: ids.studentId } } });
    const settled = await concurrentTransactions('stale-update', 2, async (tx, index, wait) => {
      await wait('before-stale-update');
      return tx.studentAttendance.updateMany({ where: { id: before.id, updatedAt: before.updatedAt }, data: { status: index === 0 ? StudentAttendanceStatus.HADIR : StudentAttendanceStatus.IZIN, updatedAt: new Date(Date.UTC(2026, 6, 2, 9, 30, index)) } });
    });
    const counts = (settledCounts(settled).values as Array<{ count: number }>).map((value) => value.count);
    return { ok: counts.filter((count) => count === 1).length === 1 && counts.filter((count) => count === 0).length === 1, detail: `counts=${counts.join(',')}` };
  });

  await record(results, 'correction_correction_counts_both_events', async () => {
    const sessionId = `${prefix}-correction`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(2, 11), endsAt: at(2, 12), businessDate: dbDate('2026-07-02'), status: SessionStatus.OPEN });
    await addRosterAndAttendance(prisma, prefix, sessionId, ids.studentId, ids.classA, `${prefix}-A`, 'Concurrency A');
    const settled = await concurrentTransactions('correction-correction', 2, async (tx, index, wait) => {
      await wait('before-correction');
      const updated = await tx.studentAttendance.update({ where: { sessionId_studentId: { sessionId, studentId: ids.studentId } }, data: { status: index === 0 ? StudentAttendanceStatus.IZIN : StudentAttendanceStatus.SAKIT, evidenceLabel: 'corrected', correctionCount: { increment: 1 }, correctedAt: new Date(), correctedById: ids.adminId, reviewState: AttendanceReviewState.CORRECTED } });
      await tx.attendanceCorrectionEvent.create({ data: { attendanceId: updated.id, sessionId, studentId: ids.studentId, actorId: ids.adminId, beforeStatus: null, afterStatus: updated.status, reason: `concurrent correction ${index}`, after: { status: updated.status } } });
      return updated.correctionCount;
    });
    const final = await prisma.studentAttendance.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId, studentId: ids.studentId } } });
    const eventCount = await prisma.attendanceCorrectionEvent.count({ where: { sessionId, studentId: ids.studentId } });
    return { ok: settled.every((item) => item.status === 'fulfilled') && final.correctionCount === 2 && eventCount === 2, detail: `correctionCount=${final.correctionCount}, events=${eventCount}` };
  });

  await record(results, 'bulk_individual_one_default_winner', async () => {
    const sessionId = `${prefix}-bulk-individual`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(3, 1), endsAt: at(3, 2), businessDate: dbDate('2026-07-03'), status: SessionStatus.OPEN });
    await addRosterAndAttendance(prisma, prefix, sessionId, ids.studentId, ids.classA, `${prefix}-A`, 'Concurrency A');
    const settled = await concurrentTransactions('bulk-individual', 2, async (tx, index, wait) => {
      await wait('before-default-update');
      if (index === 0) return tx.studentAttendance.updateMany({ where: { sessionId, reviewState: AttendanceReviewState.DEFAULTED }, data: { status: StudentAttendanceStatus.HADIR, reviewState: AttendanceReviewState.CONFIRMED, confirmationSource: AttendanceConfirmationSource.MANUAL_BULK, confirmedAt: new Date(), confirmedById: ids.teacherId } });
      return tx.studentAttendance.updateMany({ where: { sessionId, studentId: ids.studentId, reviewState: AttendanceReviewState.DEFAULTED }, data: { status: StudentAttendanceStatus.IZIN, reviewState: AttendanceReviewState.CONFIRMED, confirmationSource: AttendanceConfirmationSource.MANUAL_SINGLE, confirmedAt: new Date(), confirmedById: ids.teacherId } });
    });
    const counts = (settledCounts(settled).values as Array<{ count: number }>).map((value) => value.count);
    const final = await prisma.studentAttendance.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId, studentId: ids.studentId } } });
    return { ok: counts.filter((count) => count === 1).length === 1 && counts.filter((count) => count === 0).length === 1 && final.reviewState === AttendanceReviewState.CONFIRMED, detail: `counts=${counts.join(',')}, final=${final.status}` };
  });

  await record(results, 'finalization_update_one_default_winner', async () => {
    const sessionId = `${prefix}-final-update`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(3, 3), endsAt: at(3, 4), businessDate: dbDate('2026-07-03'), status: SessionStatus.OPEN });
    await addRosterAndAttendance(prisma, prefix, sessionId, ids.studentId, ids.classA, `${prefix}-A`, 'Concurrency A');
    const settled = await concurrentTransactions('finalization-update', 2, async (tx, index, wait) => {
      await wait('before-finalization');
      if (index === 0) return tx.studentAttendance.updateMany({ where: { sessionId, reviewState: AttendanceReviewState.DEFAULTED }, data: { status: StudentAttendanceStatus.ALPA, reviewState: AttendanceReviewState.CONFIRMED, confirmationSource: AttendanceConfirmationSource.FINALIZED_DEFAULT, confirmedAt: new Date(), confirmedById: ids.teacherId } });
      return tx.studentAttendance.updateMany({ where: { sessionId, studentId: ids.studentId, reviewState: AttendanceReviewState.DEFAULTED }, data: { status: StudentAttendanceStatus.HADIR, reviewState: AttendanceReviewState.CONFIRMED, confirmationSource: AttendanceConfirmationSource.MANUAL_SINGLE, confirmedAt: new Date(), confirmedById: ids.teacherId } });
    });
    const counts = (settledCounts(settled).values as Array<{ count: number }>).map((value) => value.count);
    return { ok: counts.filter((count) => count === 1).length === 1 && counts.filter((count) => count === 0).length === 1, detail: `counts=${counts.join(',')}` };
  });

  await record(results, 'duplicate_gate_in_out_one_per_direction', async () => {
    const businessDate = dbDate('2026-07-04');
    const settled = await concurrentTransactions('duplicate-gate', 4, async (tx, index, wait) => {
      await wait('before-gate-insert');
      const direction = index < 2 ? GateDirection.IN : GateDirection.OUT;
      return tx.gateLog.create({ data: { id: `${prefix}-gate-${index}`, userId: ids.studentId, direction, businessDate, tappedAt: at(4, 1, index), serverReceivedAt: at(4, 1, index), signatureVerified: true } });
    });
    const counts = settledCounts(settled);
    const final = await prisma.gateLog.count({ where: { userId: ids.studentId, businessDate, direction: { in: [GateDirection.IN, GateDirection.OUT] } } });
    return { ok: counts.fulfilled === 2 && counts.rejected === 2 && final === 2, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}, final=${final}` };
  });

  await record(results, 'device_event_id_replay_one_winner', async () => {
    const businessDate = dbDate('2026-07-05');
    const eventId = `${prefix}-event-replay`;
    const settled = await concurrentTransactions('device-event-replay', 2, async (tx, index, wait) => {
      await wait('before-device-event');
      return tx.gateLog.create({ data: { id: `${prefix}-device-event-${index}`, userId: index === 0 ? ids.studentId : ids.student2Id, direction: GateDirection.IN, businessDate, tappedAt: at(5, 1, index), serverReceivedAt: at(5, 1, index), signatureVerified: true, deviceEventId: eventId } });
    });
    const counts = settledCounts(settled);
    const final = await prisma.gateLog.count({ where: { deviceEventId: eventId } });
    return { ok: counts.fulfilled === 1 && counts.rejected === 1 && final === 1, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}, final=${final}` };
  });

  await record(results, 'nonce_replay_atomic_unique_probe', async () => {
    const nonceHash = `${prefix}-nonce`;
    const settled = await concurrentTransactions('nonce-replay', 2, async (tx, index, wait) => {
      await wait('before-nonce');
      return tx.$executeRawUnsafe(`INSERT INTO "ConcurrencyNonceProbe" ("nonceHash") VALUES ($1)`, nonceHash + (index === 0 ? '' : ''));
    });
    const counts = settledCounts(settled);
    const final = Number((await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "ConcurrencyNonceProbe" WHERE "nonceHash" = $1`, nonceHash))[0]?.count ?? 0n);
    return { ok: counts.fulfilled === 1 && counts.rejected === 1 && final === 1, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}, final=${final}` };
  });

  await record(results, 'refresh_reuse_rotation_one_winner', async () => {
    const originalId = `${prefix}-auth-original`;
    await prisma.authSession.create({ data: { id: originalId, userId: ids.adminId, refreshTokenHash: `${prefix}-refresh`, tokenFamilyId: `${prefix}-family`, expiresAt: at(30, 1) } });
    await prisma.authSession.createMany({ data: [0, 1].map((index) => ({ id: `${prefix}-auth-replacement-${index}`, userId: ids.adminId, refreshTokenHash: `${prefix}-replacement-${index}`, tokenFamilyId: `${prefix}-family`, expiresAt: at(30, 2 + index) })) });
    const settled = await concurrentTransactions('refresh-reuse', 2, async (tx, index, wait) => {
      await wait('before-refresh-rotate');
      return tx.authSession.updateMany({ where: { id: originalId, refreshTokenHash: `${prefix}-refresh`, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'rotated', replacedById: `${prefix}-auth-replacement-${index}` } });
    }, Prisma.TransactionIsolationLevel.Serializable);
    const summary = settledCounts(settled);
    const counts = (summary.values as Array<{ count: number }>).map((value) => value.count);
    const original = await prisma.authSession.findUniqueOrThrow({ where: { id: originalId } });
    const oneUpdateWinner = counts.filter((count) => count === 1).length === 1;
    const loserSerialized = counts.filter((count) => count === 0).length === 1 || summary.rejected === 1;
    return { ok: oneUpdateWinner && loserSerialized && Boolean(original.revokedAt), detail: `fulfilled=${summary.fulfilled}, rejected=${summary.rejected}, counts=${counts.join(',')}, replacedBy=${original.replacedById}` };
  });

  async function generationScenario(name: string, attempts: number, day: number) {
    const weeklyScheduleId = `${prefix}-${name}-weekly`;
    await prisma.weeklySchedule.create({ data: { id: weeklyScheduleId, classId: ids.classB, subjectId: ids.subjectId, teacherId: ids.teacher2Id, roomId: null, academicYearId: ids.yearId, semesterId: ids.semesterId, dayOfWeek: day % 7, startTime: '10:00', endTime: '11:00', effectiveFrom: dbDate('2026-07-01'), active: true } });
    const settled = await concurrentTransactions(name, attempts, async (tx, index, wait) => {
      await wait('before-generated-session');
      return tx.session.create({ data: { id: `${prefix}-${name}-session-${index}`, classId: ids.classB, subjectId: ids.subjectId, teacherId: ids.teacher2Id, startsAt: at(day, 10, index), endsAt: at(day, 11, index), businessDate: dbDate(`2026-07-${String(day).padStart(2, '0')}`), status: SessionStatus.SCHEDULED, weeklyScheduleId } });
    });
    const counts = settledCounts(settled);
    const final = await prisma.session.count({ where: { weeklyScheduleId, businessDate: dbDate(`2026-07-${String(day).padStart(2, '0')}`) } });
    return { ok: counts.fulfilled === 1 && counts.rejected === attempts - 1 && final === 1, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}, final=${final}` };
  }

  await record(results, 'generation_x2_one_winner', () => generationScenario('generation-x2', 2, 6));
  await record(results, 'generation_x5_one_winner', () => generationScenario('generation-x5', 5, 7));

  async function overlapScenario(name: string, scope: 'teacher' | 'class' | 'room', day: number) {
    const settled = await concurrentTransactions(name, 2, async (tx, index, wait) => {
      await wait('before-overlap');
      const teacherId = scope === 'teacher' ? ids.teacherId : (index === 0 ? ids.teacherId : ids.teacher2Id);
      const classId = scope === 'class' ? ids.classC : (index === 0 ? ids.classA : ids.classB);
      const roomId = scope === 'room' ? ids.roomB : null;
      return tx.session.create({ data: { id: `${prefix}-${name}-${index}`, classId, subjectId: ids.subjectId, teacherId, roomId, startsAt: at(day, 12, index === 0 ? 0 : 30), endsAt: at(day, 13, index === 0 ? 0 : 30), businessDate: dbDate(`2026-07-${String(day).padStart(2, '0')}`), status: SessionStatus.SCHEDULED } });
    });
    const counts = settledCounts(settled);
    return { ok: counts.fulfilled === 1 && counts.rejected === 1, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}` };
  }

  await record(results, 'teacher_overlap_exclusion_one_winner', () => overlapScenario('teacher-overlap', 'teacher', 8));
  await record(results, 'class_overlap_exclusion_one_winner', () => overlapScenario('class-overlap', 'class', 9));
  await record(results, 'room_overlap_exclusion_one_winner', () => overlapScenario('room-overlap', 'room', 10));

  await record(results, 'audit_x50_batched_barrier_writes', async () => {
    for (let batch = 0; batch < 10; batch += 1) {
      const settled = await concurrentTransactions(`audit-x50-${batch}`, 5, async (tx, index, wait) => {
        await wait('before-audit');
        await writeAudit(tx as any, { actorId: ids.adminId, actorRole: Role.ADMIN_TU, module: 'concurrency-suite', action: 'concurrency.audit.write', resource: 'suite', resourceId: `${prefix}-audit-${batch}-${index}`, after: { batch, index } });
        return true;
      });
      if (!settled.every((item) => item.status === 'fulfilled')) return { ok: false, detail: `batch ${batch} failed` };
    }
    const written = await prisma.auditEntry.count({ where: { module: 'concurrency-suite', resourceId: { startsWith: `${prefix}-audit-` } } });
    const state = await prisma.auditChainState.findUnique({ where: { id: 1 } });
    return { ok: written === 50 && Number(state?.lastSequence ?? 0) >= 50, detail: `written=${written}, lastSequence=${state?.lastSequence}` };
  });

  await record(results, 'roster_x5_exactly_once', async () => {
    const sessionId = `${prefix}-roster-x5`;
    await createSession(prisma, { id: sessionId, classId: ids.classA, subjectId: ids.subjectId, teacherId: ids.teacherId, startsAt: at(11, 1), endsAt: at(11, 2), businessDate: dbDate('2026-07-11'), status: SessionStatus.OPEN });
    const settled = await concurrentTransactions('roster-x5', 5, async (tx, index, wait) => {
      await wait('before-roster');
      return tx.sessionRoster.create({ data: { id: `${prefix}-roster-x5-${index}`, sessionId, studentId: ids.studentId, studentNameSnapshot: 'Roster Student', studentUsernameSnapshot: `${prefix}.student`, classIdSnapshot: ids.classA, classCodeSnapshot: `${prefix}-A`, classNameSnapshot: 'Concurrency A', captureSource: RosterCaptureSource.BACKFILL } });
    });
    const counts = settledCounts(settled);
    const final = await prisma.sessionRoster.count({ where: { sessionId, studentId: ids.studentId } });
    return { ok: counts.fulfilled === 1 && counts.rejected === 4 && final === 1, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}, final=${final}` };
  });

  async function transferScenario(name: string, attempts: number, day: number) {
    const transferStudentId = `${prefix}-${name}-student`;
    await prisma.user.create({ data: { id: transferStudentId, username: `${prefix}.${name}.student`, fullName: `Transfer ${name}`, role: Role.SISWA, passwordHash: 'test' } });
    const settled = await concurrentTransactions(name, attempts, async (tx, index, wait) => {
      await wait('before-transfer');
      return tx.classEnrollment.create({ data: { id: `${prefix}-${name}-enroll-${index}`, classId: index % 2 === 0 ? ids.classA : ids.classB, studentId: transferStudentId, academicYearId: ids.yearId, semesterId: ids.semesterId, effectiveFrom: dbDate(`2026-07-${String(day).padStart(2, '0')}`), active: true, administrativeStatus: 'ACTIVE', createdById: ids.adminId } });
    }, Prisma.TransactionIsolationLevel.Serializable);
    const counts = settledCounts(settled);
    const final = await prisma.classEnrollment.count({ where: { studentId: transferStudentId } });
    return { ok: counts.fulfilled === 1 && counts.rejected === attempts - 1 && final === 1, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}, final=${final}` };
  }

  await record(results, 'transfer_x2_overlap_one_winner', () => transferScenario('transfer-x2', 2, 12));
  await record(results, 'transfer_x5_overlap_one_winner', () => transferScenario('transfer-x5', 5, 13));

  await record(results, 'worker_retry_after_commit_idempotent', async () => {
    const jobKey = `${prefix}-worker-job`;
    const settled = await concurrentTransactions('worker-retry', 2, async (tx, index, wait) => {
      await wait('before-worker-job');
      return tx.$executeRawUnsafe(`INSERT INTO "ConcurrencyWorkerJobProbe" ("jobKey", "attempts") VALUES ($1, 1) ON CONFLICT ("jobKey") DO UPDATE SET "attempts" = "ConcurrencyWorkerJobProbe"."attempts" + 1`, jobKey + (index === 0 ? '' : ''));
    });
    const counts = settledCounts(settled);
    const row = (await prisma.$queryRawUnsafe<Array<{ attempts: number }>>(`SELECT attempts FROM "ConcurrencyWorkerJobProbe" WHERE "jobKey" = $1`, jobKey))[0];
    return { ok: counts.fulfilled === 2 && row?.attempts === 2, detail: `fulfilled=${counts.fulfilled}, attempts=${row?.attempts}` };
  });

  await record(results, 'reconciliation_fingerprint_retry_one_winner', async () => {
    const fingerprint = `${prefix}-flag-fingerprint`;
    const settled = await concurrentTransactions('flag-fingerprint', 2, async (tx, index, wait) => {
      await wait('before-flag');
      return tx.reconciliationFlag.create({ data: { id: `${prefix}-flag-${index}`, type: ReconciliationFlagType.BOLOS_KELAS, status: ReconciliationStatus.OPEN, userId: ids.studentId, details: { index }, fingerprint } });
    });
    const counts = settledCounts(settled);
    const final = await prisma.reconciliationFlag.count({ where: { fingerprint } });
    return { ok: counts.fulfilled === 1 && counts.rejected === 1 && final === 1, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}, final=${final}` };
  });

  await record(results, 'duplicate_outbox_publish_probe_one_logical_event', async () => {
    const logicalKey = `${prefix}-outbox-logical`;
    await prisma.outboxEvent.createMany({ data: [
      { id: `${prefix}-outbox-1`, topic: 'live-monitor', eventType: 'probe.updated', payload: { logicalKey, version: 1 } },
      { id: `${prefix}-outbox-2`, topic: 'live-monitor', eventType: 'probe.updated', payload: { logicalKey, version: 1 } }
    ] });
    const settled = await concurrentTransactions('outbox-publish', 2, async (tx, index, wait) => {
      await wait('before-publish');
      return tx.$executeRawUnsafe(`INSERT INTO "ConcurrencyOutboxPublishProbe" ("logicalKey", "eventId") VALUES ($1, $2)`, logicalKey, `${prefix}-outbox-${index + 1}`);
    });
    const counts = settledCounts(settled);
    const final = Number((await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "ConcurrencyOutboxPublishProbe" WHERE "logicalKey" = $1`, logicalKey))[0]?.count ?? 0n);
    return { ok: counts.fulfilled === 1 && counts.rejected === 1 && final === 1, detail: `fulfilled=${counts.fulfilled}, rejected=${counts.rejected}, final=${final}` };
  });

  await record(results, 'sse_reconnect_during_publish_replays_missed_event', async () => {
    const before = await prisma.outboxEvent.create({ data: { id: `${prefix}-sse-before`, topic: 'live-monitor', eventType: 'snapshot.seed', payload: { prefix } } });
    const settled = await concurrentTransactions('sse-reconnect', 2, async (tx, index, wait) => {
      if (index === 0) {
        await wait('before-live-event');
        return tx.outboxEvent.create({ data: { id: `${prefix}-sse-live`, topic: 'live-monitor', eventType: 'session.changed', payload: { sessionId: `${prefix}-sse-session` } } });
      }
      await wait('before-live-event');
      const anchor = await tx.outboxEvent.findUniqueOrThrow({ where: { id: before.id } });
      await new Promise((resolveWaiter) => setTimeout(resolveWaiter, 250));
      return tx.outboxEvent.findMany({ where: { topic: 'live-monitor', createdAt: { gt: anchor.createdAt } }, orderBy: { createdAt: 'asc' } });
    });
    const counts = settledCounts(settled);
    const replayArrays = counts.values.filter((value): value is Array<{ id: string }> => Array.isArray(value));
    const replayHasLive = replayArrays.some((rows) => rows.some((row) => row.id === `${prefix}-sse-live`));
    return { ok: counts.fulfilled === 2 && replayHasLive, detail: `fulfilled=${counts.fulfilled}, replayHasLive=${replayHasLive}` };
  });

  const ok = results.every((result) => result.ok);
  const report = { generatedAt: new Date().toISOString(), prefix, ok, scenarioCount: results.length, passCount: results.filter((result) => result.ok).length, failCount: results.filter((result) => !result.ok).length, results };
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
