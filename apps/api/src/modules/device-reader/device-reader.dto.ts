import { AndroidReaderMode, DevicePlatform, DeviceReaderStatus, ReaderType } from '@prisma/client';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateReaderDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(ReaderType)
  type?: ReaderType;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  appVersionCode?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AndroidReaderMode, { each: true })
  allowedModes?: AndroidReaderMode[];

  @IsOptional()
  @IsString()
  locationLabel?: string;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsNumber()
  locationLat?: number;

  @IsOptional()
  @IsNumber()
  locationLng?: number;
}

export class RotateReaderKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  stepUpPassword?: string;
}

export class UpdateReaderStatusDto {
  @IsEnum(DeviceReaderStatus)
  status!: DeviceReaderStatus;
}

export class UpdateReaderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  locationLabel?: string;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsNumber()
  locationLat?: number;

  @IsOptional()
  @IsNumber()
  locationLng?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AndroidReaderMode, { each: true })
  allowedModes?: AndroidReaderMode[];

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  appVersionCode?: number;
}

export class AndroidProvisionStartDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AndroidReaderMode, { each: true })
  allowedModes?: AndroidReaderMode[];

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInMinutes?: number;
}

export class AndroidProvisionCompleteDto {
  @IsString()
  provisionToken!: string;

  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  appVersionCode?: number;
}

export class RevokeReaderDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
