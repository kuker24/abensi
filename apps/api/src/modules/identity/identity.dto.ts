import { CardStatus, Role } from '@prisma/client';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
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

export class GenerateAccountSlipsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  userIds!: string[];

  @IsString()
  @MinLength(10)
  reason!: string;

  @IsOptional()
  @IsBoolean()
  revokeSessions?: boolean;
}

export class PreviewAccountDeleteDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  userIds!: string[];
}

export class DeleteAccountsDto extends PreviewAccountDeleteDto {
  @IsString()
  @MinLength(10)
  reason!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  pin!: string;

  @IsString()
  confirmText!: string;

  @IsOptional()
  @IsIn(['auto', 'archive-only', 'hard-delete-only-if-safe'])
  mode?: 'auto' | 'archive-only' | 'hard-delete-only-if-safe';
}

export class ConfigureAccountDeletePinDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^\d{4,12}$/)
  pin!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  confirmPin!: string;

  @IsString()
  @MinLength(10)
  reason!: string;
}

export class UpdateMeDto {
  @IsString()
  @MinLength(3)
  fullName!: string;
}
