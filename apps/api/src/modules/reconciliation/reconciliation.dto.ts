import { IsString, MinLength } from 'class-validator';

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
