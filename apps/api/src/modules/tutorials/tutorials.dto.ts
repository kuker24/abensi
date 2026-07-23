import { Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CompleteTutorialDto {
  @IsString()
  @IsNotEmpty()
  version!: string;
}

export class DismissTutorialDto {
  @IsString()
  @IsNotEmpty()
  version!: string;
}

export class ActivateTutorialDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  reason?: string;

  @IsOptional()
  @IsString()
  version?: string;
}

export class ActivateTutorialByRoleDto extends ActivateTutorialDto {
  @IsEnum(Role)
  role!: Role;
}
