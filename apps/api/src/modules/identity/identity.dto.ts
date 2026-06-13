import { CardStatus, Role } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @IsString()
  username!: string;

  @IsString()
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  @IsEnum(CardStatus)
  cardStatus: CardStatus = CardStatus.ACTIVE;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(CardStatus)
  cardStatus?: CardStatus;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(10)
  reason?: string;
}

export class ImportUserRowDto {
  @IsString()
  username!: string;

  @IsString()
  fullName!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  password?: string;
}

export class ImportUsersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportUserRowDto)
  rows!: ImportUserRowDto[];
}

export class PermanentDeleteUserDto {
  @IsString()
  confirmUsername!: string;

  @IsString()
  @MinLength(10)
  reason!: string;
}

export class UpdateMeDto {
  @IsString()
  @MinLength(3)
  fullName!: string;
}
