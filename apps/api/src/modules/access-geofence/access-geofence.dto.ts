import { IsBoolean, IsInt, IsLatitude, IsLongitude, Max, Min } from 'class-validator';

export class UpdateGeofenceDto {
  @IsLatitude()
  centerLat!: number;

  @IsLongitude()
  centerLng!: number;

  @IsInt()
  @Min(25)
  @Max(2000)
  radiusMeter!: number;

  @IsBoolean()
  enforceSessionOpen!: boolean;

  @IsInt()
  @Min(0)
  @Max(120)
  arrivalGraceMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(180)
  autoMissedGraceMinutes!: number;

  @IsBoolean()
  requireGateTapForOpen!: boolean;

  @IsBoolean()
  allowPicketOverride!: boolean;
}
