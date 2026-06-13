import { TeacherLeaveStatus, TeacherLeaveType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTeacherLeaveDto {
  @IsEnum(TeacherLeaveType)
  type!: TeacherLeaveType;

  @IsISO8601()
  date!: string;

  @IsString()
  @MinLength(10)
  reason!: string;
}

export class ReviewTeacherLeaveDto {
  @IsEnum(TeacherLeaveStatus)
  status!: TeacherLeaveStatus;

  @IsOptional()
  @IsString()
  @MinLength(4)
  adminNote?: string;

  @IsOptional()
  @IsString()
  substituteTeacherId?: string;
}
