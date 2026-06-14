import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Role,
  SessionStatus,
  StudentAttendanceStatus,
  TeacherSessionStatus,
  type Prisma
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { businessDateKey, businessDayBounds, businessMonthBounds, businessMonthKey } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import type { AuthenticatedUser } from '../../common/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { writeAudit } from '../../common/audit-log';
import type { RequestMeta } from '../../common/request-meta';

const ATTENDANCE_STATUSES: StudentAttendanceStatus[] = [
  StudentAttendanceStatus.HADIR,
  StudentAttendanceStatus.TELAT,
  StudentAttendanceStatus.IZIN,
  StudentAttendanceStatus.SAKIT,
  StudentAttendanceStatus.ALPA
];

interface DateRange {
  from: Date;
  to: Date;
}

interface RecapFilters {
  from?: string;
  to?: string;
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  studentId?: string;
  month?: string;
}

interface MonthlyFilters {
  month?: string;
  teacherId?: string;
}

interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
  checksum: string;
}

function startOfDay(date: Date) {
  return businessDayBounds(date).start;
}

function endOfDay(date: Date) {
  return businessDayBounds(date).end;
}

function buildInitials(name: string) {
  return name
    .split(' ')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? '')
    .join('');
}

function summarizeDetails(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }

  const pairs = Object.entries(details as Record<string, unknown>)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return pairs.length > 0 ? pairs.join(' · ') : null;
}

function createAttendanceCounters(): Record<StudentAttendanceStatus, number> {
  return {
    HADIR: 0,
    TELAT: 0,
    IZIN: 0,
    SAKIT: 0,
    ALPA: 0
  };
}

function asPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function durationMinutes(start?: Date | null, end?: Date | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function safeDateInput(value: string, mode: 'start' | 'end') {
  try {
    const bounds = businessDayBounds(value);
    return mode === 'start' ? bounds.start : bounds.end;
  } catch {
    return null;
  }
}

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  private async getCached<T>(key: string): Promise<T | null> {
    return this.redis.getJson<T>(`schoolhub:cache:${key}`);
  }

  private async setCached(key: string, value: unknown, ttlSeconds: number) {
    await this.redis.setJson(`schoolhub:cache:${key}`, value, ttlSeconds);
  }

  private paginate<T>(items: T[], pagination: PaginationQuery) {
    const total = items.length;
    return {
      items: items.slice(pagination.skip, pagination.skip + pagination.limit),
      meta: buildPaginationMeta(total, pagination)
    };
  }

  private resolveDateRange(input: { from?: string; to?: string }, defaultDays = 30): DateRange {
    const now = new Date();
    const defaultFrom = businessDayBounds(new Date(now.getTime() - (defaultDays - 1) * 24 * 60 * 60 * 1000)).start;

    let from = input.from ? safeDateInput(input.from, 'start') : null;
    let to = input.to ? safeDateInput(input.to, 'end') : null;

    if (input.from && !from) {
      throw new BadRequestException('Parameter from tidak valid.');
    }
    if (input.to && !to) {
      throw new BadRequestException('Parameter to tidak valid.');
    }

    if (!from && !to) {
      from = defaultFrom;
      to = endOfDay(now);
    } else if (!from && to) {
      from = startOfDay(new Date(to.getTime() - (defaultDays - 1) * 24 * 60 * 60 * 1000));
    } else if (from && !to) {
      to = endOfDay(now);
    }

    if (!from || !to) {
      throw new BadRequestException('Rentang tanggal tidak valid.');
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('Parameter from harus <= to.');
    }

    return { from, to };
  }

  private resolveMonthRange(month?: string): DateRange & { monthLabel: string } {
    const monthLabel = month || businessMonthKey(new Date());
    if (!/^(\d{4})-(\d{2})$/.test(monthLabel)) {
      throw new BadRequestException('Parameter month harus format YYYY-MM.');
    }
    try {
      const { start, end, monthKey } = businessMonthBounds(monthLabel);
      return { from: start, to: end, monthLabel: monthKey };
    } catch {
      throw new BadRequestException('Nilai month tidak valid.');
    }
  }

  private buildSessionWhere(range: DateRange, filters: Pick<RecapFilters, 'classId' | 'subjectId' | 'teacherId'>): Prisma.SessionWhereInput {
    return {
      startsAt: {
        gte: range.from,
        lte: range.to
      },
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {})
    };
  }

  private toCsv(rows: Array<Record<string, unknown>>) {
    if (rows.length === 0) {
      return 'message\nTidak ada data\n';
    }

    const headers = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set<string>())
    );

    const escapeValue = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      const normalized = raw.replaceAll('"', '""');
      return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((header) => escapeValue(row[header])).join(','));
    }

    return `${lines.join('\n')}\n`;
  }

  async dashboard(date?: string) {
    let bounds: ReturnType<typeof businessDayBounds>;
    try {
      bounds = businessDayBounds(date || new Date());
    } catch {
      throw new BadRequestException('Parameter date tidak valid.');
    }
    const dayStart = bounds.start;
    const dayEnd = bounds.end;
    const cacheKey = `report-dashboard:${bounds.key}`;
    const cached = await this.getCached<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const [sessionsToday, closedSessions, openFlags, gateTapToday, teacherPresentToday] = await Promise.all([
      this.prisma.session.count({
        where: {
          startsAt: { gte: dayStart, lte: dayEnd }
        }
      }),
      this.prisma.session.count({
        where: {
          startsAt: { gte: dayStart, lte: dayEnd },
          status: SessionStatus.CLOSED
        }
      }),
      this.prisma.reconciliationFlag.count({
        where: {
          status: 'OPEN'
        }
      }),
      this.prisma.gateLog.count({
        where: {
          tappedAt: { gte: dayStart, lte: dayEnd }
        }
      }),
      this.prisma.teacherSessionPresence.count({
        where: {
          status: {
            in: ['HADIR', 'TELAT']
          },
          session: {
            startsAt: { gte: dayStart, lte: dayEnd }
          }
        }
      })
    ]);

    const coverage = sessionsToday === 0 ? 0 : Number(((closedSessions / sessionsToday) * 100).toFixed(2));

    const result = {
      date: dayStart.toISOString(),
      sessionsToday,
      closedSessions,
      attendanceCoveragePercent: coverage,
      anomalyOpenCount: openFlags,
      gateTapToday,
      teacherPresenceCount: teacherPresentToday
    };

    await this.setCached(cacheKey, result, date ? 60 : 10);
    return result;
  }

  async classMonthly(classId: string, month?: string) {
    const range = this.resolveMonthRange(month);

    const sessions = await this.prisma.session.findMany({
      where: {
        classId,
        startsAt: {
          gte: range.from,
          lte: range.to
        }
      },
      include: {
        attendances: true,
        schoolClass: true
      }
    });

    const counters = createAttendanceCounters();

    for (const session of sessions) {
      for (const item of session.attendances) {
        counters[item.status] += 1;
      }
    }

    return {
      classId,
      month: range.monthLabel,
      sessionCount: sessions.length,
      counters
    };
  }

  async trend(days: number) {
    const safeDays = Math.max(1, Math.min(days, 31));
    const cacheKey = `report-trend:${safeDays}`;
    const cached = await this.getCached<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const start = startOfDay(new Date(now.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000));
    const end = endOfDay(now);

    const [sessions, flags] = await Promise.all([
      this.prisma.session.findMany({
        where: {
          startsAt: {
            gte: start,
            lte: end
          }
        },
        select: {
          startsAt: true,
          status: true
        }
      }),
      this.prisma.reconciliationFlag.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end
          }
        },
        select: {
          createdAt: true
        }
      })
    ]);

    const series = new Map<string, { date: string; sessions: number; closed: number; anomalies: number }>();

    for (let idx = 0; idx < safeDays; idx += 1) {
      const day = new Date(start.getTime() + idx * 24 * 60 * 60 * 1000);
      const key = businessDateKey(day);
      series.set(key, {
        date: key,
        sessions: 0,
        closed: 0,
        anomalies: 0
      });
    }

    for (const session of sessions) {
      const key = businessDateKey(session.startsAt);
      const bucket = series.get(key);
      if (!bucket) continue;
      bucket.sessions += 1;
      if (session.status === SessionStatus.CLOSED) {
        bucket.closed += 1;
      }
    }

    for (const flag of flags) {
      const key = businessDateKey(flag.createdAt);
      const bucket = series.get(key);
      if (!bucket) continue;
      bucket.anomalies += 1;
    }

    const result = {
      days: safeDays,
      items: Array.from(series.values()).map((item) => ({
        ...item,
        coveragePercent: item.sessions === 0 ? 0 : Number(((item.closed / item.sessions) * 100).toFixed(2))
      }))
    };

    await this.setCached(cacheKey, result, 30);
    return result;
  }

  async liveMonitor(pagination: PaginationQuery) {
    const feedTake = Math.max(
      pagination.limit,
      Math.min(pagination.skip + pagination.limit + 200, 2000)
    );

    const [gateLogs, sessions, flags, gateCount, sessionsOpenedCount, sessionsClosedCount, flagsCount] =
      await Promise.all([
        this.prisma.gateLog.findMany({
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                role: true
              }
            }
          },
          orderBy: { tappedAt: 'desc' },
          take: feedTake
        }),
        this.prisma.session.findMany({
          where: {
            OR: [{ openedAt: { not: null } }, { closedAt: { not: null } }]
          },
          include: {
            schoolClass: { select: { code: true } },
            subject: { select: { name: true } },
            teacher: { select: { id: true, fullName: true, role: true } }
          },
          orderBy: { updatedAt: 'desc' },
          take: feedTake
        }),
        this.prisma.reconciliationFlag.findMany({
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                role: true
              }
            },
            session: {
              select: {
                id: true,
                schoolClass: { select: { code: true } },
                subject: { select: { name: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: feedTake
        }),
        this.prisma.gateLog.count(),
        this.prisma.session.count({ where: { openedAt: { not: null } } }),
        this.prisma.session.count({ where: { closedAt: { not: null } } }),
        this.prisma.reconciliationFlag.count()
      ]);

    const feed: Array<{
      id: string;
      type: string;
      timestamp: Date;
      title: string;
      subtitle: string;
      status: string;
      actorName: string;
      actorRole: string;
      actorInitials: string;
      method: string;
      result: string;
      location: string;
      context: string;
    }> = [];

    for (const item of gateLogs) {
      feed.push({
        id: `gate-${item.id}`,
        type: 'GATE_TAP',
        timestamp: item.tappedAt,
        title: `${item.user.fullName} tap gerbang`,
        subtitle: `${item.direction} · ${item.user.role}`,
        status: 'VALID',
        actorName: item.user.fullName,
        actorRole: item.user.role,
        actorInitials: buildInitials(item.user.fullName),
        method: 'SMART_CARD',
        result: `TAP_${item.direction}_VALID`,
        location: item.deviceId ?? 'Reader gerbang utama',
        context: 'Akses gerbang'
      });
    }

    for (const session of sessions) {
      if (session.openedAt) {
        feed.push({
          id: `session-open-${session.id}`,
          type: 'SESSION_OPENED',
          timestamp: session.openedAt,
          title: `Sesi dibuka ${session.schoolClass.code}`,
          subtitle: `${session.subject.name} · ${session.teacher.fullName}`,
          status: 'OPEN',
          actorName: session.teacher.fullName,
          actorRole: session.teacher.role,
          actorInitials: buildInitials(session.teacher.fullName),
          method: 'WEB_PORTAL',
          result: 'SESSION_OPENED',
          location: `Kelas ${session.schoolClass.code}`,
          context: `${session.schoolClass.code} · ${session.subject.name}`
        });
      }
      if (session.closedAt) {
        feed.push({
          id: `session-close-${session.id}`,
          type: 'SESSION_CLOSED',
          timestamp: session.closedAt,
          title: `Sesi ditutup ${session.schoolClass.code}`,
          subtitle: `${session.subject.name} · ${session.teacher.fullName}`,
          status: 'CLOSED',
          actorName: session.teacher.fullName,
          actorRole: session.teacher.role,
          actorInitials: buildInitials(session.teacher.fullName),
          method: 'WEB_PORTAL',
          result: 'SESSION_CLOSED',
          location: `Kelas ${session.schoolClass.code}`,
          context: `${session.schoolClass.code} · ${session.subject.name}`
        });
      }
    }

    for (const flag of flags) {
      const context = flag.session
        ? `${flag.session.schoolClass.code} · ${flag.session.subject.name}`
        : 'Tanpa konteks sesi';
      const detail = summarizeDetails(flag.details);
      feed.push({
        id: `flag-${flag.id}`,
        type: 'ANOMALY',
        timestamp: flag.createdAt,
        title: `Flag ${flag.type}`,
        subtitle: flag.user.fullName,
        status: flag.status,
        actorName: flag.user.fullName,
        actorRole: flag.user.role,
        actorInitials: buildInitials(flag.user.fullName),
        method: 'RECON_ENGINE',
        result: `FLAG_${flag.status}`,
        location: flag.session ? `Kelas ${flag.session.schoolClass.code}` : 'N/A',
        context: detail ? `${context} · ${detail}` : context
      });
    }

    const sorted = feed.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
    const items = sorted.slice(pagination.skip, pagination.skip + pagination.limit).map((item) => ({
      ...item,
      timestamp: item.timestamp.toISOString()
    }));

    const total = gateCount + sessionsOpenedCount + sessionsClosedCount + flagsCount;

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  async myAttendance(user: AuthenticatedUser, days: number) {
    const safeDays = Math.max(1, Math.min(days, 60));
    const now = new Date();
    const start = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);

    const gateLogs = await this.prisma.gateLog.findMany({
      where: {
        userId: user.sub,
        tappedAt: {
          gte: start,
          lte: now
        }
      },
      orderBy: { tappedAt: 'desc' },
      take: 300
    });

    if (user.role === Role.SISWA) {
      const attendances = await this.prisma.studentAttendance.findMany({
        where: {
          studentId: user.sub,
          session: {
            startsAt: {
              gte: start,
              lte: now
            }
          }
        },
        include: {
          session: {
            include: {
              schoolClass: { select: { code: true, name: true } },
              subject: { select: { code: true, name: true } },
              teacher: { select: { fullName: true } }
            }
          }
        },
        orderBy: {
          session: {
            startsAt: 'desc'
          }
        },
        take: 300
      });

      return {
        role: user.role,
        gateLogs,
        classAttendances: attendances
      };
    }

    const teacherPresence = await this.prisma.teacherSessionPresence.findMany({
      where: {
        teacherId: user.sub,
        session: {
          startsAt: {
            gte: start,
            lte: now
          }
        }
      },
      include: {
        session: {
          include: {
            schoolClass: { select: { code: true, name: true } },
            subject: { select: { code: true, name: true } }
          }
        }
      },
      orderBy: {
        session: {
          startsAt: 'desc'
        }
      },
      take: 300
    });

    return {
      role: user.role,
      gateLogs,
      teacherPresence
    };
  }

  async recapClasses(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const sessionWhere = this.buildSessionWhere(range, filters);

    const sessions = await this.prisma.session.findMany({
      where: sessionWhere,
      include: {
        schoolClass: { select: { id: true, code: true, name: true } },
        attendances: { select: { status: true } },
        teacher: { select: { id: true } },
        subject: { select: { id: true } }
      },
      orderBy: { startsAt: 'desc' }
    });

    const grouped = new Map<
      string,
      {
        classId: string;
        classCode: string;
        className: string;
        sessionCount: number;
        closedSessions: number;
        teacherIds: Set<string>;
        subjectIds: Set<string>;
        counters: Record<StudentAttendanceStatus, number>;
      }
    >();

    for (const session of sessions) {
      const current =
        grouped.get(session.classId) ??
        {
          classId: session.classId,
          classCode: session.schoolClass.code,
          className: session.schoolClass.name,
          sessionCount: 0,
          closedSessions: 0,
          teacherIds: new Set<string>(),
          subjectIds: new Set<string>(),
          counters: createAttendanceCounters()
        };

      current.sessionCount += 1;
      if (session.status === SessionStatus.CLOSED) {
        current.closedSessions += 1;
      }
      current.teacherIds.add(session.teacher.id);
      current.subjectIds.add(session.subject.id);
      for (const attendance of session.attendances) {
        current.counters[attendance.status] += 1;
      }

      grouped.set(session.classId, current);
    }

    const rows = Array.from(grouped.values())
      .map((item) => ({
        classId: item.classId,
        classCode: item.classCode,
        className: item.className,
        sessionCount: item.sessionCount,
        closedSessions: item.closedSessions,
        attendanceCoveragePercent: asPercent(item.closedSessions, item.sessionCount),
        uniqueTeacherCount: item.teacherIds.size,
        uniqueSubjectCount: item.subjectIds.size,
        counters: item.counters
      }))
      .sort((left, right) => left.classCode.localeCompare(right.classCode));

    const summary = {
      classCount: rows.length,
      sessionCount: rows.reduce((total, row) => total + row.sessionCount, 0),
      closedSessionCount: rows.reduce((total, row) => total + row.closedSessions, 0),
      attendanceRecords: rows.reduce(
        (total, row) =>
          total + ATTENDANCE_STATUSES.reduce((statusTotal, status) => statusTotal + row.counters[status], 0),
        0
      )
    };

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString()
      },
      summary,
      ...this.paginate(rows, pagination)
    };
  }

  async recapStudents(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const sessionWhere = this.buildSessionWhere(range, filters);

    const records = await this.prisma.studentAttendance.findMany({
      where: {
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        session: sessionWhere
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        },
        session: {
          select: {
            startsAt: true,
            schoolClass: { select: { code: true } },
            subject: { select: { code: true } }
          }
        }
      },
      orderBy: {
        session: {
          startsAt: 'desc'
        }
      }
    });

    const grouped = new Map<
      string,
      {
        studentId: string;
        fullName: string;
        username: string;
        counters: Record<StudentAttendanceStatus, number>;
        classCodes: Set<string>;
        subjectCodes: Set<string>;
        attendanceCount: number;
        latestAt: Date | null;
      }
    >();

    for (const record of records) {
      const current =
        grouped.get(record.studentId) ??
        {
          studentId: record.studentId,
          fullName: record.student.fullName,
          username: record.student.username,
          counters: createAttendanceCounters(),
          classCodes: new Set<string>(),
          subjectCodes: new Set<string>(),
          attendanceCount: 0,
          latestAt: null
        };

      current.attendanceCount += 1;
      current.counters[record.status] += 1;
      current.classCodes.add(record.session.schoolClass.code);
      current.subjectCodes.add(record.session.subject.code);
      if (!current.latestAt || record.session.startsAt.getTime() > current.latestAt.getTime()) {
        current.latestAt = record.session.startsAt;
      }

      grouped.set(record.studentId, current);
    }

    const rows = Array.from(grouped.values())
      .map((item) => {
        const presentCount = item.counters.HADIR + item.counters.TELAT;
        return {
          studentId: item.studentId,
          fullName: item.fullName,
          username: item.username,
          attendanceCount: item.attendanceCount,
          presentPercent: asPercent(presentCount, item.attendanceCount),
          classCodes: Array.from(item.classCodes).sort(),
          subjectCodes: Array.from(item.subjectCodes).sort(),
          latestAt: item.latestAt?.toISOString() ?? null,
          counters: item.counters
        };
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    const summary = {
      studentCount: rows.length,
      attendanceRecords: rows.reduce((total, row) => total + row.attendanceCount, 0)
    };

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString()
      },
      summary,
      ...this.paginate(rows, pagination)
    };
  }

  async recapSubjects(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const sessionWhere = this.buildSessionWhere(range, filters);

    const sessions = await this.prisma.session.findMany({
      where: sessionWhere,
      include: {
        subject: { select: { id: true, code: true, name: true } },
        schoolClass: { select: { code: true } },
        teacher: { select: { id: true } },
        attendances: { select: { status: true } }
      },
      orderBy: { startsAt: 'desc' }
    });

    const grouped = new Map<
      string,
      {
        subjectId: string;
        subjectCode: string;
        subjectName: string;
        sessionCount: number;
        closedSessions: number;
        classCodes: Set<string>;
        teacherIds: Set<string>;
        counters: Record<StudentAttendanceStatus, number>;
      }
    >();

    for (const session of sessions) {
      const current =
        grouped.get(session.subjectId) ??
        {
          subjectId: session.subjectId,
          subjectCode: session.subject.code,
          subjectName: session.subject.name,
          sessionCount: 0,
          closedSessions: 0,
          classCodes: new Set<string>(),
          teacherIds: new Set<string>(),
          counters: createAttendanceCounters()
        };

      current.sessionCount += 1;
      if (session.status === SessionStatus.CLOSED) {
        current.closedSessions += 1;
      }
      current.classCodes.add(session.schoolClass.code);
      current.teacherIds.add(session.teacher.id);

      for (const attendance of session.attendances) {
        current.counters[attendance.status] += 1;
      }

      grouped.set(session.subjectId, current);
    }

    const rows = Array.from(grouped.values())
      .map((item) => {
        const attendanceRecords = ATTENDANCE_STATUSES.reduce((total, status) => total + item.counters[status], 0);
        const presentRecords = item.counters.HADIR + item.counters.TELAT;

        return {
          subjectId: item.subjectId,
          subjectCode: item.subjectCode,
          subjectName: item.subjectName,
          sessionCount: item.sessionCount,
          closedSessions: item.closedSessions,
          attendanceCoveragePercent: asPercent(item.closedSessions, item.sessionCount),
          presencePercent: asPercent(presentRecords, attendanceRecords),
          classCount: item.classCodes.size,
          teacherCount: item.teacherIds.size,
          counters: item.counters
        };
      })
      .sort((left, right) => left.subjectCode.localeCompare(right.subjectCode));

    const summary = {
      subjectCount: rows.length,
      sessionCount: rows.reduce((total, row) => total + row.sessionCount, 0)
    };

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString()
      },
      summary,
      ...this.paginate(rows, pagination)
    };
  }

  async recapTeachers(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const sessionWhere = this.buildSessionWhere(range, filters);

    const sessions = await this.prisma.session.findMany({
      where: sessionWhere,
      include: {
        teacher: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        },
        schoolClass: {
          select: {
            code: true
          }
        },
        subject: {
          select: {
            code: true
          }
        },
        teacherPresence: {
          select: {
            teacherId: true,
            status: true,
            checkInAt: true,
            checkOutAt: true,
            earlyCheckoutReason: true
          }
        }
      },
      orderBy: { startsAt: 'desc' }
    });

    const grouped = new Map<
      string,
      {
        teacherId: string;
        fullName: string;
        username: string;
        sessionCount: number;
        closedSessionCount: number;
        classCodes: Set<string>;
        subjectCodes: Set<string>;
        hadir: number;
        telat: number;
        excusedAbsence: number;
        alpaMengajar: number;
        checkInCount: number;
        checkOutCount: number;
        earlyCheckoutCount: number;
        totalTeachingMinutes: number;
        lastCheckInAt: Date | null;
        lastCheckOutAt: Date | null;
      }
    >();

    for (const session of sessions) {
      const current =
        grouped.get(session.teacherId) ??
        {
          teacherId: session.teacherId,
          fullName: session.teacher.fullName,
          username: session.teacher.username,
          sessionCount: 0,
          closedSessionCount: 0,
          classCodes: new Set<string>(),
          subjectCodes: new Set<string>(),
          hadir: 0,
          telat: 0,
          excusedAbsence: 0,
          alpaMengajar: 0,
          checkInCount: 0,
          checkOutCount: 0,
          earlyCheckoutCount: 0,
          totalTeachingMinutes: 0,
          lastCheckInAt: null,
          lastCheckOutAt: null
        };

      current.sessionCount += 1;
      if (session.status === SessionStatus.CLOSED) {
        current.closedSessionCount += 1;
      }

      current.classCodes.add(session.schoolClass.code);
      current.subjectCodes.add(session.subject.code);

      const presenceRow = session.teacherPresence.find((item) => item.teacherId === session.teacherId) ?? null;
      const presence = presenceRow?.status ??
        (session.status === SessionStatus.MISSED ? TeacherSessionStatus.ALPA_MENGAJAR : null);

      if (presence === TeacherSessionStatus.HADIR) current.hadir += 1;
      if (presence === TeacherSessionStatus.TELAT) current.telat += 1;
      if (presence === TeacherSessionStatus.EXCUSED_ABSENCE) current.excusedAbsence += 1;
      if (presence === TeacherSessionStatus.ALPA_MENGAJAR) current.alpaMengajar += 1;
      if (presenceRow?.checkInAt) {
        current.checkInCount += 1;
        if (!current.lastCheckInAt || presenceRow.checkInAt > current.lastCheckInAt) current.lastCheckInAt = presenceRow.checkInAt;
      }
      if (presenceRow?.checkOutAt) {
        current.checkOutCount += 1;
        if (!current.lastCheckOutAt || presenceRow.checkOutAt > current.lastCheckOutAt) current.lastCheckOutAt = presenceRow.checkOutAt;
      }
      if (presenceRow?.earlyCheckoutReason) current.earlyCheckoutCount += 1;
      const minutes = durationMinutes(presenceRow?.checkInAt, presenceRow?.checkOutAt);
      if (minutes !== null) current.totalTeachingMinutes += minutes;

      grouped.set(session.teacherId, current);
    }

    const rows = Array.from(grouped.values())
      .map((item) => ({
        teacherId: item.teacherId,
        fullName: item.fullName,
        username: item.username,
        classCount: item.classCodes.size,
        subjectCount: item.subjectCodes.size,
        sessionCount: item.sessionCount,
        closedSessionCount: item.closedSessionCount,
        sessionCoveragePercent: asPercent(item.closedSessionCount, item.sessionCount),
        presencePercent: asPercent(item.hadir + item.telat, item.sessionCount),
        checkInCount: item.checkInCount,
        checkOutCount: item.checkOutCount,
        earlyCheckoutCount: item.earlyCheckoutCount,
        totalTeachingMinutes: item.totalTeachingMinutes,
        averageTeachingMinutes: item.checkOutCount === 0 ? 0 : Math.round(item.totalTeachingMinutes / item.checkOutCount),
        lastCheckInAt: item.lastCheckInAt,
        lastCheckOutAt: item.lastCheckOutAt,
        counters: {
          HADIR: item.hadir,
          TELAT: item.telat,
          EXCUSED_ABSENCE: item.excusedAbsence,
          ALPA_MENGAJAR: item.alpaMengajar
        }
      }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    const summary = {
      teacherCount: rows.length,
      sessionCount: rows.reduce((total, row) => total + row.sessionCount, 0),
      closedSessionCount: rows.reduce((total, row) => total + row.closedSessionCount, 0)
    };

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString()
      },
      summary,
      ...this.paginate(rows, pagination)
    };
  }

  async teacherMonthly(pagination: PaginationQuery, filters: MonthlyFilters) {
    const range = this.resolveMonthRange(filters.month);
    const sessionWhere: Prisma.SessionWhereInput = {
      startsAt: {
        gte: range.from,
        lte: range.to
      },
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {})
    };

    const sessions = await this.prisma.session.findMany({
      where: sessionWhere,
      include: {
        teacher: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        },
        teacherPresence: {
          select: {
            teacherId: true,
            status: true,
            checkInAt: true,
            checkOutAt: true,
            earlyCheckoutReason: true
          }
        }
      },
      orderBy: { startsAt: 'desc' }
    });

    const grouped = new Map<
      string,
      {
        teacherId: string;
        fullName: string;
        username: string;
        sessionCount: number;
        closedSessionCount: number;
        hadir: number;
        telat: number;
        excusedAbsence: number;
        alpaMengajar: number;
        checkInCount: number;
        checkOutCount: number;
        earlyCheckoutCount: number;
        totalTeachingMinutes: number;
        lastCheckInAt: Date | null;
        lastCheckOutAt: Date | null;
      }
    >();

    for (const session of sessions) {
      const current =
        grouped.get(session.teacherId) ??
        {
          teacherId: session.teacherId,
          fullName: session.teacher.fullName,
          username: session.teacher.username,
          sessionCount: 0,
          closedSessionCount: 0,
          hadir: 0,
          telat: 0,
          excusedAbsence: 0,
          alpaMengajar: 0,
          checkInCount: 0,
          checkOutCount: 0,
          earlyCheckoutCount: 0,
          totalTeachingMinutes: 0,
          lastCheckInAt: null,
          lastCheckOutAt: null
        };

      current.sessionCount += 1;
      if (session.status === SessionStatus.CLOSED) {
        current.closedSessionCount += 1;
      }

      const presenceRow = session.teacherPresence.find((item) => item.teacherId === session.teacherId) ?? null;
      const presence = presenceRow?.status ??
        (session.status === SessionStatus.MISSED ? TeacherSessionStatus.ALPA_MENGAJAR : null);

      if (presence === TeacherSessionStatus.HADIR) current.hadir += 1;
      if (presence === TeacherSessionStatus.TELAT) current.telat += 1;
      if (presence === TeacherSessionStatus.EXCUSED_ABSENCE) current.excusedAbsence += 1;
      if (presence === TeacherSessionStatus.ALPA_MENGAJAR) current.alpaMengajar += 1;
      if (presenceRow?.checkInAt) {
        current.checkInCount += 1;
        if (!current.lastCheckInAt || presenceRow.checkInAt > current.lastCheckInAt) current.lastCheckInAt = presenceRow.checkInAt;
      }
      if (presenceRow?.checkOutAt) {
        current.checkOutCount += 1;
        if (!current.lastCheckOutAt || presenceRow.checkOutAt > current.lastCheckOutAt) current.lastCheckOutAt = presenceRow.checkOutAt;
      }
      if (presenceRow?.earlyCheckoutReason) current.earlyCheckoutCount += 1;
      const minutes = durationMinutes(presenceRow?.checkInAt, presenceRow?.checkOutAt);
      if (minutes !== null) current.totalTeachingMinutes += minutes;

      grouped.set(session.teacherId, current);
    }

    const rows = Array.from(grouped.values())
      .map((item) => ({
        teacherId: item.teacherId,
        fullName: item.fullName,
        username: item.username,
        month: range.monthLabel,
        sessionCount: item.sessionCount,
        closedSessionCount: item.closedSessionCount,
        sessionCoveragePercent: asPercent(item.closedSessionCount, item.sessionCount),
        presencePercent: asPercent(item.hadir + item.telat, item.sessionCount),
        checkInCount: item.checkInCount,
        checkOutCount: item.checkOutCount,
        earlyCheckoutCount: item.earlyCheckoutCount,
        totalTeachingMinutes: item.totalTeachingMinutes,
        averageTeachingMinutes: item.checkOutCount === 0 ? 0 : Math.round(item.totalTeachingMinutes / item.checkOutCount),
        lastCheckInAt: item.lastCheckInAt,
        lastCheckOutAt: item.lastCheckOutAt,
        counters: {
          HADIR: item.hadir,
          TELAT: item.telat,
          EXCUSED_ABSENCE: item.excusedAbsence,
          ALPA_MENGAJAR: item.alpaMengajar
        }
      }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    const summary = {
      month: range.monthLabel,
      teacherCount: rows.length,
      sessionCount: rows.reduce((total, row) => total + row.sessionCount, 0),
      closedSessionCount: rows.reduce((total, row) => total + row.closedSessionCount, 0)
    };

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString()
      },
      summary,
      ...this.paginate(rows, pagination)
    };
  }

  async auditCoverage(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const sessionWhere = this.buildSessionWhere(range, filters);

    const sessions = await this.prisma.session.findMany({
      where: sessionWhere,
      include: {
        schoolClass: { select: { code: true } },
        subject: { select: { code: true, name: true } },
        teacher: { select: { fullName: true } }
      },
      orderBy: { startsAt: 'desc' }
    });

    const sessionIds = sessions.map((session) => session.id);

    const auditEntries =
      sessionIds.length === 0
        ? []
        : await this.prisma.auditEntry.findMany({
            where: {
              resource: 'session',
              resourceId: { in: sessionIds },
              action: {
                in: [
                  'class.session.opened',
                  'class.session.closed',
                  'class.attendance.recorded',
                  'class.attendance.corrected',
                  'reconciliation.session.processed'
                ]
              }
            },
            select: {
              action: true,
              resourceId: true
            }
          });

    const actionMap = new Map<string, Set<string>>();
    for (const audit of auditEntries) {
      const current = actionMap.get(audit.resourceId) ?? new Set<string>();
      current.add(audit.action);
      actionMap.set(audit.resourceId, current);
    }

    const rows = sessions.map((session) => {
      const recorded = actionMap.get(session.id) ?? new Set<string>();
      const expectedActions: string[] = [];

      if (session.openedAt) expectedActions.push('class.session.opened');
      if (session.closedAt) expectedActions.push('class.session.closed');
      if (session.reconciledAt) expectedActions.push('reconciliation.session.processed');

      const fulfilled = expectedActions.filter((action) => recorded.has(action)).length;
      const missingActions = expectedActions.filter((action) => !recorded.has(action));
      const coveragePercent = expectedActions.length === 0 ? 100 : asPercent(fulfilled, expectedActions.length);

      return {
        sessionId: session.id,
        classCode: session.schoolClass.code,
        subjectCode: session.subject.code,
        subjectName: session.subject.name,
        teacherName: session.teacher.fullName,
        status: session.status,
        startsAt: session.startsAt.toISOString(),
        expectedActions,
        recordedActions: Array.from(recorded.values()).sort(),
        missingActions,
        coveragePercent
      };
    });

    const summary = {
      sessionCount: rows.length,
      fullyCoveredCount: rows.filter((row) => row.coveragePercent >= 100).length,
      averageCoveragePercent:
        rows.length === 0
          ? 100
          : Number((rows.reduce((total, row) => total + row.coveragePercent, 0) / rows.length).toFixed(2)),
      missingActionCount: rows.reduce((total, row) => total + row.missingActions.length, 0)
    };

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString()
      },
      summary,
      ...this.paginate(rows, pagination)
    };
  }

  async exportReport(reportType: string, format: string, filters: RecapFilters, actor?: { sub: string; role: Role }, requestMeta?: RequestMeta): Promise<ExportResult> {
    const normalizedType = reportType.trim().toLowerCase();
    const normalizedFormat = format.trim().toLowerCase();

    const supportedTypes = new Set([
      'recap_classes',
      'recap_students',
      'recap_subjects',
      'recap_teachers',
      'teacher_monthly',
      'audit_coverage'
    ]);

    if (!supportedTypes.has(normalizedType)) {
      throw new BadRequestException('reportType tidak didukung.');
    }

    if (normalizedFormat !== 'csv' && normalizedFormat !== 'xlsx') {
      throw new BadRequestException('format harus csv atau xlsx.');
    }

    const exportPagination: PaginationQuery = {
      page: 1,
      limit: 5000,
      skip: 0
    };

    let rows: Array<Record<string, unknown>> = [];

    if (normalizedType === 'recap_classes') {
      const data = await this.recapClasses(exportPagination, filters);
      rows = data.items.map((item) => ({
        class_id: item.classId,
        class_code: item.classCode,
        class_name: item.className,
        session_count: item.sessionCount,
        closed_session_count: item.closedSessions,
        coverage_percent: item.attendanceCoveragePercent,
        teacher_count: item.uniqueTeacherCount,
        subject_count: item.uniqueSubjectCount,
        hadir: item.counters.HADIR,
        telat: item.counters.TELAT,
        izin: item.counters.IZIN,
        sakit: item.counters.SAKIT,
        alpa: item.counters.ALPA
      }));
    }

    if (normalizedType === 'recap_students') {
      const data = await this.recapStudents(exportPagination, filters);
      rows = data.items.map((item) => ({
        student_id: item.studentId,
        full_name: item.fullName,
        username: item.username,
        attendance_count: item.attendanceCount,
        present_percent: item.presentPercent,
        class_codes: item.classCodes.join(' | '),
        subject_codes: item.subjectCodes.join(' | '),
        latest_at: item.latestAt,
        hadir: item.counters.HADIR,
        telat: item.counters.TELAT,
        izin: item.counters.IZIN,
        sakit: item.counters.SAKIT,
        alpa: item.counters.ALPA
      }));
    }

    if (normalizedType === 'recap_subjects') {
      const data = await this.recapSubjects(exportPagination, filters);
      rows = data.items.map((item) => ({
        subject_id: item.subjectId,
        subject_code: item.subjectCode,
        subject_name: item.subjectName,
        session_count: item.sessionCount,
        closed_session_count: item.closedSessions,
        attendance_coverage_percent: item.attendanceCoveragePercent,
        presence_percent: item.presencePercent,
        class_count: item.classCount,
        teacher_count: item.teacherCount,
        hadir: item.counters.HADIR,
        telat: item.counters.TELAT,
        izin: item.counters.IZIN,
        sakit: item.counters.SAKIT,
        alpa: item.counters.ALPA
      }));
    }

    if (normalizedType === 'recap_teachers') {
      const data = await this.recapTeachers(exportPagination, filters);
      rows = data.items.map((item) => ({
        teacher_id: item.teacherId,
        full_name: item.fullName,
        username: item.username,
        class_count: item.classCount,
        subject_count: item.subjectCount,
        session_count: item.sessionCount,
        closed_session_count: item.closedSessionCount,
        session_coverage_percent: item.sessionCoveragePercent,
        presence_percent: item.presencePercent,
        hadir: item.counters.HADIR,
        telat: item.counters.TELAT,
        excused_absence: item.counters.EXCUSED_ABSENCE,
        alpa_mengajar: item.counters.ALPA_MENGAJAR
      }));
    }

    if (normalizedType === 'teacher_monthly') {
      const data = await this.teacherMonthly(exportPagination, { month: filters.month, teacherId: filters.teacherId });
      rows = data.items.map((item) => ({
        teacher_id: item.teacherId,
        full_name: item.fullName,
        username: item.username,
        month: item.month,
        session_count: item.sessionCount,
        closed_session_count: item.closedSessionCount,
        session_coverage_percent: item.sessionCoveragePercent,
        presence_percent: item.presencePercent,
        hadir: item.counters.HADIR,
        telat: item.counters.TELAT,
        excused_absence: item.counters.EXCUSED_ABSENCE,
        alpa_mengajar: item.counters.ALPA_MENGAJAR
      }));
    }

    if (normalizedType === 'audit_coverage') {
      const data = await this.auditCoverage(exportPagination, filters);
      rows = data.items.map((item) => ({
        session_id: item.sessionId,
        class_code: item.classCode,
        subject_code: item.subjectCode,
        subject_name: item.subjectName,
        teacher_name: item.teacherName,
        status: item.status,
        starts_at: item.startsAt,
        coverage_percent: item.coveragePercent,
        expected_actions: item.expectedActions.join(' | '),
        recorded_actions: item.recordedActions.join(' | '),
        missing_actions: item.missingActions.join(' | ')
      }));
    }

    const rangeForMeta = filters.month ? this.resolveMonthRange(filters.month) : this.resolveDateRange(filters);
    const [openAnomalyCount, resolvedAnomalyCount, overrideCount, correctionCount] = await Promise.all([
      this.prisma.reconciliationFlag.count({ where: { status: 'OPEN', createdAt: { gte: rangeForMeta.from, lte: rangeForMeta.to } } }),
      this.prisma.reconciliationFlag.count({ where: { status: 'RESOLVED', createdAt: { gte: rangeForMeta.from, lte: rangeForMeta.to } } }),
      this.prisma.attendanceOverride.count({ where: { date: { gte: rangeForMeta.from, lte: rangeForMeta.to } } }),
      this.prisma.attendanceCorrectionEvent.count({ where: { createdAt: { gte: rangeForMeta.from, lte: rangeForMeta.to } } })
    ]);
    const metadata = {
      generatedAt: new Date().toISOString(),
      generatedBy: actor?.sub ?? 'unknown',
      reportType: normalizedType,
      format: normalizedFormat,
      filters,
      warning: openAnomalyCount > 0 ? 'Periode ini masih memiliki anomali OPEN. Laporan belum final tanpa verifikasi.' : null,
      counts: { overrideCount, openAnomalyCount, resolvedAnomalyCount, correctionCount }
    };
    rows = [{ report_metadata: JSON.stringify(metadata) }, ...rows.map((row) => ({ evidence_label: 'normal', ...row }))];

    const timestamp = new Date().toISOString().replaceAll(':', '-').replace('T', '_').slice(0, 19);
    const filename = `${normalizedType}_${timestamp}.${normalizedFormat}`;

    if (normalizedFormat === 'csv') {
      const csvText = this.toCsv(rows);
      const buffer = Buffer.from(csvText, 'utf-8');
      const checksum = createHash('sha256').update(buffer).digest('hex');
      if (actor) await writeAudit(this.prisma, {
        actorId: actor.sub,
        actorRole: actor.role,
        module: 'reporting',
        action: 'report.exported',
        resource: 'report',
        resourceId: normalizedType,
        requestIp: requestMeta?.requestIp ?? null,
        requestDevice: requestMeta?.requestDevice ?? null,
        after: { ...metadata, checksum, filename } as unknown as Prisma.InputJsonValue
      });
      return { buffer, contentType: 'text/csv; charset=utf-8', filename, checksum };
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SchoolHub e-Hadir';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('report');
    const exportRows = rows.length > 0 ? rows : [{ message: 'Tidak ada data' }];
    const columns = Array.from(new Set(exportRows.flatMap((row) => Object.keys(row))));

    worksheet.columns = columns.map((key) => ({
      header: key,
      key,
      width: Math.min(Math.max(key.length + 4, 14), 40)
    }));

    for (const row of exportRows) {
      worksheet.addRow(
        Object.fromEntries(
          columns.map((key) => {
            const value = row[key];
            if (value === null || value === undefined) return [key, ''];
            if (value instanceof Date) return [key, value.toISOString()];
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [key, value];
            return [key, JSON.stringify(value)];
          })
        )
      );
    }

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const raw = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(raw);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    if (actor) await writeAudit(this.prisma, {
      actorId: actor.sub,
      actorRole: actor.role,
      module: 'reporting',
      action: 'report.exported',
      resource: 'report',
      resourceId: normalizedType,
      requestIp: requestMeta?.requestIp ?? null,
      requestDevice: requestMeta?.requestDevice ?? null,
      after: { ...metadata, checksum, filename } as unknown as Prisma.InputJsonValue
    });

    return {
      buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename,
      checksum
    };
  }
}
