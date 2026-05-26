import { AndroidReaderMode, GateDirection, PrayerType, ReaderType } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class TapGateDto {
  @IsString()
  userId!: string;

  @IsEnum(GateDirection)
  direction!: GateDirection;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsDateString()
  tappedAt?: string;

  @IsString()
  @MinLength(15)
  reason!: string;
}

export class QrScanDto {
  @IsOptional()
  @IsString()
  cardUid?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  readerId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsEnum(ReaderType)
  readerType?: ReaderType;

  @IsOptional()
  @IsEnum(GateDirection)
  direction?: GateDirection;

  // Legacy/manual UI may still send this. Server ignores it for security and calculates prayer type from policy + server time.
  @IsOptional()
  @IsEnum(PrayerType)
  prayerType?: PrayerType;

  // Legacy/manual UI may still send this. Server ignores it for attendance decisions and uses server time.
  @IsOptional()
  @IsDateString()
  scannedAt?: string;

  @IsOptional()
  @IsString()
  overrideScope?: string;

  @IsOptional()
  @IsString()
  @MinLength(15)
  manualReason?: string;
}

export class ReaderScanDto {
  @IsString()
  cardUid!: string;

  @IsOptional()
  @IsEnum(GateDirection)
  direction?: GateDirection;
}

export class QrReaderScanDto {
  @IsOptional()
  @IsIn(['QR'])
  credentialType?: 'QR';

  @IsString()
  qrCode!: string;

  @IsEnum(AndroidReaderMode)
  mode!: AndroidReaderMode;

  @IsOptional()
  @IsDateString()
  clientScannedAt?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  appVersionCode?: number;
}

export class CreateAttendanceOverrideDto {
  @IsString()
  studentId!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  stepUpPassword?: string;

  @IsString()
  @MinLength(15)
  reason!: string;
}

export class ReviewAttendanceOverrideDto {
  @IsString()
  @MinLength(15)
  reason!: string;

  @IsOptional()
  @IsString()
  stepUpPassword?: string;
}

export class UpdateAttendancePolicyDto {
  @IsBoolean()
  requireStudentGateInBeforeClass!: boolean;

  @IsBoolean()
  requireStudentDhuha!: boolean;

  @IsBoolean()
  requireStudentDzuhur!: boolean;

  @IsBoolean()
  requireStudentAsharForAfternoon!: boolean;

  @IsBoolean()
  requireStudentClassEligibility!: boolean;

  @IsBoolean()
  requireTeacherGateIn!: boolean;

  @IsBoolean()
  requireTeacherGateOut!: boolean;

  @IsBoolean()
  requireStaffGateIn!: boolean;

  @IsBoolean()
  requireStaffGateOut!: boolean;

  @IsBoolean()
  allowManualOverride!: boolean;

  @IsBoolean()
  allowStudentAsharCheckoutOverride!: boolean;

  @IsString()
  dhuhaStartTime!: string;

  @IsString()
  dhuhaEndTime!: string;

  @IsString()
  dzuhurStartTime!: string;

  @IsString()
  dzuhurEndTime!: string;

  @IsString()
  asharStartTime!: string;

  @IsString()
  asharEndTime!: string;

  @IsString()
  asharRequiredClassEndTime!: string;

  @IsInt()
  @Min(0)
  @Max(60)
  duplicateScanWindowMinutes!: number;

  @IsOptional()
  @IsBoolean()
  preferOfficialQrReader?: boolean;

  @IsOptional()
  @IsBoolean()
  legacyQrScanEnabled?: boolean;

  @IsOptional()
  @IsString()
  stepUpPassword?: string;
}
