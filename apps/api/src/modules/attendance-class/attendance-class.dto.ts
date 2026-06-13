import { StudentAttendanceStatus } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class SessionGeoDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class CloseSessionDto extends SessionGeoDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  earlyCheckoutReason?: string;
}

export class AttendanceItemDto {
  @IsString()
  studentId!: string;

  @IsEnum(StudentAttendanceStatus)
  status!: StudentAttendanceStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class BatchAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  items!: AttendanceItemDto[];
}

export class CorrectAttendanceDto {
  @IsEnum(StudentAttendanceStatus)
  status!: StudentAttendanceStatus;

  @IsString()
  @MinLength(10)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
