import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AttendanceReviewState,
  GateDirection,
  PrayerType,
  Prisma,
  Role,
  StudentAttendanceStatus
} from '@prisma/client';
import { jakartaBusinessDayBounds, localMinutesOfDay } from '../../common/business-time';
import type { AuthenticatedUser } from '../../common/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

type TodayItemStatus = 'DONE' | 'PENDING' | 'NOT_REQUIRED' | 'OUTSIDE_WINDOW';
type TodayItemKey = 'GATE_IN' | 'CLASS_ATTENDANCE' | 'PRAYER_DHUHA' | 'PRAYER_DZUHUR' | 'PRAYER_ASHAR' | 'GATE_OUT';

type TodayItem = {
  key: TodayItemKey;
  label: string;
  status: TodayItemStatus;
  time: string | null;
  description: string;
};

type ActiveEnrollment = Prisma.ClassEnrollmentGetPayload<{
  include: { schoolClass: { select: { id: true; code: true; name: true } } };
}>;

type StudentSession = Prisma.SessionGetPayload<{
  select: {
    id: true;
    startsAt: true;
    endsAt: true;
    attendances: { select: { status: true; reviewState: true } };
  };
}>;

function localTime(value?: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(value).replace(/\./g, ':');
}

function parseLocalTimeMinutes(value: string | null | undefined, fallback: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return hour * 60 + minute;
}

function statusText(status: StudentAttendanceStatus) {
  return ({
    HADIR: 'Hadir',
    TELAT: 'Terlambat',
    IZIN: 'Izin',
    SAKIT: 'Sakit',
    ALPA: 'Alpa'
  } as Record<StudentAttendanceStatus, string>)[status] ?? status;
}

function compactStatusSummary(records: Array<{ status: StudentAttendanceStatus }>) {
  const counts = records.reduce<Record<string, number>>((acc, record) => {
    acc[record.status] = (acc[record.status] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([status, count]) => `${statusText(status as StudentAttendanceStatus)} ${count}`).join(', ');
}

function isRecordedAttendance(attendance: { reviewState: AttendanceReviewState }) {
  return attendance.reviewState !== AttendanceReviewState.DEFAULTED;
}

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async todayStatus(actor: AuthenticatedUser, date?: string) {
    if (actor.role !== Role.SISWA) {
      throw new ForbiddenException('Status hari ini hanya tersedia untuk siswa.');
    }

    const bounds = jakartaBusinessDayBounds(date ?? new Date());
    const student = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { id: true, fullName: true, username: true, role: true, active: true }
    });
    if (!student || student.role !== Role.SISWA || !student.active) {
      throw new NotFoundException('Siswa tidak ditemukan atau tidak aktif.');
    }

    const [enrollment, policy, gateLogs, prayerLogs] = await Promise.all([
      this.findActiveEnrollment(actor.sub, bounds.date),
      this.attendancePolicy(),
      this.prisma.gateLog.findMany({
        where: { userId: actor.sub, businessDate: bounds.date },
        select: { direction: true, tappedAt: true },
        orderBy: { tappedAt: 'asc' }
      }),
      this.prisma.prayerAttendanceLog.findMany({
        where: { studentId: actor.sub, attendanceDate: bounds.date },
        select: { prayerType: true, scannedAt: true },
        orderBy: { scannedAt: 'asc' }
      })
    ]);

    const sessions = enrollment ? await this.prisma.session.findMany({
      where: {
        classId: enrollment.classId,
        startsAt: { gte: bounds.start, lte: bounds.end }
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        attendances: {
          where: { studentId: actor.sub },
          select: { status: true, reviewState: true }
        }
      },
      orderBy: { startsAt: 'asc' }
    }) : [];

    const items = [
      this.gateItem('GATE_IN', 'Scan Datang', gateLogs.find((log) => log.direction === GateDirection.IN)?.tappedAt ?? null),
      this.classAttendanceItem(sessions),
      this.prayerItem('PRAYER_DHUHA', 'Sholat Dhuha', PrayerType.DHUHA, policy.requireStudentDhuha, prayerLogs),
      this.prayerItem('PRAYER_DZUHUR', 'Sholat Dzuhur', PrayerType.DZUHUR, policy.requireStudentDzuhur, prayerLogs),
      this.prayerItem(
        'PRAYER_ASHAR',
        'Sholat Ashar',
        PrayerType.ASHAR,
        policy.requireStudentAsharForAfternoon && sessions.some((session) => localMinutesOfDay(session.endsAt) >= parseLocalTimeMinutes(policy.asharRequiredClassEndTime, 15 * 60)),
        prayerLogs
      ),
      this.gateItem('GATE_OUT', 'Scan Pulang', gateLogs.filter((log) => log.direction === GateDirection.OUT).at(-1)?.tappedAt ?? null)
    ];

    const pendingItems = items.filter((item) => item.status === 'PENDING');
    const completedCount = items.filter((item) => item.status === 'DONE').length;
    const nextActions = this.nextActions(pendingItems);

    return {
      date: bounds.key,
      student: {
        id: student.id,
        fullName: student.fullName,
        username: student.username,
        className: enrollment?.schoolClass.code ?? null
      },
      summary: {
        completedCount,
        pendingCount: pendingItems.length,
        overallStatus: pendingItems.length ? 'PERLU_DILENGKAPI' : 'LENGKAP'
      },
      items,
      nextActions
    };
  }

  private findActiveEnrollment(studentId: string, businessDate: Date) {
    return this.prisma.classEnrollment.findFirst({
      where: {
        studentId,
        active: true,
        administrativeStatus: 'ACTIVE',
        effectiveFrom: { lte: businessDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: businessDate } }]
      },
      include: { schoolClass: { select: { id: true, code: true, name: true } } },
      orderBy: { effectiveFrom: 'desc' }
    }) as Promise<ActiveEnrollment | null>;
  }

  private async attendancePolicy() {
    const policy = await this.prisma.attendancePolicy.findUnique({ where: { id: 1 } });
    return {
      requireStudentDhuha: policy?.requireStudentDhuha ?? true,
      requireStudentDzuhur: policy?.requireStudentDzuhur ?? true,
      requireStudentAsharForAfternoon: policy?.requireStudentAsharForAfternoon ?? true,
      asharRequiredClassEndTime: policy?.asharRequiredClassEndTime ?? '15:00'
    };
  }

  private gateItem(key: 'GATE_IN' | 'GATE_OUT', label: string, time: Date | null): TodayItem {
    const isArrival = key === 'GATE_IN';
    return {
      key,
      label,
      status: time ? 'DONE' : 'PENDING',
      time: localTime(time),
      description: time
        ? `${isArrival ? 'Kedatangan' : 'Kepulangan'} sudah tercatat.`
        : `${isArrival ? 'Scan datang di gerbang.' : 'Scan pulang sebelum keluar sekolah.'}`
    };
  }

  private classAttendanceItem(sessions: StudentSession[]): TodayItem {
    if (!sessions.length) {
      return {
        key: 'CLASS_ATTENDANCE',
        label: 'Presensi Kelas',
        status: 'NOT_REQUIRED',
        time: null,
        description: 'Tidak ada jadwal kelas hari ini.'
      };
    }

    const confirmed = sessions.flatMap((session) => session.attendances).filter(isRecordedAttendance);
    if (confirmed.length < sessions.length) {
      return {
        key: 'CLASS_ATTENDANCE',
        label: 'Presensi Kelas',
        status: 'PENDING',
        time: null,
        description: confirmed.length
          ? `${confirmed.length}/${sessions.length} sesi sudah diabsen. Tunggu guru melengkapi sesi lain.`
          : 'Tunggu guru mengisi presensi kelas.'
      };
    }

    return {
      key: 'CLASS_ATTENDANCE',
      label: 'Presensi Kelas',
      status: 'DONE',
      time: null,
      description: `Semua ${sessions.length} sesi kelas sudah tercatat: ${compactStatusSummary(confirmed)}.`
    };
  }

  private prayerItem(
    key: 'PRAYER_DHUHA' | 'PRAYER_DZUHUR' | 'PRAYER_ASHAR',
    label: string,
    prayerType: PrayerType,
    required: boolean,
    prayerLogs: Array<{ prayerType: PrayerType; scannedAt: Date }>
  ): TodayItem {
    const log = prayerLogs.find((item) => item.prayerType === prayerType);
    if (log) {
      return { key, label, status: 'DONE', time: localTime(log.scannedAt), description: `${label} sudah tercatat.` };
    }
    if (!required) {
      return { key, label, status: 'NOT_REQUIRED', time: null, description: `${label} tidak wajib hari ini.` };
    }
    return { key, label, status: 'PENDING', time: null, description: `Scan ${label.replace('Sholat ', '')} di mushola.` };
  }

  private nextActions(items: TodayItem[]) {
    const actions = items.map((item) => ({
      GATE_IN: 'Scan datang di gerbang.',
      CLASS_ATTENDANCE: 'Ikuti presensi kelas dengan guru.',
      PRAYER_DHUHA: 'Scan Dhuha di mushola.',
      PRAYER_DZUHUR: 'Scan Dzuhur di mushola.',
      PRAYER_ASHAR: 'Scan Ashar di mushola.',
      GATE_OUT: 'Scan pulang sebelum keluar sekolah.'
    } as Record<TodayItemKey, string>)[item.key]);

    return actions.length ? actions : ['Semua bagian wajib hari ini sudah tercatat.'];
  }
}
