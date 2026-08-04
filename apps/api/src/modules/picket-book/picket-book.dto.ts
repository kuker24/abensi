import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

function emptyToUndefined({ value }: { value: unknown }) {
  if (value === '' || value === undefined || value === null) return undefined;
  return value;
}

export class CreatePicketNoteDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(5)
  body!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['INFO', 'WARN', 'URGENT'])
  severity?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  studentId?: string;
}

export class UpdatePicketNoteDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  body?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['INFO', 'WARN', 'URGENT'])
  severity?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(10)
  reason?: string;

  /** null clears student link; omit leaves unchanged */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  studentId?: string | null;
}
