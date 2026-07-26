import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Role, TeacherLeaveStatus } from '@prisma/client';
import { parsePagination } from '../../common/pagination';
import { CurrentUser } from '../../common/current-user.decorator';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Capabilities } from '../../common/capabilities.decorator';
import { CapabilitiesGuard } from '../../common/capabilities.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { leaveAttachmentMaxBytes, LeaveAttachmentKind, LeaveUploadFile } from './leave-attachment-storage';
import {
  CancelTeacherLeaveDto,
  CreateTeacherLeaveDto,
  ReviewTeacherLeaveDto,
  RevokeTeacherLeaveDto,
  SignTeacherLeaveDocumentDto
} from './teacher-leave.dto';
import { TeacherLeaveService } from './teacher-leave.service';

const APPLICANT_ROLES = [Role.ADMIN_TU, Role.KEPALA_SEKOLAH, Role.GURU_MAPEL, Role.GURU_PIKET, Role.OPERATOR_IT] as const;
const REVIEWER_ROLES = [Role.ADMIN_TU, Role.KEPALA_SEKOLAH] as const;

const LEAVE_UPLOAD_OPTIONS = {
  limits: {
    fileSize: leaveAttachmentMaxBytes(),
    files: 2
  }
};

@Controller('teacher-leaves')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilitiesGuard)
export class TeacherLeaveController {
  constructor(private readonly teacherLeaveService: TeacherLeaveService) {}

  @Get('me')
  @Roles(...APPLICANT_ROLES)
  @Capabilities('leave.self.manage')
  listMine(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('status') status?: TeacherLeaveStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.teacherLeaveService.listMine(user, pagination, status);
  }

  @Post()
  @Roles(...APPLICANT_ROLES)
  @Capabilities('leave.self.manage')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'medicalLetter', maxCount: 1 },
        { name: 'medicinePhoto', maxCount: 1 }
      ],
      LEAVE_UPLOAD_OPTIONS
    )
  )
  create(
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: CreateTeacherLeaveDto,
    @UploadedFiles()
    files?: {
      medicalLetter?: LeaveUploadFile[];
      medicinePhoto?: LeaveUploadFile[];
    }
  ) {
    return this.teacherLeaveService.create(user, body, {
      medicalLetter: files?.medicalLetter?.[0],
      medicinePhoto: files?.medicinePhoto?.[0]
    });
  }

  @Patch(':id/cancel')
  @Roles(...APPLICANT_ROLES)
  @Capabilities('leave.self.manage')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: CancelTeacherLeaveDto
  ) {
    return this.teacherLeaveService.cancel(id, user, body);
  }

  @Get('review')
  @Roles(...REVIEWER_ROLES)
  @Capabilities('leave.review')
  listForReview(
    @CurrentUser() user: { sub: string; role: Role },
    @Query('status') status?: TeacherLeaveStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const pagination = parsePagination({ page, limit, defaultLimit: 50, maxLimit: 200 });
    return this.teacherLeaveService.listForReview(user, pagination, status);
  }

  @Patch(':id/review')
  @Roles(...REVIEWER_ROLES)
  @Capabilities('leave.review')
  review(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: ReviewTeacherLeaveDto
  ) {
    return this.teacherLeaveService.review(id, user, body);
  }

  @Patch(':id/revoke')
  @Roles(...REVIEWER_ROLES)
  @Capabilities('leave.review')
  revoke(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: RevokeTeacherLeaveDto
  ) {
    return this.teacherLeaveService.revoke(id, user, body);
  }

  @Get(':id/letter.pdf')
  @Roles(...APPLICANT_ROLES, ...REVIEWER_ROLES)
  @Header('Content-Type', 'application/pdf')
  async letterPdf(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Res({ passthrough: true }) response: Response
  ) {
    const letter = await this.teacherLeaveService.getLetterPdf(id, user);
    response.setHeader('Content-Disposition', `attachment; filename="${letter.filename}"`);
    response.setHeader('Content-Length', String(letter.buffer.length));
    return letter.buffer;
  }

  @Get(':id/attachments/:kind')
  @Roles(...APPLICANT_ROLES, ...REVIEWER_ROLES)
  attachment(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @CurrentUser() user: { sub: string; role: Role }
  ) {
    if (kind !== 'medical-letter' && kind !== 'medicine-photo') {
      throw new BadRequestException('Jenis lampiran tidak valid.');
    }
    return this.teacherLeaveService.getAttachment(id, kind as LeaveAttachmentKind, user);
  }

  @Patch(':id/document-sign')
  @Roles(...REVIEWER_ROLES)
  @Capabilities('leave.review')
  signDocument(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: Role },
    @Body() body: SignTeacherLeaveDocumentDto
  ) {
    return this.teacherLeaveService.signDocument(id, user, body);
  }
}
