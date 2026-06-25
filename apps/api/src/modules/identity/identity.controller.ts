import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMPORT_FILE_INTERCEPTOR_OPTIONS, parseImportFile, type ImportUploadFile } from '../../common/import-file.parser';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto, ImportUserRowDto, ImportUsersDto, PermanentDeleteUserDto, UpdateMeDto, UpdateUserDto } from './identity.dto';
import { IdentityService } from './identity.service';

@Controller('identity')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get('users')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('users.read')
  listUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });

    return this.identityService.listUsers(pagination);
  }

  @Post('users')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('users.manage')
  createUser(@Body() body: CreateUserDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.identityService.createUser(body, user.sub, user.role);
  }

  @Patch('users/:id')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('users.manage')
  updateUser(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    return this.identityService.updateUser(id, body, user);
  }

  @Delete('users/:id')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('users.manage')
  deactivateUser(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: { sub: string; role: string }
  ) {
    return this.identityService.deactivateUser(id, user, body?.reason);
  }

  @Delete('users/:id/permanent')
  @Roles(Role.DEVELOPER)
  @Capabilities('users.manage')
  permanentlyDeleteUser(
    @Param('id') id: string,
    @Body() body: PermanentDeleteUserDto,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    return this.identityService.deleteUserPermanently(id, body, user);
  }

  @Post('users/import/preview')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('users.manage')
  previewUsersImport(@Body() body: ImportUsersDto) {
    return this.identityService.previewUsersImport(body.rows);
  }

  @Post('users/import/commit')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('users.manage')
  commitUsersImport(@Body() body: ImportUsersDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.identityService.commitUsersImport(body.rows, user);
  }

  @Post('users/import/file/preview')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('users.manage')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_INTERCEPTOR_OPTIONS))
  async previewUsersImportFile(@UploadedFile() file: ImportUploadFile) {
    const rows = await parseImportFile(file);
    return this.identityService.previewUsersImport(rows as unknown as ImportUserRowDto[]);
  }

  @Post('users/import/file/commit')
  @Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
  @Capabilities('users.manage')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_INTERCEPTOR_OPTIONS))
  async commitUsersImportFile(
    @UploadedFile() file: ImportUploadFile,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    const rows = await parseImportFile(file);
    return this.identityService.commitUsersImport(rows as unknown as ImportUserRowDto[], user);
  }

  @Get('me')
  @Roles(Role.ADMIN_TU, Role.KEPALA_SEKOLAH, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  @Capabilities('profile.self.read')
  me(@CurrentUser() user: { sub: string }) {
    return this.identityService.getMe(user.sub);
  }

  @Patch('me')
  @Roles(Role.ADMIN_TU, Role.KEPALA_SEKOLAH, Role.OPERATOR_IT, Role.GURU_MAPEL, Role.GURU_PIKET, Role.SISWA, Role.DEVELOPER)
  @Capabilities('profile.self.update')
  updateMe(@Body() body: UpdateMeDto, @CurrentUser() user: { sub: string }) {
    return this.identityService.updateMe(user.sub, body);
  }
}
