import { Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { extractRequestMeta } from '../../common/request-meta';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateAttendanceOverrideDto, DeviceGateEventDto, QrReaderScanDto, QrScanDto, ReaderScanDto, ReviewAttendanceOverrideDto, TapGateDto, UpdateAttendancePolicyDto } from './attendance-gate.dto';
import { AttendanceGateService } from './attendance-gate.service';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.GURU_PIKET, Role.DEVELOPER)
export class AttendanceGateController {
  constructor(private readonly attendanceGateService: AttendanceGateService) {}

  @Get('policy')
  @Capabilities('settings.read')
  getAttendancePolicy() {
    return this.attendanceGateService.getAttendancePolicy();
  }

  @Put('policy')
  @Capabilities('settings.manage')
  updateAttendancePolicy(@Body() body: UpdateAttendancePolicyDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.attendanceGateService.updateAttendancePolicy(body, user);
  }

  @Get('gate/logs')
  @Capabilities('gateAttendance.read')
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
  @Capabilities('gateAttendance.read')
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
  @Capabilities('gateAttendance.record')
  tap(@Body() body: TapGateDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.attendanceGateService.tap(body, user);
  }

  @Post('qr-scan')
  @Capabilities('gateAttendance.record')
  qrScan(@Body() body: QrScanDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.attendanceGateService.qrScan(body, user);
  }

  @Post('overrides')
  @Capabilities('attendanceOverrides.create')
  createOverride(@Body() body: CreateAttendanceOverrideDto, @CurrentUser() user: { sub: string; role: Role }, @Req() request: Request) {
    return this.attendanceGateService.createOverride(body, user, extractRequestMeta(request));
  }

  @Post('overrides/:id/approve')
  @Capabilities('attendanceOverrides.approve')
  approveOverride(@Param('id') id: string, @Body() body: ReviewAttendanceOverrideDto, @CurrentUser() user: { sub: string; role: Role }, @Req() request: Request) {
    return this.attendanceGateService.approveOverride(id, body, user, extractRequestMeta(request));
  }

  @Post('overrides/:id/revoke')
  @Capabilities('attendanceOverrides.revoke')
  revokeOverride(@Param('id') id: string, @Body() body: ReviewAttendanceOverrideDto, @CurrentUser() user: { sub: string; role: Role }, @Req() request: Request) {
    return this.attendanceGateService.revokeOverride(id, body, user, extractRequestMeta(request));
  }
}

@Controller('device/gate')
export class DeviceGateEventsController {
  constructor(private readonly attendanceGateService: AttendanceGateService) {}

  @Post('events')
  gateEvent(
    @Body() body: DeviceGateEventDto,
    @Headers('x-reader-device-id') deviceId: string | undefined,
    @Req() request: Request
  ) {
    return this.attendanceGateService.deviceGateEvent(body, {
      deviceId,
      method: request.method,
      path: request.originalUrl.split('?')[0]
    });
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
