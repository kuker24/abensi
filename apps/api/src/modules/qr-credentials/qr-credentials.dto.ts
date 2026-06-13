import { QrCredentialStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class GenerateQrCredentialDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RotateQrCredentialDto extends GenerateQrCredentialDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  reason?: string;
}

export class RevokeQrCredentialDto {
  @IsOptional()
  @IsEnum(QrCredentialStatus)
  status?: QrCredentialStatus;

  @IsString()
  @MinLength(10)
  reason!: string;
}

export class BulkGenerateQrCredentialDto extends GenerateQrCredentialDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsBoolean()
  onlyMissing?: boolean;

  @IsOptional()
  @IsEnum(QrCredentialStatus)
  replaceStatus?: QrCredentialStatus;
}
