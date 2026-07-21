import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateSessionDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  teacherId!: string;

  @IsString()
  teachingAssignmentId!: string;

  @IsString()
  academicYearId!: string;

  @IsString()
  semesterId!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}

export class UpdateSessionScheduleDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}

export class CreateTeachingAssignmentDto {
  @IsString()
  teacherId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  classId!: string;

  @IsString()
  academicYearId!: string;

  @IsString()
  semesterId!: string;

  @IsDateString()
  @Matches(DATE_ONLY_PATTERN)
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  @Matches(DATE_ONLY_PATTERN)
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateTeachingAssignmentDto extends CreateTeachingAssignmentDto {}

export class CreateWeeklyScheduleDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  teacherId!: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsString()
  academicYearId!: string;

  @IsString()
  semesterId!: string;

  @IsString()
  teachingAssignmentId!: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @IsDateString()
  @Matches(DATE_ONLY_PATTERN)
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  @Matches(DATE_ONLY_PATTERN)
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWeeklyScheduleDto extends CreateWeeklyScheduleDto {}

export class GenerateSessionsDto {
  @IsDateString()
  @Matches(DATE_ONLY_PATTERN)
  from!: string;

  @IsDateString()
  @Matches(DATE_ONLY_PATTERN)
  to!: string;
}
