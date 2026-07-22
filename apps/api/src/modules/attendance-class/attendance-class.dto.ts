import { SessionJournalCompletionStatus, StudentAttendanceStatus } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsBoolean,
  IsISO8601,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SessionGeoDto {
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracyMeter?: number;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;

  @IsOptional()
  @IsIn(['browser_geolocation'])
  source?: 'browser_geolocation';
}

export class CloseSessionDto extends SessionGeoDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  earlyCheckoutReason?: string;

  @IsOptional()
  @IsBoolean()
  finalizeDefaultAlpa?: boolean;
}

export class UpsertSessionJournalDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  learningObjective!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  activity!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  lessonHours!: number;

  @IsEnum(SessionJournalCompletionStatus)
  completionStatus!: SessionJournalCompletionStatus;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;
}

export class AttendanceItemDto {
  @IsString()
  studentId!: string;

  @IsEnum(StudentAttendanceStatus)
  status!: StudentAttendanceStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsISO8601()
  updatedAt?: string;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class BatchAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  items!: AttendanceItemDto[];
}

export class RepairSessionRosterDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}

export class RecoverMissedSessionDto {
  @IsString()
  @MinLength(10)
  reason!: string;
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
