import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateAndroidApkReleaseDto, UpdateAndroidApkReleaseDto, UpdateAndroidReaderVersionDto } from './mobile-android.dto';
import { ApkUploadFile, MobileAndroidService } from './mobile-android.service';

const APK_UPLOAD_OPTIONS = {
  limits: {
    fileSize: Number(process.env.ANDROID_APK_MAX_BYTES || String(150 * 1024 * 1024)),
    files: 1
  }
};

function pagination(page?: string, limit?: string) {
  return parsePagination({ page, limit, defaultLimit: 20, maxLimit: 100 });
}

function attachmentName(name: string) {
  return String(name || 'schoolhub-reader.apk').replace(/[^0-9A-Za-z._-]/g, '-').slice(0, 120) || 'schoolhub-reader.apk';
}

@Controller('mobile/android-reader')
export class MobileAndroidPublicController {
  constructor(private readonly service: MobileAndroidService) {}

  @Get('version')
  version() {
    return this.service.getAndroidReaderVersion();
  }

  @Get('releases/:id/download')
  @Header('Content-Type', 'application/vnd.android.package-archive')
  async downloadRelease(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const download = await this.service.downloadApkRelease(id);
    response.setHeader('Content-Disposition', `attachment; filename="${attachmentName(download.fileName)}"`);
    response.setHeader('X-APK-SHA256', download.release.apkSha256);
    response.setHeader('Content-Length', String(download.release.apkSizeBytes));
    return download.stream;
  }

  @Get('apk/latest')
  @Header('Content-Type', 'application/vnd.android.package-archive')
  async downloadLatest(@Res({ passthrough: true }) response: Response) {
    const download = await this.service.downloadLatestApk();
    response.setHeader('Content-Disposition', `attachment; filename="${attachmentName(download.fileName)}"`);
    response.setHeader('X-APK-SHA256', download.release.apkSha256);
    response.setHeader('Content-Length', String(download.release.apkSizeBytes));
    return download.stream;
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

@Controller('admin/android-apk-releases')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class AndroidApkReleaseAdminController {
  constructor(private readonly service: MobileAndroidService) {}

  @Get()
  @Capabilities('devices.read')
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.listApkReleases(pagination(page, limit));
  }

  @Post()
  @Capabilities('devices.manage')
  @UseInterceptors(FileInterceptor('apk', APK_UPLOAD_OPTIONS))
  create(
    @Body() body: CreateAndroidApkReleaseDto,
    @UploadedFile() file: ApkUploadFile | undefined,
    @CurrentUser() user: { sub: string; role: Role }
  ) {
    return this.service.createApkRelease(body, file, user);
  }

  @Patch(':id')
  @Capabilities('devices.manage')
  update(@Param('id') id: string, @Body() body: UpdateAndroidApkReleaseDto, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.updateApkRelease(id, body, user);
  }

  @Post(':id/publish')
  @Capabilities('devices.manage')
  publish(@Param('id') id: string, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.publishApkRelease(id, user);
  }

  @Post(':id/unpublish')
  @Capabilities('devices.manage')
  unpublish(@Param('id') id: string, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.unpublishApkRelease(id, user);
  }

  @Delete(':id')
  @Capabilities('devices.manage')
  delete(@Param('id') id: string, @CurrentUser() user: { sub: string; role: Role }) {
    return this.service.deleteApkRelease(id, user);
  }
}
