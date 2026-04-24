import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AcademicService } from './academic.service';
import { CreateClassDto, CreateStudentDto, CreateSubjectDto } from './academic.dto';

@Controller('academic')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_TU, Role.OPERATOR_IT)
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

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
}
