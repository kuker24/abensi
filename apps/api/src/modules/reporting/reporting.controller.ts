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
import { from, interval, map, Observable, startWith, switchMap } from 'rxjs';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportingService } from './reporting.service';

type StreamJwtPayload = { sub: string; role: string; sid?: string; ver?: number };

@Controller('reports')
export class ReportingController {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  dashboard(@Query('date') date?: string) {
    return this.reportingService.dashboard(date);
  }

  @Get('class/:classId/monthly')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  classMonthly(@Param('classId') classId: string, @Query('month') month?: string) {
    return this.reportingService.classMonthly(classId, month);
  }

  @Get('trend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
  trend(@Query('days') days?: string) {
    const parsedDays = Number(days ?? '7');
    return this.reportingService.trend(Number.isNaN(parsedDays) ? 7 : parsedDays);
  }

  @Get('live-monitor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
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
  streamLiveMonitor(
    @Query('limit') limit?: string,
    @Req() request?: Request
  ): Observable<MessageEvent> {
    return from(this.verifyStreamCookie(request)).pipe(
      switchMap((payload) => {
        const allowedRoles = new Set<string>([Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER]);
        if (!allowedRoles.has(payload.role)) {
          throw new ForbiddenException('Akses live monitor ditolak.');
        }

        const pagination = parsePagination({
          page: '1',
          limit,
          defaultLimit: 120,
          maxLimit: 400
        });

        return interval(5000).pipe(
          startWith(0),
          switchMap(() => from(this.reportingService.liveMonitor(pagination))),
          map((snapshot) => ({
            type: 'snapshot',
            data: snapshot
          }))
        );
      })
    );
  }

  @Get('my-attendance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  myAttendance(
    @CurrentUser() user: { sub: string; role: string },
    @Query('days') days?: string
  ) {
    const parsedDays = Number(days ?? '30');
    return this.reportingService.myAttendance(user, Number.isNaN(parsedDays) ? 30 : parsedDays);
  }

  @Get('recap/classes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
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
