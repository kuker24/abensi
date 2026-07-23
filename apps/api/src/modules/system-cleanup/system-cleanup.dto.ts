import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class SystemCleanupRunDto {
  @IsOptional()
  @IsBoolean()
  inactiveTestUsers?: boolean;

  @IsOptional()
  @IsBoolean()
  inactiveUserCards?: boolean;

  @IsOptional()
  @IsBoolean()
  readNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  staleTutorialStates?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  olderThanDays?: number;

  @IsString()
  @MinLength(10)
  reason!: string;
}

export class PilotCleanupPreviewDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class PilotCleanupRunDto extends PilotCleanupPreviewDto {
  @IsString()
  @MinLength(10)
  reason!: string;

  @IsString()
  confirmText!: string;
}
