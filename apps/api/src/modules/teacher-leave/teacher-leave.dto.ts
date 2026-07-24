import { TeacherLeaveStatus, TeacherLeaveType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTeacherLeaveDto {
  @IsEnum(TeacherLeaveType)
  type!: TeacherLeaveType;

  @Matches(DATE_ONLY_PATTERN)
  startDate!: string;

  @Matches(DATE_ONLY_PATTERN)
  endDate!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}

export class ReviewTeacherLeaveDto {
  @IsEnum(TeacherLeaveStatus)
  status!: TeacherLeaveStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string;

  @IsOptional()
  @IsString()
  substituteTeacherId?: string;
}

export class CancelTeacherLeaveDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  cancellationReason?: string;
}

export class RevokeTeacherLeaveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
