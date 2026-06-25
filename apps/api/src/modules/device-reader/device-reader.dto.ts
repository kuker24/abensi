import { AndroidReaderMode, DevicePlatform, DeviceReaderStatus, ReaderType } from '@prisma/client';
import { ArrayMaxSize, ArrayUnique, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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

  // Backward-compatible only: QR_ANDROID provisioning ignores client-requested
  // modes and always uses backend flexible defaults.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allowedModes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
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

export class AndroidReaderStatusDto {
  @IsInt()
  @Min(0)
  @Max(100000)
  pendingQueueCount!: number;

  @IsOptional()
  @IsDateString()
  lastQueueFlushAt?: string;

  @IsOptional()
  @IsEnum(AndroidReaderMode)
  currentMode?: AndroidReaderMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  networkStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  statusMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  appVersionCode?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  warnings?: string[];
}

export class RevokeReaderDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
