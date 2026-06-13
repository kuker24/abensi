-- Adaptive QR attendance for gate, mushola, and class eligibility.
-- Safe additions only: new enums, nullable/defaulted columns, and new tables.

CREATE TYPE "ReaderType" AS ENUM ('GATE', 'MUSHOLA', 'CLASS', 'MANUAL');
CREATE TYPE "PrayerType" AS ENUM ('DHUHA', 'DZUHUR');

ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'BELUM_SCAN_GERBANG';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'BELUM_SCAN_DHUHA';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'BELUM_SCAN_DZUHUR';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'BELUM_SCAN_KELUAR_GERBANG';

ALTER TABLE "DeviceReader" ADD COLUMN "type" "ReaderType" NOT NULL DEFAULT 'GATE';
ALTER TABLE "DeviceReader" ADD COLUMN "locationLabel" TEXT;

CREATE TABLE "AttendancePolicy" (
  "id" INTEGER NOT NULL,
  "requireStudentGateInBeforeClass" BOOLEAN NOT NULL DEFAULT true,
  "requireStudentDhuha" BOOLEAN NOT NULL DEFAULT true,
  "requireStudentDzuhur" BOOLEAN NOT NULL DEFAULT true,
  "requireStudentClassEligibility" BOOLEAN NOT NULL DEFAULT true,
  "requireTeacherGateIn" BOOLEAN NOT NULL DEFAULT true,
  "requireTeacherGateOut" BOOLEAN NOT NULL DEFAULT true,
  "requireStaffGateIn" BOOLEAN NOT NULL DEFAULT true,
  "requireStaffGateOut" BOOLEAN NOT NULL DEFAULT true,
  "allowManualOverride" BOOLEAN NOT NULL DEFAULT true,
  "dhuhaStartTime" TEXT NOT NULL DEFAULT '07:00',
  "dhuhaEndTime" TEXT NOT NULL DEFAULT '10:30',
  "dzuhurStartTime" TEXT NOT NULL DEFAULT '11:45',
  "dzuhurEndTime" TEXT NOT NULL DEFAULT '13:30',
  "duplicateScanWindowMinutes" INTEGER NOT NULL DEFAULT 5,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrayerAttendanceLog" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "prayerType" "PrayerType" NOT NULL,
  "attendanceDate" TIMESTAMP(3) NOT NULL,
  "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deviceId" TEXT,
  "source" "ReaderType" NOT NULL DEFAULT 'MUSHOLA',
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrayerAttendanceLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceOverride" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'CLASS_ELIGIBILITY',
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrayerAttendanceLog_studentId_prayerType_attendanceDate_key" ON "PrayerAttendanceLog"("studentId", "prayerType", "attendanceDate");
CREATE INDEX "PrayerAttendanceLog_attendanceDate_prayerType_idx" ON "PrayerAttendanceLog"("attendanceDate", "prayerType");
CREATE INDEX "PrayerAttendanceLog_studentId_scannedAt_idx" ON "PrayerAttendanceLog"("studentId", "scannedAt");
CREATE INDEX "PrayerAttendanceLog_deviceId_scannedAt_idx" ON "PrayerAttendanceLog"("deviceId", "scannedAt");

CREATE UNIQUE INDEX "AttendanceOverride_studentId_date_scope_key" ON "AttendanceOverride"("studentId", "date", "scope");
CREATE INDEX "AttendanceOverride_date_scope_idx" ON "AttendanceOverride"("date", "scope");
CREATE INDEX "AttendanceOverride_createdById_createdAt_idx" ON "AttendanceOverride"("createdById", "createdAt");

CREATE INDEX "DeviceReader_type_status_idx" ON "DeviceReader"("type", "status");

ALTER TABLE "PrayerAttendanceLog" ADD CONSTRAINT "PrayerAttendanceLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrayerAttendanceLog" ADD CONSTRAINT "PrayerAttendanceLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceOverride" ADD CONSTRAINT "AttendanceOverride_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceOverride" ADD CONSTRAINT "AttendanceOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AttendancePolicy" (
  "id",
  "requireStudentGateInBeforeClass",
  "requireStudentDhuha",
  "requireStudentDzuhur",
  "requireStudentClassEligibility",
  "requireTeacherGateIn",
  "requireTeacherGateOut",
  "requireStaffGateIn",
  "requireStaffGateOut",
  "allowManualOverride",
  "dhuhaStartTime",
  "dhuhaEndTime",
  "dzuhurStartTime",
  "dzuhurEndTime",
  "duplicateScanWindowMinutes",
  "updatedAt"
) VALUES (1, true, true, true, true, true, true, true, true, true, '07:00', '10:30', '11:45', '13:30', 5, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
