import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  Role,
  SessionStatus,
  StudentAttendanceStatus,
  TeacherSessionStatus
} from '@prisma/client';
import { buildPaginationMeta, type PaginationQuery } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/current-user.decorator';
import { BatchAttendanceDto, CorrectAttendanceDto, SessionGeoDto } from './attendance-class.dto';

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

@Injectable()
export class AttendanceClassService {
  constructor(private readonly prisma: PrismaService) {}

  async listSessions(user: AuthenticatedUser, pagination: PaginationQuery, date?: string) {
    const where: Prisma.SessionWhereInput = {};

    if (date) {
      const d = new Date(date);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      where.startsAt = { gte: start, lte: end };
    }

    if (user.role === Role.GURU_MAPEL) {
      where.teacherId = user.sub;
    }

    const [total, items] = await Promise.all([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        include: {
          schoolClass: { select: { id: true, code: true, name: true } },
          subject: { select: { id: true, code: true, name: true } },
          teacher: { select: { id: true, fullName: true } }
        },
        orderBy: { startsAt: 'asc' },
        skip: pagination.skip,
        take: pagination.limit
      })
    ]);

    return {
      items,
      meta: buildPaginationMeta(total, pagination)
    };
  }

  async openSession(sessionId: string, actor: AuthenticatedUser, geo?: SessionGeoDto) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    const policy = await this.prisma.geofencePolicy.findUnique({ where: { id: 1 } });
    if (policy && !policy.allowPicketOverride && actor.role === Role.GURU_PIKET) {
      throw new ForbiddenException('Override guru piket sedang dinonaktifkan.');
    }

    if (policy && policy.enforceSessionOpen) {
      if (geo?.lat === undefined || geo?.lng === undefined) {
        throw new BadRequestException('Koordinat wajib saat geofence aktif.');
      }
      const distance = haversineDistanceMeters(policy.centerLat, policy.centerLng, geo.lat, geo.lng);
      if (distance > policy.radiusMeter) {
        throw new ForbiddenException('Di luar area sekolah.');
      }
    }

    if (policy?.requireGateTapForOpen) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date();
      dayEnd.setHours(23, 59, 59, 999);

      const gateTap = await this.prisma.gateLog.findFirst({
        where: {
          userId: actor.sub,
          direction: 'IN',
          tappedAt: {
            gte: dayStart,
            lte: dayEnd
          }
        }
      });

      if (!gateTap) {
        throw new ForbiddenException('Guru belum tap gerbang hari ini.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.OPEN,
          openedAt: new Date()
        }
      });

      await tx.teacherSessionPresence.upsert({
        where: {
          sessionId_teacherId: {
            sessionId,
            teacherId: session.teacherId
          }
        },
        update: {
          status: actor.sub === session.teacherId ? TeacherSessionStatus.HADIR : TeacherSessionStatus.EXCUSED_ABSENCE
        },
        create: {
          sessionId,
          teacherId: session.teacherId,
          status: actor.sub === session.teacherId ? TeacherSessionStatus.HADIR : TeacherSessionStatus.EXCUSED_ABSENCE
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId: actor.sub,
          actorRole: actor.role as Role,
          module: 'attendance',
          action: 'class.session.opened',
          resource: 'session',
          resourceId: sessionId,
          after: updated
        }
      });

      return updated;
    });
  }

  async recordAttendance(sessionId: string, actor: AuthenticatedUser, payload: BatchAttendanceDto) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('Sesi belum OPEN.');
    }

    return this.prisma.$transaction(async (tx) => {
      const result = [];
      for (const item of payload.items) {
        const attendance = await tx.studentAttendance.upsert({
          where: {
            sessionId_studentId: {
              sessionId,
              studentId: item.studentId
            }
          },
          create: {
            sessionId,
            studentId: item.studentId,
            status: item.status,
            note: item.note
          },
          update: {
            status: item.status,
            note: item.note
          }
        });
        result.push(attendance);
      }

      await tx.auditEntry.create({
        data: {
          actorId: actor.sub,
          actorRole: actor.role as Role,
          module: 'attendance',
          action: 'class.attendance.recorded',
          resource: 'session',
          resourceId: sessionId,
          after: {
            count: result.length
          }
        }
      });

      return {
        updated: result.length
      };
    });
  }

  async closeSession(sessionId: string, actor: AuthenticatedUser) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    if (session.status !== SessionStatus.OPEN) {
      throw new BadRequestException('Sesi tidak dalam status OPEN.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.CLOSED,
          closedAt: new Date(),
          reconciledAt: null
        }
      });

      await tx.teacherSessionPresence.upsert({
        where: {
          sessionId_teacherId: {
            sessionId,
            teacherId: session.teacherId
          }
        },
        update: {
          status: TeacherSessionStatus.HADIR
        },
        create: {
          sessionId,
          teacherId: session.teacherId,
          status: TeacherSessionStatus.HADIR
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId: actor.sub,
          actorRole: actor.role as Role,
          module: 'attendance',
          action: 'class.session.closed',
          resource: 'session',
          resourceId: sessionId,
          after: updated
        }
      });

      return updated;
    });
  }

  async summary(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        attendances: true,
        schoolClass: {
          include: {
            enrollments: true
          }
        }
      }
    });

    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    const counters = {
      [StudentAttendanceStatus.HADIR]: 0,
      [StudentAttendanceStatus.TELAT]: 0,
      [StudentAttendanceStatus.IZIN]: 0,
      [StudentAttendanceStatus.SAKIT]: 0,
      [StudentAttendanceStatus.ALPA]: 0
    };

    for (const item of session.attendances) {
      counters[item.status] += 1;
    }

    return {
      sessionId,
      status: session.status,
      enrolledCount: session.schoolClass.enrollments.length,
      recordedCount: session.attendances.length,
      counters
    };
  }

  async roster(sessionId: string, actor: AuthenticatedUser) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        schoolClass: {
          include: {
            enrollments: {
              include: {
                student: {
                  select: {
                    id: true,
                    fullName: true,
                    username: true,
                    cardStatus: true
                  }
                }
              },
              orderBy: {
                student: {
                  fullName: 'asc'
                }
              }
            }
          }
        },
        attendances: true
      }
    });

    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    const attendanceMap = new Map(session.attendances.map((item) => [item.studentId, item]));
    const roster = session.schoolClass.enrollments.map((enrollment) => {
      const existing = attendanceMap.get(enrollment.studentId);
      return {
        studentId: enrollment.studentId,
        fullName: enrollment.student.fullName,
        username: enrollment.student.username,
        cardStatus: enrollment.student.cardStatus,
        status: existing?.status ?? StudentAttendanceStatus.ALPA,
        note: existing?.note ?? null,
        updatedAt: existing?.updatedAt ?? null
      };
    });

    return {
      session: {
        id: session.id,
        status: session.status,
        startsAt: session.startsAt,
        endsAt: session.endsAt
      },
      roster
    };
  }

  async correctAttendance(
    sessionId: string,
    studentId: string,
    actor: AuthenticatedUser,
    payload: CorrectAttendanceDto
  ) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Sesi tidak ditemukan.');
    }

    if (actor.role === Role.GURU_MAPEL && session.teacherId !== actor.sub) {
      throw new ForbiddenException('Bukan sesi Anda.');
    }

    if (session.status === SessionStatus.SCHEDULED) {
      throw new BadRequestException('Koreksi hanya bisa dilakukan setelah sesi berjalan.');
    }

    return this.prisma.$transaction(async (tx) => {
      const attendance = await tx.studentAttendance.upsert({
        where: {
          sessionId_studentId: {
            sessionId,
            studentId
          }
        },
        create: {
          sessionId,
          studentId,
          status: payload.status,
          note: payload.note
        },
        update: {
          status: payload.status,
          note: payload.note
        }
      });

      await tx.auditEntry.create({
        data: {
          actorId: actor.sub,
          actorRole: actor.role as Role,
          module: 'attendance',
          action: 'class.attendance.corrected',
          resource: 'studentAttendance',
          resourceId: attendance.id,
          after: {
            status: attendance.status,
            note: attendance.note,
            reason: payload.reason
          }
        }
      });

      return attendance;
    });
  }
}
