import { GateDirection } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class TapGateDto {
  @IsString()
  userId!: string;

  @IsEnum(GateDirection)
  direction!: GateDirection;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsDateString()
  tappedAt?: string;
}
