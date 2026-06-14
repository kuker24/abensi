import {
  BadRequestException,
  Controller,
  StreamableFile,
  ForbiddenException,
  Get,
  MessageEvent,
  Param,
  Query,
  Req,
  Res,
  Sse,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { Observable } from 'rxjs';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportingService } from './reporting.service';

type StreamJwtPayload = { sub: string; role: string; sid?: string; ver?: number };

const activeSseByUser = new Map<string, number>();
let activeSseGlobal = 0;

function sanitizeStreamPayload(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

@Controller('reports')
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('reports.operational.read')
  dashboard(@Query('date') date?: string) {
    return this.reportingService.dashboard(date);
  }

  @Get('class/:classId/monthly')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('reports.school.read')
  classMonthly(@Param('classId') classId: string, @Query('month') month?: string) {
    return this.reportingService.classMonthly(classId, month);
  }

  @Get('trend')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('reports.operational.read')
  trend(@Query('days') days?: string) {
    const parsedDays = Number(days ?? '7');
    return this.reportingService.trend(Number.isNaN(parsedDays) ? 7 : parsedDays);
  }

  @Get('live-monitor')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('reports.operational.read')
  liveMonitor(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 120,
      maxLimit: 400
    });
    return this.reportingService.liveMonitor(pagination);
  }

  @Sse('live-monitor/stream')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  @Capabilities('reports.operational.read')
  streamLiveMonitor(
    @Query('limit') limit?: string,
    @Req() request?: Request
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let heartbeat: NodeJS.Timeout | null = null;
      let userKey: string | null = null;
      let closed = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (userKey) activeSseByUser.set(userKey, Math.max(0, (activeSseByUser.get(userKey) ?? 1) - 1));
        activeSseGlobal = Math.max(0, activeSseGlobal - 1);
      };

      void (async () => {
        const payload = await this.verifyStreamCookie(request);
        const allowedRoles = new Set<string>([Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER]);
        if (!allowedRoles.has(payload.role)) throw new ForbiddenException('Akses live monitor ditolak.');

        userKey = payload.sub;
        const perUserLimit = Number(process.env.SSE_MAX_CONNECTIONS_PER_USER ?? '3');
        const globalLimit = Number(process.env.SSE_MAX_CONNECTIONS_GLOBAL ?? '100');
        if ((activeSseByUser.get(userKey) ?? 0) >= perUserLimit || activeSseGlobal >= globalLimit) {
          throw new ForbiddenException('Batas koneksi live monitor terlampaui.');
        }
        activeSseByUser.set(userKey, (activeSseByUser.get(userKey) ?? 0) + 1);
        activeSseGlobal += 1;

        const pagination = parsePagination({ page: '1', limit, defaultLimit: 120, maxLimit: 400 });
        const snapshot = await this.reportingService.liveMonitor(pagination);
        subscriber.next({ id: `snapshot-${Date.now()}`, type: 'snapshot', data: sanitizeStreamPayload(snapshot) });

        const lastEventId = typeof request?.headers['last-event-id'] === 'string' ? request.headers['last-event-id'] : null;
        if (lastEventId) {
          const lastEvent = await this.prisma.outboxEvent.findUnique({ where: { id: lastEventId } });
          const replay = await this.prisma.outboxEvent.findMany({
            where: {
              topic: 'live-monitor',
              ...(lastEvent ? { createdAt: { gt: lastEvent.createdAt } } : {})
            },
            orderBy: { createdAt: 'asc' },
            take: 100
          });
          for (const event of replay) {
            subscriber.next({ id: event.id, type: event.eventType, data: sanitizeStreamPayload(event.payload) });
          }
        }

        heartbeat = setInterval(() => {
          subscriber.next({ id: `heartbeat-${Date.now()}`, type: 'heartbeat', data: { at: new Date().toISOString() } });
        }, Number(process.env.SSE_HEARTBEAT_MS ?? '25000'));
      })().catch((error) => subscriber.error(error));

      return cleanup;
    });
  }

  @Get('my-attendance')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  @Capabilities('reports.self.read')
  myAttendance(
    @CurrentUser() user: { sub: string; role: string },
    @Query('days') days?: string
  ) {
    const parsedDays = Number(days ?? '30');
    return this.reportingService.myAttendance(user, Number.isNaN(parsedDays) ? 30 : parsedDays);
  }

  @Get('recap/classes')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('reports.school.read')
  recapClasses(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 500
    });

    return this.reportingService.recapClasses(pagination, { from, to, classId, subjectId, teacherId });
  }

  @Get('recap/students')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('reports.school.read')
  recapStudents(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('studentId') studentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 500
    });

    return this.reportingService.recapStudents(pagination, {
      from,
      to,
      classId,
      subjectId,
      teacherId,
      studentId
    });
  }

  @Get('recap/subjects')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('reports.school.read')
  recapSubjects(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 500
    });

    return this.reportingService.recapSubjects(pagination, { from, to, classId, subjectId, teacherId });
  }

  @Get('recap/teachers')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('reports.school.read')
  recapTeachers(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 500
    });

    return this.reportingService.recapTeachers(pagination, { from, to, classId, subjectId, teacherId });
  }

  @Get('teacher-monthly')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('reports.school.read')
  teacherMonthly(
    @Query('month') month?: string,
    @Query('teacherId') teacherId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 500
    });

    return this.reportingService.teacherMonthly(pagination, { month, teacherId });
  }

  @Get('audit-coverage')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('reports.school.read')
  auditCoverage(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 500
    });

    return this.reportingService.auditCoverage(pagination, { from, to, classId, subjectId, teacherId });
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
  @Roles(Role.ADMIN_TU, Role.DEVELOPER)
  @Capabilities('reports.export')
  async exportReport(
    @Query('reportType') reportType?: string,
    @Query('format') format?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('studentId') studentId?: string,
    @Query('month') month?: string,
    @CurrentUser() user?: { sub: string; role: Role },
    @Req() request?: Request,
    @Res({ passthrough: true }) response?: Response
  ) {
    if (!reportType || !format) {
      throw new BadRequestException('reportType dan format wajib diisi.');
    }
    const result = await this.reportingService.exportReport(reportType, format, {
      from,
      to,
      classId,
      subjectId,
      teacherId,
      studentId,
      month
    }, user, request ? { requestIp: request.ip, requestDevice: request.headers['user-agent'] || null } : undefined);

    response?.setHeader('Content-Type', result.contentType);
    response?.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response?.setHeader('X-SchoolHub-Report-Checksum', result.checksum);
    return new StreamableFile(result.buffer);
  }

  private async verifyStreamCookie(request?: Request): Promise<StreamJwtPayload> {
    const finalToken = this.readCookie(request, 'schoolhub_access_token');

    if (!finalToken) {
      throw new UnauthorizedException('Cookie sesi tidak tersedia untuk stream live monitor.');
    }

    try {
      const payload = this.jwtService.verify<StreamJwtPayload>(finalToken);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, active: true, sessionVersion: true }
      });

      if (!user || !user.active) {
        throw new UnauthorizedException('Sesi tidak aktif. Silakan masuk ulang.');
      }
      if (payload.ver !== undefined && payload.ver !== user.sessionVersion) {
        throw new UnauthorizedException('Sesi sudah tidak berlaku. Silakan masuk ulang.');
      }
      if (payload.sid) {
        const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
        if (!session || session.userId !== user.id || session.revokedAt || session.expiresAt <= new Date()) {
          throw new UnauthorizedException('Sesi sudah dicabut atau kedaluwarsa.');
        }
      }

      return { ...payload, role: user.role };
    } catch {
      throw new UnauthorizedException('Cookie sesi live monitor tidak valid.');
    }
  }

  private readCookie(request: Request | undefined, name: string) {
    const raw = request?.headers.cookie || '';
    const parts = raw.split(';').map((part) => part.trim());
    for (const part of parts) {
      const [key, ...valueParts] = part.split('=');
      if (key === name) return decodeURIComponent(valueParts.join('='));
    }
    return undefined;
  }
}
