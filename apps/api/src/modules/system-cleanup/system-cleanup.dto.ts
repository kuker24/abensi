import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
