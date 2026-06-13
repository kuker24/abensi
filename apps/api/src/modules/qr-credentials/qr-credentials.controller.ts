import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BulkGenerateQrCredentialDto, GenerateQrCredentialDto, RevokeQrCredentialDto, RotateQrCredentialDto } from './qr-credentials.dto';
import { QrCredentialsService } from './qr-credentials.service';

@Controller('qr-credentials')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class QrCredentialsController {
  constructor(private readonly service: QrCredentialsService) {}

  @Get('users/:userId')
  @Capabilities('devices.manage')
  listForUser(@Param('userId') userId: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.listForUser(userId, parsePagination({ page, limit, defaultLimit: 20, maxLimit: 100 }));
  }

  @Post('users/:userId/generate')
  @Capabilities('devices.manage')
  generate(@Param('userId') userId: string, @Body() body: GenerateQrCredentialDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.generateForUser(userId, body, user);
  }

  @Post('users/:userId/rotate')
  @Capabilities('devices.manage')
  rotate(@Param('userId') userId: string, @Body() body: RotateQrCredentialDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.rotateForUser(userId, body, user);
  }

  @Post(':id/revoke')
  @Capabilities('devices.manage')
  revoke(@Param('id') id: string, @Body() body: RevokeQrCredentialDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.revoke(id, body, user);
  }

  @Post('bulk-generate')
  @Capabilities('devices.manage')
  bulkGenerate(@Body() body: BulkGenerateQrCredentialDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.bulkGenerate(body, user);
  }

  @Get('readiness')
  @Capabilities('devices.manage')
  readiness(@Query('classId') classId?: string) {
    return this.service.readiness({ classId });
  }

  @Get('export/cards')
  @Header('Cache-Control', 'no-store')
  @Capabilities('devices.manage')
  exportCards() {
    return this.service.exportCards({});
  }

  @Get('export/class/:classId/cards')
  @Header('Cache-Control', 'no-store')
  @Capabilities('devices.manage')
  exportClassCards(@Param('classId') classId: string) {
    return this.service.exportCards({ classId });
  }

  @Get('export/users/:userId/card')
  @Header('Cache-Control', 'no-store')
  @Capabilities('devices.manage')
  exportUserCard(@Param('userId') userId: string) {
    return this.service.exportCards({ userId });
  }
}
