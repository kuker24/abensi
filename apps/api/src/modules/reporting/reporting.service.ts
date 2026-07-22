import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DeviceReaderStatus,
  GateDirection,
  PrayerType,
  ReaderType,
  Role,
  SessionRosterState,
  SessionStatus,
  StudentAttendanceStatus,
  TeacherSessionStatus,
  AttendanceReviewState,
  type Prisma
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addCalendarDays, businessDateKey, businessDayBounds, businessMonthBounds, businessMonthKey, localMinutesOfDay } from '../../common/business-time';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import type { AuthenticatedUser } from '../../common/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { writeAudit } from '../../common/audit-log';
import type { RequestMeta } from '../../common/request-meta';
import {
  columnsFromRows,
  renderReportDocument,
  printDocumentRowLimitViolation,
  REPORT_TYPE_TITLES,
  type ExportFormat,
  type ReportDocumentModel
} from './report-document-exporter';

const ATTENDANCE_STATUSES: StudentAttendanceStatus[] = [
  StudentAttendanceStatus.HADIR,
  StudentAttendanceStatus.TELAT,
  StudentAttendanceStatus.IZIN,
  StudentAttendanceStatus.SAKIT,
  StudentAttendanceStatus.ALPA
];

const SCHOOL_PERSONNEL_GATE_ROLES: Role[] = [
  Role.ADMIN_TU,
  Role.KEPALA_SEKOLAH,
  Role.GURU_MAPEL,
  Role.GURU_PIKET,
  Role.OPERATOR_IT,
  Role.DEVELOPER
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
  status?: string;
  missingRequirement?: string;
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

interface RosterProvenanceCounters {
  verifiedSessionCount: number;
  backfilledUnverifiedSessionCount: number;
  legacyRosterMissingSessionCount: number;
  pendingRosterSessionCount: number;
}

function createRosterProvenanceCounters(): RosterProvenanceCounters {
  return {
    verifiedSessionCount: 0,
    backfilledUnverifiedSessionCount: 0,
    legacyRosterMissingSessionCount: 0,
    pendingRosterSessionCount: 0
  };
}

function addRosterProvenance(counters: RosterProvenanceCounters, rosterState: SessionRosterState) {
  if (rosterState === SessionRosterState.VERIFIED) counters.verifiedSessionCount += 1;
  if (rosterState === SessionRosterState.BACKFILLED_UNVERIFIED) counters.backfilledUnverifiedSessionCount += 1;
  if (rosterState === SessionRosterState.LEGACY_ROSTER_MISSING) counters.legacyRosterMissingSessionCount += 1;
  if (rosterState === SessionRosterState.PENDING) counters.pendingRosterSessionCount += 1;
}

function rosterTrustFlags(rosterState: SessionRosterState) {
  return {
    rosterState,
    rosterVerified: rosterState === SessionRosterState.VERIFIED,
    rosterUnverified:
      rosterState === SessionRosterState.BACKFILLED_UNVERIFIED ||
      rosterState === SessionRosterState.LEGACY_ROSTER_MISSING
  };
}

function summarizeRosterProvenance(rows: RosterProvenanceCounters[]): RosterProvenanceCounters {
  return rows.reduce((summary, row) => ({
    verifiedSessionCount: summary.verifiedSessionCount + row.verifiedSessionCount,
    backfilledUnverifiedSessionCount: summary.backfilledUnverifiedSessionCount + row.backfilledUnverifiedSessionCount,
    legacyRosterMissingSessionCount: summary.legacyRosterMissingSessionCount + row.legacyRosterMissingSessionCount,
    pendingRosterSessionCount: summary.pendingRosterSessionCount + row.pendingRosterSessionCount
  }), createRosterProvenanceCounters());
}

const STUDENT_DAILY_STATUS_LABELS = {
  HADIR_LENGKAP: 'Hadir lengkap',
  BELUM_SCAN_DATANG: 'Belum scan datang',
  BELUM_SCAN_PULANG: 'Belum scan pulang',
  BELUM_ABSEN_KELAS: 'Belum diabsen guru',
  BELUM_SCAN_SHOLAT: 'Belum scan sholat',
  PERLU_VERIFIKASI: 'Perlu verifikasi'
} as const;

type StudentDailyFinalStatus = keyof typeof STUDENT_DAILY_STATUS_LABELS;
type StudentDailyMissingRequirement = Exclude<StudentDailyFinalStatus, 'HADIR_LENGKAP'>;

const STUDENT_DAILY_MISSING_LABELS: Record<StudentDailyMissingRequirement, string> = {
  BELUM_SCAN_DATANG: 'Belum scan datang',
  BELUM_SCAN_PULANG: 'Belum scan pulang',
  BELUM_ABSEN_KELAS: 'Belum diabsen guru',
  BELUM_SCAN_SHOLAT: 'Belum scan sholat',
  PERLU_VERIFIKASI: 'Perlu verifikasi'
};

const STUDENT_DAILY_STATUS_ORDER: StudentDailyMissingRequirement[] = [
  'BELUM_SCAN_DATANG',
  'BELUM_SCAN_PULANG',
  'BELUM_ABSEN_KELAS',
  'BELUM_SCAN_SHOLAT',
  'PERLU_VERIFIKASI'
];

const PRAYER_ORDER: PrayerType[] = [PrayerType.DHUHA, PrayerType.DZUHUR, PrayerType.ASHAR];

function studentDailyStatusLabel(status: StudentDailyFinalStatus | string | null | undefined) {
  return STUDENT_DAILY_STATUS_LABELS[status as StudentDailyFinalStatus] ?? String(status || 'Perlu verifikasi');
}

function parseLocalTimeMinutes(value: string | null | undefined, fallback: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
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

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Jakarta'
});

const REPORT_MONTH_FORMATTER = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

function formatReportDate(date: Date) {
  return REPORT_DATE_FORMATTER.format(date);
}

function formatReportMonth(monthLabel: string) {
  const [year, month] = monthLabel.split('-').map((value) => Number(value));
  if (!year || !month) return monthLabel;
  return REPORT_MONTH_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatReportRangeLabel(range: DateRange) {
  const fromLabel = formatReportDate(range.from);
  const toLabel = formatReportDate(range.to);
  return fromLabel === toLabel ? fromLabel : `${fromLabel} sampai ${toLabel}`;
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

    const [sessionsToday, closedSessions, openSessions, openFlags, gateTapToday, staffPresentToday, teacherPresentToday, prayerDhuhaToday, prayerDzuhurToday, activeAndroidReaders, studentCompleteness] = await Promise.all([
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
      this.prisma.session.count({
        where: {
          startsAt: { gte: dayStart, lte: dayEnd },
          status: SessionStatus.OPEN
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
      this.prisma.gateLog.count({
        where: {
          direction: GateDirection.IN,
          tappedAt: { gte: dayStart, lte: dayEnd },
          user: { role: { in: SCHOOL_PERSONNEL_GATE_ROLES }, active: true }
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
      }),
      this.prisma.prayerAttendanceLog.count({ where: { attendanceDate: businessDayBounds(dayStart).date, prayerType: PrayerType.DHUHA } }),
      this.prisma.prayerAttendanceLog.count({ where: { attendanceDate: businessDayBounds(dayStart).date, prayerType: PrayerType.DZUHUR } }),
      this.prisma.deviceReader.findMany({
        where: { type: ReaderType.QR_ANDROID, status: DeviceReaderStatus.ACTIVE },
        select: { id: true, name: true, locationName: true, locationLabel: true, allowedModes: true, lastSeenAt: true, lastSignedScanAt: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 10
      }),
      this.studentDailyCompleteness({ page: 1, limit: 1, skip: 0 }, { from: bounds.key, to: bounds.key })
    ]);

    const coverage = sessionsToday === 0 ? 0 : Number(((closedSessions / sessionsToday) * 100).toFixed(2));

    const findReader = (mode: 'gate' | 'mushola') => activeAndroidReaders.find((reader) => {
      const modes = (reader.allowedModes ?? []).map(String);
      return mode === 'gate'
        ? modes.includes('GERBANG') || modes.includes('GATE_IN') || modes.includes('GATE_OUT')
        : modes.includes('MUSHOLA');
    }) ?? null;
    const readerPayload = (reader: typeof activeAndroidReaders[number] | null) => {
      if (!reader) return null;
      const lastSeenAt = reader.lastSignedScanAt || reader.lastSeenAt;
      const online = lastSeenAt ? Date.now() - lastSeenAt.getTime() <= 5 * 60_000 : false;
      return {
        id: reader.id,
        name: reader.name,
        location: reader.locationName || reader.locationLabel || null,
        status: reader.status,
        online,
        lastSeenAt,
        allowedModes: reader.allowedModes
      };
    };

    const result = {
      date: dayStart.toISOString(),
      sessionsToday,
      closedSessions,
      openSessions,
      unclosedSessions: openSessions,
      attendanceCoveragePercent: coverage,
      anomalyOpenCount: openFlags,
      openFlags,
      gateTapToday,
      gateLogsToday: gateTapToday,
      staffPresentToday,
      teacherPresenceCount: teacherPresentToday,
      teacherTeachingToday: teacherPresentToday,
      prayerDhuhaToday,
      prayerDzuhurToday,
      androidReaders: {
        activeCount: activeAndroidReaders.length,
        maxActive: 2,
        gate: readerPayload(findReader('gate')),
        mushola: readerPayload(findReader('mushola'))
      },
      studentCompleteness: studentCompleteness.summary,
      studentCompleteCount: studentCompleteness.summary.completeCount,
      studentMissingArrivalCount: studentCompleteness.summary.missingArrivalCount,
      studentMissingDepartureCount: studentCompleteness.summary.missingDepartureCount,
      studentMissingClassAttendanceCount: studentCompleteness.summary.missingClassAttendanceCount,
      studentMissingPrayerCount: studentCompleteness.summary.missingPrayerCount,
      studentNeedsVerificationCount: studentCompleteness.summary.needsVerificationCount
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
        classAttendances: attendances.map((attendance) => ({
          ...attendance,
          ...rosterTrustFlags(attendance.session.rosterState)
        }))
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
      teacherPresence: teacherPresence.map((presence) => ({
        ...presence,
        ...rosterTrustFlags(presence.session.rosterState)
      }))
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
        rosterProvenance: RosterProvenanceCounters;
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
          counters: createAttendanceCounters(),
          rosterProvenance: createRosterProvenanceCounters()
        };

      current.sessionCount += 1;
      if (session.status === SessionStatus.CLOSED) {
        current.closedSessions += 1;
      }
      current.teacherIds.add(session.teacher.id);
      current.subjectIds.add(session.subject.id);
      addRosterProvenance(current.rosterProvenance, session.rosterState);
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
        counters: item.counters,
        ...item.rosterProvenance
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
      ),
      ...summarizeRosterProvenance(rows)
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
            id: true,
            startsAt: true,
            rosterState: true,
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
        rosterStateBySession: Map<string, SessionRosterState>;
      }
    >();
    const rosterStateBySession = new Map<string, SessionRosterState>();

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
          latestAt: null,
          rosterStateBySession: new Map<string, SessionRosterState>()
        };

      current.attendanceCount += 1;
      current.counters[record.status] += 1;
      current.classCodes.add(record.session.schoolClass.code);
      current.subjectCodes.add(record.session.subject.code);
      current.rosterStateBySession.set(record.session.id, record.session.rosterState);
      rosterStateBySession.set(record.session.id, record.session.rosterState);
      if (!current.latestAt || record.session.startsAt.getTime() > current.latestAt.getTime()) {
        current.latestAt = record.session.startsAt;
      }

      grouped.set(record.studentId, current);
    }

    const rows = Array.from(grouped.values())
      .map((item) => {
        const presentCount = item.counters.HADIR + item.counters.TELAT;
        const rosterProvenance = createRosterProvenanceCounters();
        for (const rosterState of item.rosterStateBySession.values()) {
          addRosterProvenance(rosterProvenance, rosterState);
        }
        return {
          studentId: item.studentId,
          fullName: item.fullName,
          username: item.username,
          attendanceCount: item.attendanceCount,
          presentPercent: asPercent(presentCount, item.attendanceCount),
          classCodes: Array.from(item.classCodes).sort(),
          subjectCodes: Array.from(item.subjectCodes).sort(),
          latestAt: item.latestAt?.toISOString() ?? null,
          counters: item.counters,
          ...rosterProvenance
        };
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    const summaryRosterProvenance = createRosterProvenanceCounters();
    for (const rosterState of rosterStateBySession.values()) {
      addRosterProvenance(summaryRosterProvenance, rosterState);
    }

    const summary = {
      studentCount: rows.length,
      attendanceRecords: rows.reduce((total, row) => total + row.attendanceCount, 0),
      ...summaryRosterProvenance
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
        rosterProvenance: RosterProvenanceCounters;
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
          counters: createAttendanceCounters(),
          rosterProvenance: createRosterProvenanceCounters()
        };

      current.sessionCount += 1;
      if (session.status === SessionStatus.CLOSED) {
        current.closedSessions += 1;
      }
      current.classCodes.add(session.schoolClass.code);
      current.teacherIds.add(session.teacher.id);
      addRosterProvenance(current.rosterProvenance, session.rosterState);

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
          counters: item.counters,
          ...item.rosterProvenance
        };
      })
      .sort((left, right) => left.subjectCode.localeCompare(right.subjectCode));

    const summary = {
      subjectCount: rows.length,
      sessionCount: rows.reduce((total, row) => total + row.sessionCount, 0),
      ...summarizeRosterProvenance(rows)
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
        rosterProvenance: RosterProvenanceCounters;
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
          lastCheckOutAt: null,
          rosterProvenance: createRosterProvenanceCounters()
        };

      current.sessionCount += 1;
      if (session.status === SessionStatus.CLOSED) {
        current.closedSessionCount += 1;
      }

      current.classCodes.add(session.schoolClass.code);
      current.subjectCodes.add(session.subject.code);
      addRosterProvenance(current.rosterProvenance, session.rosterState);

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
        },
        ...item.rosterProvenance
      }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    const summary = {
      teacherCount: rows.length,
      sessionCount: rows.reduce((total, row) => total + row.sessionCount, 0),
      closedSessionCount: rows.reduce((total, row) => total + row.closedSessionCount, 0),
      ...summarizeRosterProvenance(rows)
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

  async staffGateAttendance(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const logs = await this.prisma.gateLog.findMany({
      where: {
        tappedAt: { gte: range.from, lte: range.to },
        user: { role: { in: SCHOOL_PERSONNEL_GATE_ROLES }, active: true }
      },
      include: {
        user: { select: { id: true, fullName: true, username: true, role: true } }
      },
      orderBy: [{ businessDate: 'asc' }, { user: { fullName: 'asc' } }, { tappedAt: 'asc' }]
    });

    const grouped = new Map<string, { userId: string; fullName: string; username: string; role: Role; date: string; datang: Date | null; pulang: Date | null }>();
    for (const log of logs) {
      const date = businessDateKey(log.businessDate ?? log.tappedAt);
      const key = `${log.userId}:${date}`;
      const current = grouped.get(key) ?? { userId: log.userId, fullName: log.user.fullName, username: log.user.username, role: log.user.role, date, datang: null, pulang: null };
      if (log.direction === GateDirection.IN && (!current.datang || log.tappedAt < current.datang)) current.datang = log.tappedAt;
      if (log.direction === GateDirection.OUT && (!current.pulang || log.tappedAt > current.pulang)) current.pulang = log.tappedAt;
      grouped.set(key, current);
    }

    const rows = [...grouped.values()].map((item) => ({
      userId: item.userId,
      fullName: item.fullName,
      username: item.username,
      role: item.role,
      date: item.date,
      datang: item.datang?.toISOString() ?? null,
      pulang: item.pulang?.toISOString() ?? null,
      status: item.datang && item.pulang ? 'LENGKAP' : item.datang ? 'DATANG' : 'BELUM_SCAN',
      note: item.datang && !item.pulang ? 'Belum scan pulang' : ''
    }));

    return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, ...this.paginate(rows, pagination) };
  }

  async teacherSessionActivity(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const sessions = await this.prisma.session.findMany({
      where: this.buildSessionWhere(range, filters),
      include: {
        schoolClass: { select: { code: true, name: true } },
        subject: { select: { code: true, name: true } },
        teacher: { select: { id: true, fullName: true, username: true } },
        teacherPresence: { select: { teacherId: true, status: true, checkInAt: true, checkOutAt: true } }
      },
      orderBy: { startsAt: 'asc' }
    });

    const rows = sessions.map((session) => {
      const presence = session.teacherPresence.find((item) => item.teacherId === session.teacherId) ?? null;
      return {
        sessionId: session.id,
        teacherId: session.teacherId,
        teacherName: session.teacher.fullName,
        username: session.teacher.username,
        schoolClass: session.schoolClass.code,
        subjectName: session.subject.name,
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
        startedAt: presence?.checkInAt?.toISOString() ?? null,
        closedAt: presence?.checkOutAt?.toISOString() ?? null,
        status: presence?.status ?? session.status
      };
    });

    return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, ...this.paginate(rows, pagination) };
  }

  async studentPrayerAttendance(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const logs = await this.prisma.prayerAttendanceLog.findMany({
      where: {
        scannedAt: { gte: range.from, lte: range.to },
        ...(filters.studentId ? { studentId: filters.studentId } : {})
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            username: true,
            enrollments: { where: { active: true }, include: { schoolClass: { select: { code: true, name: true } } }, take: 1 }
          }
        }
      },
      orderBy: { scannedAt: 'desc' }
    });
    const readerIds = Array.from(new Set(logs.map((log) => log.readerId).filter(Boolean))) as string[];
    const readers = readerIds.length ? await this.prisma.deviceReader.findMany({ where: { id: { in: readerIds } }, select: { id: true, name: true, locationName: true, locationLabel: true } }) : [];
    const readerMap = new Map(readers.map((reader) => [reader.id, reader]));

    const rows = logs.map((log) => ({
      studentId: log.studentId,
      fullName: log.student.fullName,
      username: log.student.username,
      schoolClass: log.student.enrollments[0]?.schoolClass?.code ?? null,
      prayerType: log.prayerType,
      date: businessDateKey(log.attendanceDate ?? log.scannedAt),
      scannedAt: log.scannedAt.toISOString(),
      reader: (log.readerId ? readerMap.get(log.readerId)?.name : null) ?? log.deviceId ?? '—',
      scanMode: log.scanMode,
      scanModeLabel: log.scanMode === 'GERBANG' || log.scanMode === 'GATE_IN' || log.scanMode === 'GATE_OUT' ? 'Gerbang' : 'Mushola',
      status: 'TERCATAT'
    }));

    return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, ...this.paginate(rows, pagination) };
  }

  async studentWorshipRecap(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters);
    const logs = await this.prisma.prayerAttendanceLog.findMany({
      where: {
        scannedAt: { gte: range.from, lte: range.to },
        ...(filters.studentId ? { studentId: filters.studentId } : {})
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            username: true,
            enrollments: { where: { active: true }, include: { schoolClass: { select: { code: true, name: true } } }, take: 1 }
          }
        }
      }
    });

    const grouped = new Map<string, { studentId: string; fullName: string; username: string; schoolClass: string | null; counters: Record<PrayerType, number> }>();
    for (const log of logs) {
      const existing = grouped.get(log.studentId) ?? {
        studentId: log.studentId,
        fullName: log.student.fullName,
        username: log.student.username,
        schoolClass: log.student.enrollments[0]?.schoolClass?.code ?? null,
        counters: { DHUHA: 0, DZUHUR: 0, ASHAR: 0 }
      };
      existing.counters[log.prayerType] += 1;
      grouped.set(log.studentId, existing);
    }

    const rows = [...grouped.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'id')).map((item) => ({
      studentId: item.studentId,
      fullName: item.fullName,
      username: item.username,
      schoolClass: item.schoolClass,
      dhuhaCount: item.counters.DHUHA,
      dzuhurCount: item.counters.DZUHUR,
      asharCount: item.counters.ASHAR,
      periodSummary: `${item.counters.DHUHA} Dhuha · ${item.counters.DZUHUR} Dzuhur · ${item.counters.ASHAR} Ashar`
    }));

    return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, ...this.paginate(rows, pagination) };
  }

  private businessDaysInRange(range: DateRange) {
    const days: Array<ReturnType<typeof businessDayBounds>> = [];
    let key = businessDateKey(range.from);
    const endKey = businessDateKey(range.to);
    for (let guard = 0; guard < 370; guard += 1) {
      days.push(businessDayBounds(key));
      if (key === endKey) break;
      key = addCalendarDays(key, 1);
    }
    return days;
  }

  private async getAttendancePolicySnapshot() {
    const policy = await this.prisma.attendancePolicy.findUnique({ where: { id: 1 } });
    return {
      requireStudentDhuha: policy?.requireStudentDhuha ?? true,
      requireStudentDzuhur: policy?.requireStudentDzuhur ?? true,
      requireStudentAsharForAfternoon: policy?.requireStudentAsharForAfternoon ?? true,
      asharRequiredClassEndTime: policy?.asharRequiredClassEndTime ?? '15:00'
    };
  }

  async studentDailyCompleteness(pagination: PaginationQuery, filters: RecapFilters) {
    const range = this.resolveDateRange(filters, 1);
    const days = this.businessDaysInRange(range);
    const policy = await this.getAttendancePolicySnapshot();
    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        active: true,
        administrativeStatus: 'ACTIVE',
        ...(filters.classId ? { classId: filters.classId } : {}),
        student: {
          role: Role.SISWA,
          active: true,
          ...(filters.studentId ? { id: filters.studentId } : {})
        }
      },
      include: {
        schoolClass: { select: { id: true, code: true, name: true } },
        student: { select: { id: true, fullName: true, username: true } }
      },
      orderBy: [{ schoolClass: { code: 'asc' } }, { student: { fullName: 'asc' } }]
    });

    const studentEnrollmentMap = new Map<string, typeof enrollments[number]>();
    for (const enrollment of enrollments) {
      if (!studentEnrollmentMap.has(enrollment.studentId)) studentEnrollmentMap.set(enrollment.studentId, enrollment);
    }
    const studentEnrollments = [...studentEnrollmentMap.values()];
    const studentIds = studentEnrollments.map((item) => item.studentId);
    const classIds = Array.from(new Set(studentEnrollments.map((item) => item.classId)));

    if (!studentIds.length || !days.length) {
      const emptySummary = {
        studentCount: 0,
        rowCount: 0,
        completeCount: 0,
        missingArrivalCount: 0,
        missingDepartureCount: 0,
        missingClassAttendanceCount: 0,
        missingPrayerCount: 0,
        needsVerificationCount: 0,
        byStatus: Object.fromEntries(Object.keys(STUDENT_DAILY_STATUS_LABELS).map((status) => [status, 0]))
      };
      return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, summary: emptySummary, items: [], meta: buildPaginationMeta(0, pagination) };
    }

    const [sessions, gateLogs, prayerLogs] = await Promise.all([
      this.prisma.session.findMany({
        where: {
          classId: { in: classIds },
          startsAt: { gte: range.from, lte: range.to }
        },
        select: {
          id: true,
          classId: true,
          startsAt: true,
          endsAt: true,
          attendances: {
            where: { studentId: { in: studentIds } },
            select: { studentId: true, status: true, reviewState: true }
          }
        },
        orderBy: { startsAt: 'asc' }
      }),
      this.prisma.gateLog.findMany({
        where: { userId: { in: studentIds }, tappedAt: { gte: range.from, lte: range.to } },
        select: { userId: true, direction: true, businessDate: true, tappedAt: true },
        orderBy: { tappedAt: 'asc' }
      }),
      this.prisma.prayerAttendanceLog.findMany({
        where: { studentId: { in: studentIds }, scannedAt: { gte: range.from, lte: range.to } },
        select: { studentId: true, prayerType: true, attendanceDate: true, scannedAt: true },
        orderBy: { scannedAt: 'asc' }
      })
    ]);

    const sessionsByClassDate = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const key = `${session.classId}:${businessDateKey(session.startsAt)}`;
      const current = sessionsByClassDate.get(key) ?? [];
      current.push(session);
      sessionsByClassDate.set(key, current);
    }

    const gateByStudentDate = new Map<string, { in: Date | null; out: Date | null }>();
    for (const log of gateLogs) {
      const key = `${log.userId}:${businessDateKey(log.businessDate ?? log.tappedAt)}`;
      const current = gateByStudentDate.get(key) ?? { in: null, out: null };
      if (log.direction === GateDirection.IN && (!current.in || log.tappedAt < current.in)) current.in = log.tappedAt;
      if (log.direction === GateDirection.OUT && (!current.out || log.tappedAt > current.out)) current.out = log.tappedAt;
      gateByStudentDate.set(key, current);
    }

    const prayersByStudentDate = new Map<string, Set<PrayerType>>();
    for (const log of prayerLogs) {
      const key = `${log.studentId}:${businessDateKey(log.attendanceDate ?? log.scannedAt)}`;
      const current = prayersByStudentDate.get(key) ?? new Set<PrayerType>();
      current.add(log.prayerType);
      prayersByStudentDate.set(key, current);
    }

    const cutoffMinute = parseLocalTimeMinutes(policy.asharRequiredClassEndTime, 15 * 60);
    const rows = [] as Array<Record<string, unknown>>;

    for (const day of days) {
      for (const enrollment of studentEnrollments) {
        const dateKey = day.key;
        const studentKey = `${enrollment.studentId}:${dateKey}`;
        const classSessions = sessionsByClassDate.get(`${enrollment.classId}:${dateKey}`) ?? [];
        const gate = gateByStudentDate.get(studentKey) ?? { in: null, out: null };
        const completedPrayers = prayersByStudentDate.get(studentKey) ?? new Set<PrayerType>();
        const requiredPrayers = PRAYER_ORDER.filter((prayerType) => {
          if (prayerType === PrayerType.DHUHA) return policy.requireStudentDhuha;
          if (prayerType === PrayerType.DZUHUR) return policy.requireStudentDzuhur;
          if (prayerType === PrayerType.ASHAR) return policy.requireStudentAsharForAfternoon && classSessions.some((session) => localMinutesOfDay(session.endsAt) >= cutoffMinute);
          return false;
        });
        const requiredPrayerSet = new Set(requiredPrayers);
        const attendanceRecords = classSessions.flatMap((session) => session.attendances.filter((attendance) => attendance.studentId === enrollment.studentId));
        const confirmedAttendanceRecords = attendanceRecords.filter((attendance) => attendance.reviewState !== AttendanceReviewState.DEFAULTED);
        const defaultedAttendanceCount = attendanceRecords.length - confirmedAttendanceRecords.length;
        const presentCount = confirmedAttendanceRecords.filter((attendance) => attendance.status === StudentAttendanceStatus.HADIR || attendance.status === StudentAttendanceStatus.TELAT).length;
        const nonPresentCount = confirmedAttendanceRecords.filter((attendance) => attendance.status !== StudentAttendanceStatus.HADIR && attendance.status !== StudentAttendanceStatus.TELAT).length;
        const scheduledCount = classSessions.length;
        const missingClassCount = Math.max(0, scheduledCount - confirmedAttendanceRecords.length);
        const missingPrayerTypes = requiredPrayers.filter((prayerType) => !completedPrayers.has(prayerType));
        const missingCodes: StudentDailyMissingRequirement[] = [];
        if (!gate.in) missingCodes.push('BELUM_SCAN_DATANG');
        if (!gate.out) missingCodes.push('BELUM_SCAN_PULANG');
        if (missingClassCount > 0) missingCodes.push('BELUM_ABSEN_KELAS');
        if (missingPrayerTypes.length > 0) missingCodes.push('BELUM_SCAN_SHOLAT');
        if (nonPresentCount > 0) missingCodes.push('PERLU_VERIFIKASI');

        const finalStatus: StudentDailyFinalStatus = missingCodes.length === 0
          ? 'HADIR_LENGKAP'
          : STUDENT_DAILY_STATUS_ORDER.find((status) => missingCodes.includes(status)) ?? 'PERLU_VERIFIKASI';
        const missingLabels = missingCodes.map((code) => STUDENT_DAILY_MISSING_LABELS[code]);
        const classAttendanceLabel = scheduledCount === 0
          ? 'Tidak ada jadwal kelas'
          : missingClassCount > 0
            ? 'Belum diabsen guru'
            : nonPresentCount > 0
              ? 'Perlu verifikasi'
              : `${presentCount}/${scheduledCount} hadir`;
        const prayerAttendanceLabel = requiredPrayers.length === 0
          ? 'Tidak wajib hari ini'
          : missingPrayerTypes.length > 0
            ? 'Belum scan sholat'
            : `${completedPrayers.size}/${requiredPrayers.length} sholat tercatat`;

        rows.push({
          studentId: enrollment.studentId,
          fullName: enrollment.student.fullName,
          username: enrollment.student.username,
          classId: enrollment.classId,
          schoolClass: enrollment.schoolClass.code,
          schoolClassName: enrollment.schoolClass.name,
          date: dateKey,
          gateArrivalAt: gate.in?.toISOString() ?? null,
          gateDepartureAt: gate.out?.toISOString() ?? null,
          classAttendanceSummary: {
            scheduledCount,
            recordedCount: confirmedAttendanceRecords.length,
            defaultedCount: defaultedAttendanceCount,
            presentCount,
            missingCount: missingClassCount,
            nonPresentCount
          },
          classAttendanceLabel,
          prayerAttendanceSummary: {
            required: requiredPrayers,
            completed: PRAYER_ORDER.filter((prayerType) => requiredPrayerSet.has(prayerType) && completedPrayers.has(prayerType)),
            missing: missingPrayerTypes,
            requiredCount: requiredPrayers.length,
            completedCount: PRAYER_ORDER.filter((prayerType) => requiredPrayerSet.has(prayerType) && completedPrayers.has(prayerType)).length
          },
          prayerAttendanceLabel,
          finalStatus,
          finalStatusLabel: studentDailyStatusLabel(finalStatus),
          missingRequirementCodes: missingCodes,
          missingRequirements: missingLabels,
          note: missingLabels.length ? missingLabels.join(', ') : 'Hadir lengkap'
        });
      }
    }

    const statusFilter = String(filters.status || '').trim() as StudentDailyFinalStatus | '';
    const missingFilter = String(filters.missingRequirement || '').trim() as StudentDailyMissingRequirement | '';
    const filteredRows = rows.filter((row) => {
      if (statusFilter && row.finalStatus !== statusFilter) return false;
      if (missingFilter && !(row.missingRequirementCodes as StudentDailyMissingRequirement[]).includes(missingFilter)) return false;
      return true;
    });
    const byStatus = Object.fromEntries(Object.keys(STUDENT_DAILY_STATUS_LABELS).map((status) => [status, filteredRows.filter((row) => row.finalStatus === status).length]));
    const summary = {
      studentCount: studentEnrollments.length,
      rowCount: filteredRows.length,
      completeCount: filteredRows.filter((row) => row.finalStatus === 'HADIR_LENGKAP').length,
      missingArrivalCount: filteredRows.filter((row) => (row.missingRequirementCodes as StudentDailyMissingRequirement[]).includes('BELUM_SCAN_DATANG')).length,
      missingDepartureCount: filteredRows.filter((row) => (row.missingRequirementCodes as StudentDailyMissingRequirement[]).includes('BELUM_SCAN_PULANG')).length,
      missingClassAttendanceCount: filteredRows.filter((row) => (row.missingRequirementCodes as StudentDailyMissingRequirement[]).includes('BELUM_ABSEN_KELAS')).length,
      missingPrayerCount: filteredRows.filter((row) => (row.missingRequirementCodes as StudentDailyMissingRequirement[]).includes('BELUM_SCAN_SHOLAT')).length,
      needsVerificationCount: filteredRows.filter((row) => (row.missingRequirementCodes as StudentDailyMissingRequirement[]).includes('PERLU_VERIFIKASI')).length,
      byStatus
    };

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      summary,
      ...this.paginate(filteredRows, pagination)
    };
  }

  private loadReportLogo(): Buffer | null {
    const candidates = [
      join(process.cwd(), 'assets', 'logoman1.jpeg'),
      join(process.cwd(), 'apps', 'api', 'assets', 'logoman1.jpeg')
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return readFileSync(candidate);
    }
    return null;
  }

  private normalizeExportFormat(format: string): ExportFormat {
    const normalized = format.trim().toLowerCase();
    if (normalized === 'csv' || normalized === 'xlsx' || normalized === 'pdf' || normalized === 'docx') return normalized;
    throw new BadRequestException('format harus csv, xlsx, pdf, atau docx.');
  }

  async exportReport(reportType: string, format: string, filters: RecapFilters, actor?: { sub: string; role: Role }, requestMeta?: RequestMeta): Promise<ExportResult> {
    const normalizedType = reportType.trim().toLowerCase();
    const normalizedFormat = this.normalizeExportFormat(format);

    const supportedTypes = new Set([
      'recap_classes',
      'recap_students',
      'recap_subjects',
      'recap_teachers',
      'teacher_monthly',
      'staff_gate_attendance',
      'teacher_session_activity',
      'student_prayer_attendance',
      'student_worship_recap',
      'student_daily_complete_attendance',
      'missing_arrival_scan',
      'missing_departure_scan',
      'class_present_no_gate_scan',
      'gate_scan_no_class_attendance',
      'prayer_recap',
      'audit_coverage'
    ]);

    if (!supportedTypes.has(normalizedType)) {
      throw new BadRequestException('reportType tidak didukung.');
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

    if (normalizedType === 'staff_gate_attendance') {
      const data = await this.staffGateAttendance(exportPagination, filters);
      rows = data.items.map((item) => ({
        full_name: item.fullName,
        username: item.username,
        role: item.role,
        date: item.date,
        datang: item.datang,
        pulang: item.pulang,
        status: item.status,
        note: item.note
      }));
    }

    if (normalizedType === 'teacher_session_activity') {
      const data = await this.teacherSessionActivity(exportPagination, filters);
      rows = data.items.map((item) => ({
        teacher_id: item.teacherId,
        teacher_name: item.teacherName,
        username: item.username,
        school_class: item.schoolClass,
        subject_name: item.subjectName,
        starts_at: item.startsAt,
        ends_at: item.endsAt,
        started_at: item.startedAt,
        closed_at: item.closedAt,
        status: item.status
      }));
    }

    if (normalizedType === 'student_prayer_attendance') {
      const data = await this.studentPrayerAttendance(exportPagination, filters);
      rows = data.items.map((item) => ({
        student_id: item.studentId,
        full_name: item.fullName,
        username: item.username,
        school_class: item.schoolClass,
        prayer_type: item.prayerType,
        date: item.date,
        scanned_at: item.scannedAt,
        reader: item.reader,
        status: item.status
      }));
    }

    if (normalizedType === 'student_worship_recap' || normalizedType === 'prayer_recap') {
      const data = await this.studentWorshipRecap(exportPagination, filters);
      rows = data.items.map((item) => ({
        student_id: item.studentId,
        full_name: item.fullName,
        username: item.username,
        school_class: item.schoolClass,
        dhuha_count: item.dhuhaCount,
        dzuhur_count: item.dzuhurCount,
        ashar_count: item.asharCount,
        period_summary: item.periodSummary
      }));
    }

    if (normalizedType === 'student_daily_complete_attendance' || normalizedType === 'missing_arrival_scan' || normalizedType === 'missing_departure_scan' || normalizedType === 'class_present_no_gate_scan' || normalizedType === 'gate_scan_no_class_attendance') {
      const missingRequirement = normalizedType === 'missing_arrival_scan'
        ? 'BELUM_SCAN_DATANG'
        : normalizedType === 'missing_departure_scan'
          ? 'BELUM_SCAN_PULANG'
          : filters.missingRequirement;
      const data = await this.studentDailyCompleteness(exportPagination, { ...filters, missingRequirement });
      rows = data.items
        .filter((item) => {
          if (normalizedType === 'class_present_no_gate_scan') {
            const classSummary = item.classAttendanceSummary as { presentCount?: number } | undefined;
            return Number(classSummary?.presentCount ?? 0) > 0 && (!item.gateArrivalAt || !item.gateDepartureAt);
          }
          if (normalizedType === 'gate_scan_no_class_attendance') {
            return Boolean(item.gateArrivalAt || item.gateDepartureAt) && (item.missingRequirementCodes as string[]).includes('BELUM_ABSEN_KELAS');
          }
          return true;
        })
        .map((item) => ({
          student_id: item.studentId,
          full_name: item.fullName,
          username: item.username,
          school_class: item.schoolClass,
          date: item.date,
          gate_arrival_at: item.gateArrivalAt,
          gate_departure_at: item.gateDepartureAt,
          class_attendance: item.classAttendanceLabel,
          prayer_attendance: item.prayerAttendanceLabel,
          final_status: item.finalStatusLabel,
          note: item.note
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

    const limitViolation = printDocumentRowLimitViolation(normalizedFormat, rows.length);
    if (limitViolation) throw new BadRequestException(limitViolation);

    const title = REPORT_TYPE_TITLES[normalizedType] ?? 'Laporan Sekolah';
    const generatedAt = new Date().toISOString();
    const rangeLabel = filters.month && 'monthLabel' in rangeForMeta
      ? `Bulan ${formatReportMonth((rangeForMeta as DateRange & { monthLabel: string }).monthLabel)}`
      : formatReportRangeLabel(rangeForMeta);
    const metadata = {
      generatedAt,
      generatedBy: actor?.role ?? 'unknown',
      reportType: normalizedType,
      format: normalizedFormat,
      filters: { ...filters } as Record<string, unknown>,
      warning: openAnomalyCount > 0 ? 'Periode ini masih memiliki anomali OPEN. Laporan belum final tanpa verifikasi.' : null,
      counts: { overrideCount, openAnomalyCount, resolvedAnomalyCount, correctionCount },
      range: {
        from: rangeForMeta.from.toISOString(),
        to: rangeForMeta.to.toISOString(),
        label: rangeLabel
      }
    };

    const document: ReportDocumentModel = {
      title,
      subtitle: 'Dokumen resmi rekapitulasi presensi SIAB2',
      institution: 'MAN 1 Rokan Hulu',
      applicationName: 'SIAB2 - Sistem Informasi Akademik Berkarakter',
      addressLine: 'Dokumen resmi internal madrasah - MAN 1 Rokan Hulu',
      metadata,
      columns: columnsFromRows(rows),
      rows,
      logo: this.loadReportLogo()
    };

    const rendered = await renderReportDocument(document, normalizedFormat);
    const checksum = createHash('sha256').update(rendered.buffer).digest('hex');
    const timestamp = generatedAt.replaceAll(':', '-').replace('T', '_').slice(0, 19);
    const filename = `${normalizedType}_${timestamp}.${rendered.extension}`;

    if (actor) await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
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
    });

    return {
      buffer: rendered.buffer,
      contentType: rendered.contentType,
      filename,
      checksum
    };
  }

}
