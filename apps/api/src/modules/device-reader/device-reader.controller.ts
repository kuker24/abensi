import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AndroidProvisionCompleteDto, AndroidProvisionStartDto, CreateReaderDto, RevokeReaderDto, RotateReaderKeyDto, UpdateReaderDto, UpdateReaderStatusDto } from './device-reader.dto';
import { DeviceReaderService } from './device-reader.service';

function pagination(page?: string, limit?: string) {
  return parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
}

@Controller('devices/readers')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class DeviceReaderController {
  constructor(private readonly readerService: DeviceReaderService) {}

  @Get()
  @Capabilities('devices.read')
  listReaders(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.readerService.listReaders(pagination(page, limit));
  }

  @Post()
  @Capabilities('devices.manage')
  createReader(@Body() body: CreateReaderDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.readerService.createReader(body, user);
  }

  @Post(':id/rotate-key')
  @Capabilities('devices.manage')
  rotateKey(@Param('id') id: string, @Body() body: RotateReaderKeyDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.readerService.rotateApiKey(id, user, body);
  }

  @Patch(':id/status')
  @Capabilities('devices.manage')
  updateStatus(@Param('id') id: string, @Body() body: UpdateReaderStatusDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.readerService.updateStatus(id, body, user);
  }
}

@Controller('device-readers')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class DeviceReaderAdminController {
  constructor(private readonly readerService: DeviceReaderService) {}

  @Get()
  @Capabilities('devices.read')
  listReaders(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.readerService.listReaders(pagination(page, limit));
  }

  @Get(':id/status')
  @Capabilities('devices.read')
  getStatus(@Param('id') id: string) {
    return this.readerService.getStatus(id);
  }

  @Post()
  @Capabilities('devices.manage')
  createReader(@Body() body: CreateReaderDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.readerService.createReader(body, user);
  }

  @Post('android/provision/start')
  @Capabilities('devices.manage')
  startAndroidProvision(@Body() body: AndroidProvisionStartDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.readerService.startAndroidProvision(body, user);
  }

  @Post(':id/rotate-secret')
  @Capabilities('devices.manage')
  rotateSecret(@Param('id') id: string, @Body() body: RotateReaderKeyDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.readerService.rotateApiKey(id, user, body);
  }

  @Post(':id/revoke')
  @Capabilities('devices.manage')
  revoke(@Param('id') id: string, @Body() body: RevokeReaderDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.readerService.revoke(id, body, user);
  }

  @Patch(':id')
  @Capabilities('devices.manage')
  updateReader(@Param('id') id: string, @Body() body: UpdateReaderDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.readerService.updateReader(id, body, user);
  }
}

@Controller('device-readers/android/provision')
export class DeviceReaderProvisionController {
  constructor(private readonly readerService: DeviceReaderService) {}

  @Post('complete')
  complete(@Body() body: AndroidProvisionCompleteDto) {
    return this.readerService.completeAndroidProvision(body);
  }
}
