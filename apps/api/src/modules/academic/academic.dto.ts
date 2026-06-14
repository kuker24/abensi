import { IsArray, IsBoolean, IsISO8601, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClassDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsString()
  yearLabel!: string;
}

export class CreateStudentDto {
  @IsString()
  userId!: string;

  @IsString()
  classId!: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  semesterId?: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  yearLabel?: string;
}

export class CreateSubjectDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;
}

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class ImportAcademicRowDto {
  @IsString()
  type!: 'class' | 'subject' | 'enrollment';

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  yearLabel?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  classCode?: string;
}

export class ImportAcademicDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportAcademicRowDto)
  rows!: ImportAcademicRowDto[];
}

export class ImportStudentRowDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  classCode?: string;

  @IsOptional()
  @IsString()
  className?: string;

  @IsOptional()
  @IsString()
  yearLabel?: string;
}

export class ImportStudentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  rows!: ImportStudentRowDto[];
}

export class CreateAcademicYearDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateAcademicYearDto extends CreateAcademicYearDto {}

export class CreateSemesterDto {
  @IsString()
  academicYearId!: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSemesterDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateRoomDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
