/**
 * XII A Friday WeeklySchedule revision (2026-07-31).
 *
 * Default: read-only preflight.
 * Mutating modes require --apply and --confirm-backup-path=<existing dump file>.
 *
 * Modes:
 *   (default)              preflight only
 *   --apply-version        close 3 WS + create 4 WS
 *   --apply-delete-sessions delete eligible future sessions on closed WS only
 *   --apply-generate       generate sessions for new WS (from effectiveFrom to generateTo)
 *   --apply-all            version → delete → generate (each step validated)
 *
 * Never prints DATABASE_URL or secrets.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Prisma, PrismaClient, Role, SessionStatus, TeacherLeaveStatus } from '@prisma/client';
import {
  addCalendarDays,
  businessDateKey,
  businessWeekday,
  localDateTimeToUtc
} from '../apps/api/src/common/business-time';

const CLASS_ID = 'cmrcl0ba90031nh8h7v93l981';
const ACADEMIC_YEAR_ID = 'cmrl11f2u0004k9h5e7v4zdil';
const SEMESTER_ID = 'cmrl11f3i0009k9h5pgpfm6ll';
const DAY_OF_WEEK = 5;
const EFFECTIVE_FROM_NEW = '2026-07-31';
const EFFECTIVE_TO_OLD = '2026-07-30';
const FROZEN_BUSINESS_DATE = '2026-07-24';

const SUBJECT = {
  FISIKA: 'cmrvvl5v40029rinpe7dxw1os',
  PKN: 'cmrvvl6lc0039rinpwuytuclt',
  FIKIH: 'cmrvvl5rw0025rinp1q8xikfy'
} as const;

const TEACHER = {
  HELFI: 'cmr7fx5ue00oio6zlhp56kmkt',
  SRI: 'cmr7fx5u600oeo6zl6jx53vyo',
  MASCAHAYA: 'cmr7fx5tw00o9o6zl7hgsiuic'
} as const;

const ASSIGNMENT = {
  FISIKA: 'cmrvvm06e015srinpp95p1v0a',
  PKN: 'cmrvvlyrj0144rinp2m9mfs04',
  FIKIH: 'cmrvvm31z0194rinpgkl6uucs'
} as const;

const CLOSE_WS_IDS = [
  'cmrvvnvu202sjrinp7ec83jp7',
  'cmrvvnw2n02sorinpwbp0o9ej',
  'cmrvvnw9202strinp6fucj3b6'
] as const;

const KEEP_FIKIH_WS_ID = 'cmrvvnwfg02syrinpyw54khwl';

const EXPECTED_CLOSE: Array<{
  id: string;
  startTime: string;
  endTime: string;
  subjectId: string;
}> = [
  { id: 'cmrvvnvu202sjrinp7ec83jp7', startTime: '08:00', endTime: '09:20', subjectId: SUBJECT.PKN },
  { id: 'cmrvvnw2n02sorinpwbp0o9ej', startTime: '09:40', endTime: '12:00', subjectId: SUBJECT.FISIKA },
  { id: 'cmrvvnw9202strinp6fucj3b6', startTime: '13:10', endTime: '13:50', subjectId: SUBJECT.FISIKA }
];

const EXPECTED_FIKIH = {
  id: KEEP_FIKIH_WS_ID,
  startTime: '13:50',
  endTime: '15:10',
  subjectId: SUBJECT.FIKIH,
  teacherId: TEACHER.MASCAHAYA,
  teachingAssignmentId: ASSIGNMENT.FIKIH
};

type NewSlot = {
  label: string;
  startTime: string;
  endTime: string;
  subjectId: string;
  teacherId: string;
  teachingAssignmentId: string;
};

const NEW_SLOTS: NewSlot[] = [
  {
    label: 'FISIKA-1',
    startTime: '08:00',
    endTime: '09:20',
    subjectId: SUBJECT.FISIKA,
    teacherId: TEACHER.HELFI,
    teachingAssignmentId: ASSIGNMENT.FISIKA
  },
  {
    label: 'FISIKA-2',
    startTime: '09:40',
    endTime: '11:40',
    subjectId: SUBJECT.FISIKA,
    teacherId: TEACHER.HELFI,
    teachingAssignmentId: ASSIGNMENT.FISIKA
  },
  {
    label: 'PKN-1',
    startTime: '11:40',
    endTime: '12:00',
    subjectId: SUBJECT.PKN,
    teacherId: TEACHER.SRI,
    teachingAssignmentId: ASSIGNMENT.PKN
  },
  {
    label: 'PKN-2',
    startTime: '13:10',
    endTime: '13:50',
    subjectId: SUBJECT.PKN,
    teacherId: TEACHER.SRI,
    teachingAssignmentId: ASSIGNMENT.PKN
  }
];

type Gate = { name: string; ok: boolean; detail: string };

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function utcDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function dateKeyFromDbDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function minDateKey(a: string, b: string) {
  return a <= b ? a : b;
}

function countFridaysInclusive(fromKey: string, toKey: string) {
  let n = 0;
  for (let key = fromKey; key <= toKey; key = addCalendarDays(key, 1)) {
    if (businessWeekday(localDateTimeToUtc(key, '12:00')) === DAY_OF_WEEK) n += 1;
  }
  return n;
}

function fingerprintRow(row: unknown) {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 16);
}

type ActingIdentity = {
  teacherId: string;
  teachingAssignmentId: string;
  substitutionSourceTeacherId: string | null;
  substitutionSourceAssignmentId: string | null;
};

async function resolveActingIdentity(
  tx: Prisma.TransactionClient,
  formal: { id: string; teacherId: string; subjectId: string; classId: string; academicYearId: string; semesterId: string },
  businessDateKeyValue: string
): Promise<ActingIdentity> {
  const date = utcDate(businessDateKeyValue);
  const leaves = await tx.teacherLeave.findMany({
    where: {
      applicantId: formal.teacherId,
      applicantRole: Role.GURU_MAPEL,
      status: TeacherLeaveStatus.APPROVED,
      startDate: { lte: date },
      endDate: { gte: date }
    },
    select: { substituteTeacherId: true },
    orderBy: { id: 'asc' }
  });
  if (leaves.length > 1) throw new Error(`Multiple approved leaves on ${businessDateKeyValue} for ${formal.teacherId}`);
  const leave = leaves[0];
  if (!leave?.substituteTeacherId) {
    return {
      teacherId: formal.teacherId,
      teachingAssignmentId: formal.id,
      substitutionSourceTeacherId: null,
      substitutionSourceAssignmentId: null
    };
  }
  const substitute = await tx.user.findUnique({
    where: { id: leave.substituteTeacherId },
    select: { id: true, active: true, role: true }
  });
  if (!substitute?.active || substitute.role !== Role.GURU_MAPEL) {
    throw new Error(`Substitute invalid on ${businessDateKeyValue}`);
  }
  const candidate = await tx.teachingAssignment.findFirst({
    where: {
      teacherId: substitute.id,
      subjectId: formal.subjectId,
      classId: formal.classId,
      academicYearId: formal.academicYearId,
      semesterId: formal.semesterId,
      active: true,
      effectiveFrom: { lte: date },
      effectiveTo: { gte: date }
    },
    select: { id: true }
  });
  if (!candidate) throw new Error(`Substitute assignment missing on ${businessDateKeyValue}`);
  return {
    teacherId: substitute.id,
    teachingAssignmentId: candidate.id,
    substitutionSourceTeacherId: formal.teacherId,
    substitutionSourceAssignmentId: formal.id
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('BLOCKED: DATABASE_URL unset. Export it (or use production env) then re-run.');
    console.error('Default mode is preflight-only; no mutations without --apply-* flags.');
    process.exit(2);
  }

  const applyVersion = hasFlag('--apply-version') || hasFlag('--apply-all');
  const applyDelete = hasFlag('--apply-delete-sessions') || hasFlag('--apply-all');
  const applyGenerate = hasFlag('--apply-generate') || hasFlag('--apply-all');
  const mutating = applyVersion || applyDelete || applyGenerate;
  const backupPath = argValue('--confirm-backup-path');
  const jsonOut = resolve(argValue('--json') ?? 'artifacts/ops/xii-a-friday-schedule-preflight.json');

  if (mutating) {
    if (!backupPath) {
      console.error('BLOCKED: mutating mode requires --confirm-backup-path=/path/to/pg_dump.file');
      process.exit(2);
    }
    try {
      const st = statSync(backupPath);
      if (!st.isFile() || st.size < 1024) {
        console.error('BLOCKED: backup path must be an existing file >= 1KB');
        process.exit(2);
      }
    } catch {
      console.error('BLOCKED: backup path not found');
      process.exit(2);
    }
  }

  const prisma = new PrismaClient();
  const gates: Gate[] = [];
  const report: Record<string, unknown> = {
    mode: mutating ? 'mutate' : 'preflight',
    effectiveFromNew: EFFECTIVE_FROM_NEW,
    effectiveToOld: EFFECTIVE_TO_OLD,
    classId: CLASS_ID,
    dayOfWeek: DAY_OF_WEEK,
    activeSemantics: 'keep active=true; close via effectiveTo only',
    startedAt: new Date().toISOString()
  };

  try {
    const weekly = await prisma.weeklySchedule.findMany({
      where: { classId: CLASS_ID, dayOfWeek: DAY_OF_WEEK },
      orderBy: [{ startTime: 'asc' }, { effectiveFrom: 'asc' }]
    });
    report.weeklySchedules = weekly.map((row) => ({
      id: row.id,
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      teachingAssignmentId: row.teachingAssignmentId,
      roomId: row.roomId,
      startTime: row.startTime,
      endTime: row.endTime,
      effectiveFrom: dateKeyFromDbDate(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? dateKeyFromDbDate(row.effectiveTo) : null,
      active: row.active
    }));

    for (const expected of EXPECTED_CLOSE) {
      const row = weekly.find((item) => item.id === expected.id);
      gates.push({
        name: `close_ws_match_${expected.id}`,
        ok: Boolean(
          row
          && row.startTime === expected.startTime
          && row.endTime === expected.endTime
          && row.subjectId === expected.subjectId
          && row.classId === CLASS_ID
          && row.dayOfWeek === DAY_OF_WEEK
        ),
        detail: row
          ? `${row.startTime}-${row.endTime} subject=${row.subjectId}`
          : 'missing'
      });
    }

    const fikih = weekly.find((item) => item.id === KEEP_FIKIH_WS_ID);
    gates.push({
      name: 'fikih_preserved_identity',
      ok: Boolean(
        fikih
        && fikih.startTime === EXPECTED_FIKIH.startTime
        && fikih.endTime === EXPECTED_FIKIH.endTime
        && fikih.subjectId === EXPECTED_FIKIH.subjectId
        && fikih.teacherId === EXPECTED_FIKIH.teacherId
        && fikih.teachingAssignmentId === EXPECTED_FIKIH.teachingAssignmentId
      ),
      detail: fikih
        ? `${fikih.startTime}-${fikih.endTime} teacher=${fikih.teacherId}`
        : 'missing'
    });

    const assignments = await prisma.teachingAssignment.findMany({
      where: { id: { in: [ASSIGNMENT.FISIKA, ASSIGNMENT.PKN, ASSIGNMENT.FIKIH] } }
    });
    const semester = await prisma.semester.findUnique({ where: { id: SEMESTER_ID } });
    report.assignments = assignments.map((row) => ({
      id: row.id,
      teacherId: row.teacherId,
      subjectId: row.subjectId,
      classId: row.classId,
      active: row.active,
      effectiveFrom: dateKeyFromDbDate(row.effectiveFrom),
      effectiveTo: dateKeyFromDbDate(row.effectiveTo)
    }));
    report.semester = semester
      ? {
        id: semester.id,
        active: semester.active,
        startsAt: semester.startsAt ? businessDateKey(semester.startsAt) : null,
        endsAt: semester.endsAt ? businessDateKey(semester.endsAt) : null
      }
      : null;

    for (const slot of NEW_SLOTS) {
      const ta = assignments.find((item) => item.id === slot.teachingAssignmentId);
      gates.push({
        name: `ta_tuple_${slot.label}`,
        ok: Boolean(
          ta
          && ta.active
          && ta.classId === CLASS_ID
          && ta.subjectId === slot.subjectId
          && ta.teacherId === slot.teacherId
          && ta.academicYearId === ACADEMIC_YEAR_ID
          && ta.semesterId === SEMESTER_ID
          && dateKeyFromDbDate(ta.effectiveTo) >= EFFECTIVE_FROM_NEW
        ),
        detail: ta
          ? `active=${ta.active} to=${dateKeyFromDbDate(ta.effectiveTo)}`
          : 'missing'
      });
    }

    const semesterEndKey = semester?.endsAt ? businessDateKey(semester.endsAt) : null;
    let generateToClamped: string | null = semesterEndKey;
    if (generateToClamped) {
      for (const id of [ASSIGNMENT.FISIKA, ASSIGNMENT.PKN]) {
        const ta = assignments.find((row) => row.id === id);
        if (ta) generateToClamped = minDateKey(generateToClamped, dateKeyFromDbDate(ta.effectiveTo));
      }
    }
    report.generateTo = generateToClamped;
    report.expectedFridays = generateToClamped
      ? countFridaysInclusive(EFFECTIVE_FROM_NEW, generateToClamped)
      : null;
    gates.push({
      name: 'generate_range_resolvable',
      ok: Boolean(generateToClamped && generateToClamped >= EFFECTIVE_FROM_NEW),
      detail: generateToClamped ?? 'null'
    });

    const roomId = fikih?.roomId
      ?? weekly.find((row) => CLOSE_WS_IDS.includes(row.id as typeof CLOSE_WS_IDS[number]))?.roomId
      ?? null;
    report.roomIdForNew = roomId;

    const overlaps = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH closed_ids AS (
        SELECT unnest(ARRAY[
          ${CLOSE_WS_IDS[0]},
          ${CLOSE_WS_IDS[1]},
          ${CLOSE_WS_IDS[2]}
        ]::text[]) AS id
      ),
      targets AS (
        SELECT * FROM (VALUES
          (${TEACHER.HELFI}::text, '08:00'::text, '09:20'::text, 'FISIKA-1'),
          (${TEACHER.HELFI}, '09:40', '11:40', 'FISIKA-2'),
          (${TEACHER.SRI}, '11:40', '12:00', 'PKN-1'),
          (${TEACHER.SRI}, '13:10', '13:50', 'PKN-2')
        ) AS t(teacher_id, start_time, end_time, label)
      )
      SELECT t.label, t.teacher_id, t.start_time, t.end_time,
             ws.id AS conflicting_ws_id, ws."classId", ws."startTime", ws."endTime",
             ws."effectiveFrom", ws."effectiveTo", ws.active
      FROM targets t
      JOIN "WeeklySchedule" ws
        ON ws."teacherId" = t.teacher_id
       AND ws."dayOfWeek" = ${DAY_OF_WEEK}
       AND ws.id NOT IN (SELECT id FROM closed_ids)
       AND daterange(ws."effectiveFrom", COALESCE(ws."effectiveTo" + 1, 'infinity'::date), '[)')
        && daterange(${EFFECTIVE_FROM_NEW}::date, 'infinity'::date, '[)')
       AND ws."startTime"::time < t.end_time::time
       AND ws."endTime"::time > t.start_time::time
      ORDER BY t.label, ws."startTime"
    `);
    report.teacherOverlaps = overlaps;
    gates.push({
      name: 'teacher_weekly_overlap_zero',
      ok: overlaps.length === 0,
      detail: `count=${overlaps.length}`
    });

    const sessionDeps = await prisma.$queryRaw<Array<{
      id: string;
      businessDate: Date;
      status: string;
      openedAt: Date | null;
      closedAt: Date | null;
      weeklyScheduleId: string | null;
      rosterState: string;
      attendance_n: number;
      roster_n: number;
      presence_n: number;
      flag_n: number;
      correction_n: number;
      journal_n: number;
    }>>(Prisma.sql`
      SELECT s.id, s."businessDate", s.status::text, s."openedAt", s."closedAt",
             s."weeklyScheduleId", s."rosterState"::text,
             (SELECT COUNT(*)::int FROM "StudentAttendance" sa WHERE sa."sessionId" = s.id) AS attendance_n,
             (SELECT COUNT(*)::int FROM "SessionRoster" sr WHERE sr."sessionId" = s.id) AS roster_n,
             (SELECT COUNT(*)::int FROM "TeacherSessionPresence" tp WHERE tp."sessionId" = s.id) AS presence_n,
             (SELECT COUNT(*)::int FROM "ReconciliationFlag" rf WHERE rf."sessionId" = s.id) AS flag_n,
             (SELECT COUNT(*)::int FROM "AttendanceCorrectionEvent" ace WHERE ace."sessionId" = s.id) AS correction_n,
             (SELECT COUNT(*)::int FROM "SessionJournal" sj WHERE sj."sessionId" = s.id) AS journal_n
      FROM "Session" s
      WHERE s."classId" = ${CLASS_ID}
        AND s."businessDate" >= ${EFFECTIVE_FROM_NEW}::date
        AND s."weeklyScheduleId" IN (
          ${CLOSE_WS_IDS[0]}, ${CLOSE_WS_IDS[1]}, ${CLOSE_WS_IDS[2]}
        )
      ORDER BY s."businessDate", s."startsAt"
    `);

    const eligible = sessionDeps.filter((row) => (
      row.status === 'SCHEDULED'
      && row.openedAt == null
      && row.closedAt == null
      && row.attendance_n === 0
      && row.roster_n === 0
      && row.presence_n === 0
      && row.flag_n === 0
      && row.correction_n === 0
      && row.journal_n === 0
    ));
    const blockedSessions = sessionDeps.filter((row) => !eligible.some((item) => item.id === row.id));
    report.sessionDeps = {
      total: sessionDeps.length,
      eligible: eligible.length,
      blocked: blockedSessions.length,
      blockedIds: blockedSessions.map((row) => row.id),
      eligibleIds: eligible.map((row) => row.id)
    };
    const needCleanSessions = applyDelete || applyGenerate || hasFlag('--apply-all');
    gates.push({
      name: 'no_blocked_future_sessions_on_closed_ws',
      ok: !needCleanSessions || blockedSessions.length === 0,
      detail: needCleanSessions
        ? `eligible=${eligible.length} blocked=${blockedSessions.length}`
        : `preflight/version-only: eligible=${eligible.length} blocked=${blockedSessions.length} (blocking only for delete/generate)`
    });

    const frozen = await prisma.session.findMany({
      where: { classId: CLASS_ID, businessDate: utcDate(FROZEN_BUSINESS_DATE) },
      select: {
        id: true,
        status: true,
        weeklyScheduleId: true,
        subjectId: true,
        teacherId: true,
        startsAt: true,
        endsAt: true
      },
      orderBy: { startsAt: 'asc' }
    });
    const frozenFp = fingerprintRow(frozen.map((row) => ({
      id: row.id,
      status: row.status,
      weeklyScheduleId: row.weeklyScheduleId,
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString()
    })));
    report.frozen20260724 = { count: frozen.length, fingerprint: frozenFp, ids: frozen.map((row) => row.id) };
    gates.push({
      name: 'frozen_2026_07_24_present_or_empty_ok',
      ok: true,
      detail: `count=${frozen.length} fp=${frozenFp}`
    });

    const alreadyNew = await prisma.weeklySchedule.findMany({
      where: {
        classId: CLASS_ID,
        dayOfWeek: DAY_OF_WEEK,
        effectiveFrom: utcDate(EFFECTIVE_FROM_NEW),
        OR: NEW_SLOTS.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          subjectId: slot.subjectId,
          teacherId: slot.teacherId
        }))
      }
    });
    report.existingNewSlots = alreadyNew.map((row) => ({
      id: row.id,
      startTime: row.startTime,
      endTime: row.endTime,
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      effectiveTo: row.effectiveTo ? dateKeyFromDbDate(row.effectiveTo) : null
    }));
    const versionAlreadyApplied = CLOSE_WS_IDS.every((id) => {
      const row = weekly.find((item) => item.id === id);
      return row && row.effectiveTo && dateKeyFromDbDate(row.effectiveTo) === EFFECTIVE_TO_OLD;
    }) && alreadyNew.length === 4;

    gates.push({
      name: 'idempotency_state',
      ok: true,
      detail: versionAlreadyApplied
        ? 'versioning already applied (safe no-op for --apply-version)'
        : `newSlots=${alreadyNew.length}/4 closedMarked=${CLOSE_WS_IDS.filter((id) => {
          const row = weekly.find((item) => item.id === id);
          return row?.effectiveTo && dateKeyFromDbDate(row.effectiveTo) === EFFECTIVE_TO_OLD;
        }).length}/3`
    });

    // Boundary self-check half-open on target slots + fikih
    const timeline = [
      ...NEW_SLOTS.map((slot) => ({ ...slot, keep: false })),
      { label: 'FIKIH', startTime: '13:50', endTime: '15:10', subjectId: SUBJECT.FIKIH, teacherId: TEACHER.MASCAHAYA, teachingAssignmentId: ASSIGNMENT.FIKIH, keep: true }
    ];
    let classSelfOverlap = 0;
    for (let i = 0; i < timeline.length; i += 1) {
      for (let j = i + 1; j < timeline.length; j += 1) {
        const a = timeline[i];
        const b = timeline[j];
        if (a.startTime < b.endTime && a.endTime > b.startTime) classSelfOverlap += 1;
      }
    }
    gates.push({
      name: 'class_target_half_open_no_self_overlap',
      ok: classSelfOverlap === 0,
      detail: `pairs=${classSelfOverlap}`
    });

    const failed = gates.filter((gate) => !gate.ok);
    report.gates = gates;
    report.ready = failed.length === 0;
    report.status = failed.length === 0 ? 'READY' : 'BLOCKED';
    report.failedGates = failed.map((gate) => gate.name);

    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);

    console.log(`Preflight status: ${report.status}`);
    console.log(`JSON: ${jsonOut}`);
    for (const gate of gates) {
      console.log(`${gate.ok ? 'PASS' : 'FAIL'} ${gate.name} — ${gate.detail}`);
    }

    if (failed.length > 0) {
      if (mutating) {
        console.error('Mutating flags ignored because preflight BLOCKED.');
        process.exit(1);
      }
      process.exit(1);
    }

    if (!mutating) {
      console.log('No mutations. Re-run with --apply-version / --apply-delete-sessions / --apply-generate / --apply-all plus --confirm-backup-path=...');
      return;
    }

    if (!generateToClamped) throw new Error('generateTo missing after READY gate');

    if (applyVersion) {
      const versionResult = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM "WeeklySchedule"
          WHERE id IN (${CLOSE_WS_IDS[0]}, ${CLOSE_WS_IDS[1]}, ${CLOSE_WS_IDS[2]})
          FOR UPDATE
        `);

        const closed = await tx.weeklySchedule.updateMany({
          where: {
            id: { in: [...CLOSE_WS_IDS] },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { not: utcDate(EFFECTIVE_TO_OLD) } }
            ]
          },
          data: {
            effectiveTo: utcDate(EFFECTIVE_TO_OLD)
            // active intentionally unchanged
          }
        });

        const createdIds: string[] = [];
        for (const slot of NEW_SLOTS) {
          const existing = await tx.weeklySchedule.findFirst({
            where: {
              classId: CLASS_ID,
              dayOfWeek: DAY_OF_WEEK,
              startTime: slot.startTime,
              endTime: slot.endTime,
              subjectId: slot.subjectId,
              teacherId: slot.teacherId,
              effectiveFrom: utcDate(EFFECTIVE_FROM_NEW)
            }
          });
          if (existing) {
            createdIds.push(existing.id);
            continue;
          }
          const created = await tx.weeklySchedule.create({
            data: {
              classId: CLASS_ID,
              subjectId: slot.subjectId,
              teacherId: slot.teacherId,
              roomId,
              academicYearId: ACADEMIC_YEAR_ID,
              semesterId: SEMESTER_ID,
              teachingAssignmentId: slot.teachingAssignmentId,
              dayOfWeek: DAY_OF_WEEK,
              startTime: slot.startTime,
              endTime: slot.endTime,
              effectiveFrom: utcDate(EFFECTIVE_FROM_NEW),
              effectiveTo: utcDate(generateToClamped),
              active: true
            }
          });
          createdIds.push(created.id);
        }

        const closedRows = await tx.weeklySchedule.findMany({
          where: { id: { in: [...CLOSE_WS_IDS] } },
          select: { id: true, effectiveTo: true, active: true, startTime: true, endTime: true, subjectId: true }
        });
        const fikihAfter = await tx.weeklySchedule.findUnique({ where: { id: KEEP_FIKIH_WS_ID } });
        if (!fikihAfter
          || fikihAfter.startTime !== EXPECTED_FIKIH.startTime
          || fikihAfter.endTime !== EXPECTED_FIKIH.endTime
          || fikihAfter.subjectId !== EXPECTED_FIKIH.subjectId) {
          throw new Error('FIKIH row changed unexpectedly');
        }
        for (const row of closedRows) {
          if (!row.effectiveTo || dateKeyFromDbDate(row.effectiveTo) !== EFFECTIVE_TO_OLD) {
            throw new Error(`Close failed for ${row.id}`);
          }
        }
        if (createdIds.length !== 4) throw new Error(`Expected 4 new WS, got ${createdIds.length}`);
        return { closedCount: closed.count, createdIds };
      });
      report.versionResult = versionResult;
      console.log(`VERSION ok closedUpdates=${versionResult.closedCount} newIds=${versionResult.createdIds.join(',')}`);
    }

    if (applyDelete) {
      const deleteResult = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT s.id
          FROM "Session" s
          WHERE s."classId" = ${CLASS_ID}
            AND s."businessDate" >= ${EFFECTIVE_FROM_NEW}::date
            AND s."weeklyScheduleId" IN (${CLOSE_WS_IDS[0]}, ${CLOSE_WS_IDS[1]}, ${CLOSE_WS_IDS[2]})
            AND s.status = 'SCHEDULED'
            AND s."openedAt" IS NULL
            AND s."closedAt" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "StudentAttendance" sa WHERE sa."sessionId" = s.id)
            AND NOT EXISTS (SELECT 1 FROM "SessionRoster" sr WHERE sr."sessionId" = s.id)
            AND NOT EXISTS (SELECT 1 FROM "TeacherSessionPresence" tp WHERE tp."sessionId" = s.id)
            AND NOT EXISTS (SELECT 1 FROM "ReconciliationFlag" rf WHERE rf."sessionId" = s.id)
            AND NOT EXISTS (SELECT 1 FROM "AttendanceCorrectionEvent" ace WHERE ace."sessionId" = s.id)
            AND NOT EXISTS (SELECT 1 FROM "SessionJournal" sj WHERE sj."sessionId" = s.id)
          FOR UPDATE
        `);
        const ids = rows.map((row) => row.id);
        if (ids.length === 0) return { deleted: 0, ids: [] as string[] };
        const deleted = await tx.session.deleteMany({ where: { id: { in: ids } } });
        const remaining = await tx.session.count({
          where: {
            classId: CLASS_ID,
            businessDate: { gte: utcDate(EFFECTIVE_FROM_NEW) },
            weeklyScheduleId: { in: [...CLOSE_WS_IDS] }
          }
        });
        if (remaining !== 0) throw new Error(`Sessions still point at closed WS: ${remaining}`);
        const frozenAfter = await tx.session.findMany({
          where: { classId: CLASS_ID, businessDate: utcDate(FROZEN_BUSINESS_DATE) },
          select: {
            id: true,
            status: true,
            weeklyScheduleId: true,
            subjectId: true,
            teacherId: true,
            startsAt: true,
            endsAt: true
          },
          orderBy: { startsAt: 'asc' }
        });
        const fpAfter = fingerprintRow(frozenAfter.map((row) => ({
          id: row.id,
          status: row.status,
          weeklyScheduleId: row.weeklyScheduleId,
          subjectId: row.subjectId,
          teacherId: row.teacherId,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString()
        })));
        if (fpAfter !== frozenFp) throw new Error('Frozen 2026-07-24 sessions changed');
        return { deleted: deleted.count, ids };
      });
      report.deleteResult = deleteResult;
      console.log(`DELETE ok count=${deleteResult.deleted}`);
    }

    if (applyGenerate) {
      const newRows = await prisma.weeklySchedule.findMany({
        where: {
          classId: CLASS_ID,
          dayOfWeek: DAY_OF_WEEK,
          effectiveFrom: utcDate(EFFECTIVE_FROM_NEW),
          subjectId: { in: [SUBJECT.FISIKA, SUBJECT.PKN] },
          startTime: { in: NEW_SLOTS.map((slot) => slot.startTime) }
        },
        orderBy: { startTime: 'asc' }
      });
      if (newRows.length !== 4) throw new Error(`Expected 4 new WS for generate, found ${newRows.length}`);

      const expectedFridays = countFridaysInclusive(EFFECTIVE_FROM_NEW, generateToClamped);
      const generateResults: Array<Record<string, unknown>> = [];

      for (const schedule of newRows) {
        if (!schedule.active) throw new Error(`WS inactive: ${schedule.id}`);
        if (!schedule.effectiveTo) throw new Error(`WS missing effectiveTo: ${schedule.id}`);
        if (!schedule.teachingAssignmentId || !schedule.academicYearId || !schedule.semesterId) {
          throw new Error(`WS incomplete: ${schedule.id}`);
        }

        const result = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT id FROM "WeeklySchedule" WHERE id = ${schedule.id} FOR UPDATE`);
          const locked = await tx.weeklySchedule.findUnique({ where: { id: schedule.id } });
          if (!locked || !locked.active || !locked.effectiveTo || !locked.teachingAssignmentId) {
            throw new Error(`WS not generatable: ${schedule.id}`);
          }

          const candidates: Array<{ id: string; startsAt: Date; endsAt: Date; businessDateKey: string }> = [];
          for (let dayKey = EFFECTIVE_FROM_NEW; dayKey <= generateToClamped; dayKey = addCalendarDays(dayKey, 1)) {
            if (businessWeekday(localDateTimeToUtc(dayKey, '12:00')) !== DAY_OF_WEEK) continue;
            const startsAt = localDateTimeToUtc(dayKey, locked.startTime);
            const endsAt = localDateTimeToUtc(dayKey, locked.endTime);
            if (endsAt <= startsAt) throw new Error(`Invalid range on ${dayKey} for ${locked.id}`);
            candidates.push({
              id: randomUUID(),
              startsAt,
              endsAt,
              businessDateKey: dayKey
            });
          }
          if (candidates.length !== expectedFridays) {
            throw new Error(`Candidate/friday mismatch for ${locked.id}: ${candidates.length} vs ${expectedFridays}`);
          }

          const formal = await tx.teachingAssignment.findUnique({ where: { id: locked.teachingAssignmentId! } });
          if (!formal || !formal.active) throw new Error(`Formal assignment missing for ${locked.id}`);

          const existing = await tx.session.findMany({
            where: {
              weeklyScheduleId: locked.id,
              businessDate: { in: candidates.map((item) => utcDate(item.businessDateKey)) }
            },
            select: { businessDate: true }
          });
          const existingKeys = new Set(existing.map((item) => dateKeyFromDbDate(item.businessDate)));
          const insertCandidates = candidates.filter((item) => !existingKeys.has(item.businessDateKey));

          let inserted: Array<{ id: string }> = [];
          if (insertCandidates.length > 0) {
            const now = new Date();
            const actingById = new Map<string, ActingIdentity>();
            for (const candidate of insertCandidates) {
              actingById.set(
                candidate.id,
                await resolveActingIdentity(tx, formal, candidate.businessDateKey)
              );
            }
            const values = Prisma.join(insertCandidates.map((candidate) => {
              const acting = actingById.get(candidate.id)!;
              return Prisma.sql`(
              ${candidate.id},
              ${locked.id},
              ${acting.teachingAssignmentId},
              ${acting.substitutionSourceTeacherId},
              ${acting.substitutionSourceAssignmentId},
              ${locked.classId},
              ${locked.subjectId},
              ${acting.teacherId},
              ${locked.roomId},
              ${candidate.startsAt},
              ${candidate.endsAt},
              ${candidate.businessDateKey}::date,
              ${SessionStatus.SCHEDULED}::"SessionStatus",
              ${now},
              ${now}
            )`;
            }));
            inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
              INSERT INTO "Session" (
                "id", "weeklyScheduleId", "teachingAssignmentId", "substitutionSourceTeacherId", "substitutionSourceAssignmentId",
                "classId", "subjectId", "teacherId", "roomId", "startsAt", "endsAt", "businessDate", "status", "createdAt", "updatedAt"
              )
              VALUES ${values}
              ON CONFLICT ("weeklyScheduleId", "businessDate") WHERE "weeklyScheduleId" IS NOT NULL DO NOTHING
              RETURNING "id"
            `);
            if (inserted.length !== insertCandidates.length) {
              throw new Error(
                `Insert mismatch for ${locked.id}: inserted=${inserted.length} attempted=${insertCandidates.length} (ON CONFLICT swallowed rows)`
              );
            }
          }

          const finalCount = await tx.session.count({
            where: {
              weeklyScheduleId: locked.id,
              businessDate: { gte: utcDate(EFFECTIVE_FROM_NEW), lte: utcDate(generateToClamped) }
            }
          });
          if (finalCount !== expectedFridays) {
            throw new Error(`Session count mismatch for ${locked.id}: got ${finalCount} expected ${expectedFridays}`);
          }

          return {
            scheduleId: locked.id,
            label: `${locked.startTime}-${locked.endTime}`,
            expected: expectedFridays,
            inserted: inserted.length,
            skippedExisting: existing.length,
            finalCount
          };
        });
        generateResults.push(result);
        console.log(`GENERATE ok ${result.label} inserted=${result.inserted} final=${result.finalCount}/${result.expected}`);
      }
      report.generateResults = generateResults;
    }

    // Final validation snapshot
    const finalWeekly = await prisma.weeklySchedule.findMany({
      where: { classId: CLASS_ID, dayOfWeek: DAY_OF_WEEK },
      orderBy: [{ effectiveFrom: 'asc' }, { startTime: 'asc' }]
    });
    const finalNew = finalWeekly.filter((row) => dateKeyFromDbDate(row.effectiveFrom) === EFFECTIVE_FROM_NEW
      && NEW_SLOTS.some((slot) => slot.startTime === row.startTime && slot.endTime === row.endTime && slot.subjectId === row.subjectId));
    const finalClosed = finalWeekly.filter((row) => CLOSE_WS_IDS.includes(row.id as typeof CLOSE_WS_IDS[number]));
    const finalFikih = finalWeekly.find((row) => row.id === KEEP_FIKIH_WS_ID);
    const finalFrozen = await prisma.session.findMany({
      where: { classId: CLASS_ID, businessDate: utcDate(FROZEN_BUSINESS_DATE) },
      select: { id: true, status: true, weeklyScheduleId: true, subjectId: true, teacherId: true, startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' }
    });
    const finalFrozenFp = fingerprintRow(finalFrozen.map((row) => ({
      id: row.id,
      status: row.status,
      weeklyScheduleId: row.weeklyScheduleId,
      subjectId: row.subjectId,
      teacherId: row.teacherId,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString()
    })));

    const finalGates: Gate[] = [
      {
        name: 'final_four_new_ws',
        ok: finalNew.length === 4,
        detail: `count=${finalNew.length}`
      },
      {
        name: 'final_three_closed',
        ok: finalClosed.every((row) => row.effectiveTo && dateKeyFromDbDate(row.effectiveTo) === EFFECTIVE_TO_OLD),
        detail: finalClosed.map((row) => `${row.id}:${row.effectiveTo ? dateKeyFromDbDate(row.effectiveTo) : 'null'}`).join(',')
      },
      {
        name: 'final_fikih_unchanged',
        ok: Boolean(
          finalFikih
          && finalFikih.startTime === '13:50'
          && finalFikih.endTime === '15:10'
          && finalFikih.subjectId === SUBJECT.FIKIH
        ),
        detail: finalFikih ? `${finalFikih.startTime}-${finalFikih.endTime}` : 'missing'
      },
      {
        name: 'final_frozen_fingerprint',
        ok: finalFrozenFp === frozenFp,
        detail: `${finalFrozenFp} vs ${frozenFp}`
      }
    ];
    report.finalGates = finalGates;
    for (const gate of finalGates) {
      console.log(`${gate.ok ? 'PASS' : 'FAIL'} ${gate.name} — ${gate.detail}`);
    }
    writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
    if (finalGates.some((gate) => !gate.ok)) process.exit(1);
    console.log('DONE');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
