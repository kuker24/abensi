import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateAndroidReaderVersionDto } from './mobile-android.dto';
import { MobileAndroidService } from './mobile-android.service';

@Controller('mobile/android-reader')
export class MobileAndroidPublicController {
  constructor(private readonly service: MobileAndroidService) {}

  @Get('version')
  version() {
    return this.service.getAndroidReaderVersion();
  }
}

@Controller('mobile/android-reader')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class MobileAndroidAdminController {
  constructor(private readonly service: MobileAndroidService) {}

  @Put('version')
  @Capabilities('devices.manage')
  updateVersion(@Body() body: UpdateAndroidReaderVersionDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.updateAndroidReaderVersion(body, user);
  }
}
