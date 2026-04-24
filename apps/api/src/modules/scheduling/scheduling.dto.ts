import { IsDateString, IsString } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  teacherId!: string;

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
