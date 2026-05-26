import { Body, Controller, Get, Header, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { parseImportFile, type ImportUploadFile } from '../../common/import-file.parser';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AcademicService } from './academic.service';
import { CreateAcademicYearDto, CreateClassDto, CreateRoomDto, CreateSemesterDto, CreateStudentDto, CreateSubjectDto, ImportAcademicDto, ImportAcademicRowDto, ImportStudentsDto, ImportStudentRowDto, UpdateAcademicYearDto, UpdateClassDto, UpdateRoomDto, UpdateSemesterDto, UpdateSubjectDto } from './academic.dto';

@Controller('academic')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT, Role.DEVELOPER)
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  @Get('years')
  listAcademicYears(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.academicService.listAcademicYears(pagination);
  }

  @Post('years')
  createAcademicYear(@Body() body: CreateAcademicYearDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.createAcademicYear(body, user);
  }

  @Patch('years/:id')
  updateAcademicYear(@Param('id') id: string, @Body() body: UpdateAcademicYearDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateAcademicYear(id, body, user);
  }

  @Get('semesters')
  listSemesters(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.academicService.listSemesters(pagination);
  }

  @Post('semesters')
  createSemester(@Body() body: CreateSemesterDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.createSemester(body, user);
  }

  @Patch('semesters/:id')
  updateSemester(@Param('id') id: string, @Body() body: UpdateSemesterDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateSemester(id, body, user);
  }

  @Get('rooms')
  listRooms(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.academicService.listRooms(pagination);
  }

  @Post('rooms')
  createRoom(@Body() body: CreateRoomDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.createRoom(body, user);
  }

  @Patch('rooms/:id')
  updateRoom(@Param('id') id: string, @Body() body: UpdateRoomDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateRoom(id, body, user);
  }

  @Get('import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  template(@Query('target') target?: string) {
    return this.academicService.importTemplate(target);
  }

  @Get('classes')
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
  createClass(@Body() body: CreateClassDto, @CurrentUser() user: { sub: string }) {
    return this.academicService.createClass(body, user.sub);
  }

  @Patch('classes/:id')
  updateClass(@Param('id') id: string, @Body() body: UpdateClassDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateClass(id, body, user);
  }

  @Get('subjects')
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
  createSubject(@Body() body: CreateSubjectDto, @CurrentUser() user: { sub: string }) {
    return this.academicService.createSubject(body, user.sub);
  }

  @Patch('subjects/:id')
  updateSubject(@Param('id') id: string, @Body() body: UpdateSubjectDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.updateSubject(id, body, user);
  }

  @Get('students')
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
  enrollStudent(@Body() body: CreateStudentDto, @CurrentUser() user: { sub: string }) {
    return this.academicService.enrollStudent(body, user.sub);
  }

  @Post('students/import/preview')
  previewStudentsImport(@Body() body: ImportStudentsDto) {
    return this.academicService.previewStudentsImport(body.rows);
  }

  @Post('students/import/commit')
  commitStudentsImport(@Body() body: ImportStudentsDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.commitStudentsImport(body.rows, user);
  }

  @Post('students/import/file/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewStudentsImportFile(@UploadedFile() file: ImportUploadFile) {
    const rows = await parseImportFile(file);
    return this.academicService.previewStudentsImport(rows as unknown as ImportStudentRowDto[]);
  }

  @Post('students/import/file/commit')
  @UseInterceptors(FileInterceptor('file'))
  async commitStudentsImportFile(
    @UploadedFile() file: ImportUploadFile,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    const rows = await parseImportFile(file);
    return this.academicService.commitStudentsImport(rows as unknown as ImportStudentRowDto[], user);
  }

  @Post('import/preview')
  previewImport(@Body() body: ImportAcademicDto) {
    return this.academicService.previewImport(body.rows);
  }

  @Post('import/commit')
  commitImport(@Body() body: ImportAcademicDto, @CurrentUser() user: { sub: string; role: string }) {
    return this.academicService.commitImport(body.rows, user);
  }

  @Post('import/file/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewImportFile(@UploadedFile() file: ImportUploadFile) {
    const rows = await parseImportFile(file);
    return this.academicService.previewImport(rows as unknown as ImportAcademicRowDto[]);
  }

  @Post('import/file/commit')
  @UseInterceptors(FileInterceptor('file'))
  async commitImportFile(
    @UploadedFile() file: ImportUploadFile,
    @CurrentUser() user: { sub: string; role: string }
  ) {
    const rows = await parseImportFile(file);
    return this.academicService.commitImport(rows as unknown as ImportAcademicRowDto[], user);
  }
}
