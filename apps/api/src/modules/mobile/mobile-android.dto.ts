import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateAndroidReaderVersionDto {
  @IsString()
  latestVersionName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  latestVersionCode!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  minSupportedVersionCode!: number;

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  forceUpdate!: boolean;
}

export class CreateAndroidApkReleaseDto {
  @IsString()
  @MaxLength(40)
  versionName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  versionCode!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  minSupportedVersionCode!: number;

  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  forceUpdate!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  releaseNotes?: string;
}

export class UpdateAndroidApkReleaseDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minSupportedVersionCode?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  forceUpdate?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  releaseNotes?: string;
}
