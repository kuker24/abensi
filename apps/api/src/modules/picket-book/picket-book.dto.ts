import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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
}
