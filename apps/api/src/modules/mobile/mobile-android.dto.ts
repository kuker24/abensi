import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateAndroidReaderVersionDto {
  @IsString()
  latestVersionName!: string;

  @IsInt()
  @Min(1)
  latestVersionCode!: number;

  @IsInt()
  @Min(1)
  minSupportedVersionCode!: number;

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @IsBoolean()
  forceUpdate!: boolean;
}
