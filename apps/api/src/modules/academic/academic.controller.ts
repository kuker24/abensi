import { Body, Controller, Get, Header, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { AcademicService } from './academic.service';
import { CreateAcademicYearDto, CreateClassDto, CreateRoomDto, CreateSemesterDto, CreateStudentDto, CreateSubjectDto, ImportAcademicDto, ImportAcademicRowDto, ImportStudentsDto, ImportStudentRowDto, UpdateAcademicYearDto, UpdateClassDto, UpdateRoomDto, UpdateSemesterDto, UpdateSubjectDto } from './academic.dto';

@Controller('academic')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  @Get('years')
  @Capabilities('academic.read')
  listAcademicYears(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.academicService.listAcademicYears(pagination);
  }

  @Post('years')
  @Capabilities('academic.manage')
  createAcademicYear(@Body() body: CreateAcademicYearDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.createAcademicYear(body, user);
  }

  @Patch('years/:id')
  @Capabilities('academic.manage')
  updateAcademicYear(@Param('id') id: string, @Body() body: UpdateAcademicYearDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateAcademicYear(id, body, user);
  }

  @Get('semesters')
  @Capabilities('academic.read')
  listSemesters(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.academicService.listSemesters(pagination);
  }

  @Post('semesters')
  @Capabilities('academic.manage')
  createSemester(@Body() body: CreateSemesterDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.createSemester(body, user);
  }

  @Patch('semesters/:id')
  @Capabilities('academic.manage')
  updateSemester(@Param('id') id: string, @Body() body: UpdateSemesterDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateSemester(id, body, user);
  }

  @Get('rooms')
  @Capabilities('academic.read')
  listRooms(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.academicService.listRooms(pagination);
  }

  @Post('rooms')
  @Capabilities('academic.manage')
  createRoom(@Body() body: CreateRoomDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.createRoom(body, user);
  }

  @Patch('rooms/:id')
  @Capabilities('academic.manage')
  updateRoom(@Param('id') id: string, @Body() body: UpdateRoomDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateRoom(id, body, user);
  }

  @Get('import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Capabilities('academic.read')
  template(@Query('target') target?: string) {
    return this.academicService.importTemplate(target);
  }

  @Get('classes')
  @Capabilities('academic.read')
  listClasses(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });
    return this.academicService.listClasses(pagination);
  }

  @Post('classes')
  @Capabilities('academic.manage')
  createClass(@Body() body: CreateClassDto, @CurrentUser() user: { sub: string }) {
    return this.academicService.createClass(body, user.sub);
  }

  @Patch('classes/:id')
  @Capabilities('academic.manage')
  updateClass(@Param('id') id: string, @Body() body: UpdateClassDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateClass(id, body, user);
  }

  @Get('subjects')
  @Capabilities('academic.read')
  listSubjects(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });
    return this.academicService.listSubjects(pagination);
  }

  @Post('subjects')
  @Capabilities('academic.manage')
  createSubject(@Body() body: CreateSubjectDto, @CurrentUser() user: { sub: string }) {
    return this.academicService.createSubject(body, user.sub);
  }

  @Patch('subjects/:id')
  @Capabilities('academic.manage')
  updateSubject(@Param('id') id: string, @Body() body: UpdateSubjectDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateSubject(id, body, user);
  }

  @Get('students')
  @Capabilities('academic.read')
  listStudents(
    @Query('classId') classId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({
      page,
      limit,
      defaultLimit: 50,
      maxLimit: 200
    });
    return this.academicService.listStudents(pagination, classId);
  }

  @Post('enrollments')
  @Capabilities('academic.manage')
  enrollStudent(@Body() body: CreateStudentDto, @CurrentUser() user: { sub: string }) {
    return this.academicService.enrollStudent(body, user.sub);
  }

  @Post('students/import/preview')
  @Capabilities('academic.manage')
  previewStudentsImport(@Body() body: ImportStudentsDto) {
    return this.academicService.previewStudentsImport(body.rows);
  }

  @Post('students/import/commit')
  @Capabilities('academic.manage')
  commitStudentsImport(@Body() body: ImportStudentsDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.commitStudentsImport(body.rows, user);
  }

  @Post('students/import/file/preview')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_INTERCEPTOR_OPTIONS))
  @Capabilities('academic.manage')
  async previewStudentsImportFile(@UploadedFile() file: ImportUploadFile) {
    const rows = await parseImportFile(file);
    return this.academicService.previewStudentsImport(rows as unknown as ImportStudentRowDto[]);
  }

  @Post('students/import/file/commit')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_INTERCEPTOR_OPTIONS))
  @Capabilities('academic.manage')
  async commitStudentsImportFile(
    @UploadedFile() file: ImportUploadFile,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    const rows = await parseImportFile(file);
    return this.academicService.commitStudentsImport(rows as unknown as ImportStudentRowDto[], user);
  }

  @Post('import/preview')
  @Capabilities('academic.manage')
  previewImport(@Body() body: ImportAcademicDto) {
    return this.academicService.previewImport(body.rows);
  }

  @Post('import/commit')
  @Capabilities('academic.manage')
  commitImport(@Body() body: ImportAcademicDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.commitImport(body.rows, user);
  }

  @Post('import/file/preview')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_INTERCEPTOR_OPTIONS))
  @Capabilities('academic.manage')
  async previewImportFile(@UploadedFile() file: ImportUploadFile) {
    const rows = await parseImportFile(file);
    return this.academicService.previewImport(rows as unknown as ImportAcademicRowDto[]);
  }

  @Post('import/file/commit')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_INTERCEPTOR_OPTIONS))
  @Capabilities('academic.manage')
  async commitImportFile(
    @UploadedFile() file: ImportUploadFile,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    const rows = await parseImportFile(file);
    return this.academicService.commitImport(rows as unknown as ImportAcademicRowDto[], user);
  }
}
