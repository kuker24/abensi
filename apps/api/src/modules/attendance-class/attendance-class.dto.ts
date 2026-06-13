import { StudentAttendanceStatus } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

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
