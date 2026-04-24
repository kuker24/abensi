import { DeviceReaderStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateReaderDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  locationLat?: number;

  @IsOptional()
  @IsNumber()
  locationLng?: number;
}

export class UpdateReaderStatusDto {
  @IsEnum(DeviceReaderStatus)
  status!: DeviceReaderStatus;
}
