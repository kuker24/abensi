import { IsString } from 'class-validator';

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
}

export class CreateSubjectDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;
}
