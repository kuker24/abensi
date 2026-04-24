import { CardStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSmartCardDto {
  @IsString()
  @MinLength(4)
  uid!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEnum(CardStatus)
  status?: CardStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateSmartCardDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  uid?: string;

  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsOptional()
  @IsEnum(CardStatus)
  status?: CardStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
