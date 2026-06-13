import { ReconciliationPriority, ReconciliationReviewStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class ResolveFlagDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}

export class EscalateFlagDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}

export class UpdateFlagWorkflowDto {
  @IsOptional()
  @IsEnum(ReconciliationReviewStatus)
  reviewStatus?: ReconciliationReviewStatus;

  @IsOptional()
  @IsEnum(ReconciliationPriority)
  priority?: ReconciliationPriority;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  followUpNote?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}
