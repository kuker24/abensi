import { ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceReviewState, Prisma, Role, SessionRosterState, SessionStatus } from '@prisma/client';
import { businessDateKey, jakartaBusinessDayBounds } from '../../common/business-time';
import type { AuthenticatedUser } from '../../common/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

type TeacherSessionRow = Prisma.SessionGetPayload<{
  select: {
    id: true;
    weeklyScheduleId: true;
    classId: true;
    subjectId: true;
    startsAt: true;
    endsAt: true;
    status: true;
    rosterState: true;
    schoolClass: { select: { id: true; code: true; name: true } };
    subject: { select: { id: true; code: true; name: true } };
    rosters: { select: { studentId: true } };
    attendances: { select: { studentId: true; status: true; reviewState: true } };
  };
}>;

function localTime(value: Date) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(value).replace('.', ':');
}

function createSummary() {
  return {
    sessionsToday: 0,
    scheduled: 0,
    open: 0,
    closed: 0,
    missed: 0,
    unclosed: 0,
    studentsPendingAttendance: 0,
    unknownRosterSessions: 0,
    backfilledRosterSessions: 0
  };
}

@Injectable()
export class TeacherService {
  constructor(private readonly prisma: PrismaService) {}

  async today(actor: AuthenticatedUser, date?: string) {
    if (actor.role !== Role.GURU_MAPEL) {
      throw new ForbiddenException('Workspace ini hanya untuk Guru Mapel.');
    }

    const bounds = jakartaBusinessDayBounds(date ?? new Date());
    const sessions = await this.prisma.session.findMany({
      where: {
        teacherId: actor.sub,
        startsAt: { gte: bounds.start, lte: bounds.end }
      },
      select: {
        id: true,
        weeklyScheduleId: true,
        classId: true,
        subjectId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        rosterState: true,
        schoolClass: { select: { id: true, code: true, name: true } },
        subject: { select: { id: true, code: true, name: true } },
        rosters: { select: { studentId: true } },
        attendances: { select: { studentId: true, status: true, reviewState: true } }
      },
      orderBy: { startsAt: 'asc' }
    });

    const enrollmentCountByClass = await this.activeEnrollmentCounts(sessions, bounds.date);
    const items = sessions.map((session) => this.toTodayItem(session, enrollmentCountByClass.get(session.classId)));
    const summary = items.reduce((acc, item) => {
      acc.sessionsToday += 1;
      if (item.status === SessionStatus.SCHEDULED) acc.scheduled += 1;
      if (item.status === SessionStatus.OPEN) acc.open += 1;
      if (item.status === SessionStatus.CLOSED) acc.closed += 1;
      if (item.status === SessionStatus.MISSED) acc.missed += 1;
      if (item.status === SessionStatus.OPEN || item.status === SessionStatus.MISSED) acc.unclosed += 1;
      if (item.pendingCount !== null) acc.studentsPendingAttendance += item.pendingCount;
      if (item.rosterState === SessionRosterState.BACKFILLED_UNVERIFIED) acc.backfilledRosterSessions += 1;
      if (
        item.rosterState === SessionRosterState.LEGACY_ROSTER_MISSING ||
        (item.rosterState === SessionRosterState.PENDING && item.status !== SessionStatus.SCHEDULED)
      ) {
        acc.unknownRosterSessions += 1;
      }
      return acc;
    }, createSummary());

    return {
      date: bounds.key,
      summary,
      items
    };
  }

  private async activeEnrollmentCounts(sessions: TeacherSessionRow[], businessDate: Date) {
    const classIds = Array.from(
      new Set(
        sessions
          .filter(
            (session) =>
              session.status === SessionStatus.SCHEDULED &&
              session.rosterState === SessionRosterState.PENDING &&
              session.rosters.length === 0
          )
          .map((session) => session.classId)
      )
    );
    if (!classIds.length) return new Map<string, number>();

    const rows = await this.prisma.classEnrollment.groupBy({
      by: ['classId'],
      where: {
        classId: { in: classIds },
        active: true,
        administrativeStatus: 'ACTIVE',
        effectiveFrom: { lte: businessDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: businessDate } }],
        student: { active: true, role: Role.SISWA }
      },
      _count: { _all: true }
    });

    return new Map(rows.map((row) => [row.classId, row._count._all]));
  }

  private toTodayItem(session: TeacherSessionRow, prospectiveStudentTotal?: number) {
    const attendanceFilledCount = session.attendances.filter((item) => item.reviewState !== AttendanceReviewState.DEFAULTED).length;
    const usableRoster =
      session.rosterState === SessionRosterState.VERIFIED ||
      session.rosterState === SessionRosterState.BACKFILLED_UNVERIFIED;
    const studentTotal = usableRoster
      ? session.rosters.length
      : session.status === SessionStatus.SCHEDULED && session.rosterState === SessionRosterState.PENDING
        ? prospectiveStudentTotal ?? null
        : null;
    const pendingCount = studentTotal === null ? null : Math.max(0, studentTotal - attendanceFilledCount);

    return {
      sessionId: session.id,
      scheduleId: session.weeklyScheduleId,
      classId: session.schoolClass.id,
      className: session.schoolClass.code || session.schoolClass.name,
      subjectId: session.subject.id,
      subjectName: session.subject.name,
      date: businessDateKey(session.startsAt),
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      startTime: localTime(session.startsAt),
      endTime: localTime(session.endsAt),
      status: session.status,
      rosterState: session.rosterState,
      rosterVerified: session.rosterState === SessionRosterState.VERIFIED,
      rosterUnverified:
        session.rosterState === SessionRosterState.BACKFILLED_UNVERIFIED ||
        session.rosterState === SessionRosterState.LEGACY_ROSTER_MISSING,
      attendanceFilledCount,
      studentTotal,
      pendingCount,
      actions: {
        canStart: session.status === SessionStatus.SCHEDULED,
        canContinue: session.status === SessionStatus.OPEN,
        canClose: session.status === SessionStatus.OPEN,
        canViewRecap: session.status === SessionStatus.CLOSED || attendanceFilledCount > 0
      }
    };
  }
}
