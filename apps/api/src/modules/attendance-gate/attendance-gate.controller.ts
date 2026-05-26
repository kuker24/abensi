import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { extractRequestMeta } from '../../common/request-meta';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateAttendanceOverrideDto, QrReaderScanDto, QrScanDto, ReaderScanDto, ReviewAttendanceOverrideDto, TapGateDto, UpdateAttendancePolicyDto } from './attendance-gate.dto';
import { AttendanceGateService } from './attendance-gate.service';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
export class AttendanceGateController {
  constructor(private readonly attendanceGateService: AttendanceGateService) {}

  @Get('policy')
  getAttendancePolicy() {
    return this.attendanceGateService.getAttendancePolicy();
  }

  @Put('policy')
  updateAttendancePolicy(@Body() body: UpdateAttendancePolicyDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.attendanceGateService.updateAttendancePolicy(body, user);
  }

  @Get('gate/logs')
  listLogs(
    @Query('date') date?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });

    return this.attendanceGateService.listLogs(pagination, date, userId);
  }

  @Get('prayer/logs')
  listPrayerLogs(
    @Query('date') date?: string,
    @Query('studentId') studentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.attendanceGateService.listPrayerLogs(pagination, date, studentId);
  }

  @Post('gate/tap')
  tap(@Body() body: TapGateDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.attendanceGateService.tap(body, user);
  }

  @Post('qr-scan')
  qrScan(@Body() body: QrScanDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.attendanceGateService.qrScan(body, user);
  }

  @Post('overrides')
  createOverride(@Body() body: CreateAttendanceOverrideDto, @CurrentUser() user: { sub: string; role: Role }, @Req() request: Request) {
    return this.attendanceGateService.createOverride(body, user, extractRequestMeta(request));
  }

  @Post('overrides/:id/approve')
  approveOverride(@Param('id') id: string, @Body() body: ReviewAttendanceOverrideDto, @CurrentUser() user: { sub: string; role: Role }, @Req() request: Request) {
    return this.attendanceGateService.approveOverride(id, body, user, extractRequestMeta(request));
  }

  @Post('overrides/:id/revoke')
  revokeOverride(@Param('id') id: string, @Body() body: ReviewAttendanceOverrideDto, @CurrentUser() user: { sub: string; role: Role }, @Req() request: Request) {
    return this.attendanceGateService.revokeOverride(id, body, user, extractRequestMeta(request));
  }
}

@Controller('attendance')
export class AttendanceReaderScanController {
  constructor(private readonly attendanceGateService: AttendanceGateService) {}

  @Post('reader-scan')
  readerScan(
    @Body() body: ReaderScanDto,
    @Headers('x-reader-device-id') deviceId: string | undefined,
    @Headers('x-reader-timestamp') timestamp: string | undefined,
    @Headers('x-reader-nonce') nonce: string | undefined,
    @Headers('x-reader-body-hash') bodyHash: string | undefined,
    @Headers('x-reader-signature') signature: string | undefined,
    @Req() request: Request
  ) {
    return this.attendanceGateService.readerScan(body, {
      deviceId,
      timestamp,
      nonce,
      bodyHash,
      signature,
      method: request.method,
      path: request.originalUrl.split('?')[0]
    });
  }

  @Post('qr-reader-scan')
  qrReaderScan(
    @Body() body: QrReaderScanDto,
    @Headers('x-reader-device-id') deviceId: string | undefined,
    @Headers('x-reader-timestamp') timestamp: string | undefined,
    @Headers('x-reader-nonce') nonce: string | undefined,
    @Headers('x-reader-body-hash') bodyHash: string | undefined,
    @Headers('x-reader-signature') signature: string | undefined,
    @Req() request: Request
  ) {
    return this.attendanceGateService.qrReaderScan(body, {
      deviceId,
      timestamp,
      nonce,
      bodyHash,
      signature,
      method: request.method,
      path: request.originalUrl.split('?')[0]
    });
  }
}
