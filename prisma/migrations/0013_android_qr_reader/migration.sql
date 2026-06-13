-- Android official QR reader foundation.
-- Backward-compatible: preserves SmartCard/RFID flow and legacy manual QR flow.

ALTER TYPE "ReaderType" ADD VALUE IF NOT EXISTS 'QR_ANDROID';
ALTER TYPE "DeviceReaderStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

DO $$
BEGIN
  CREATE TYPE "QrCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'LOST', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'HARDWARE', 'WEB');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AndroidReaderMode" AS ENUM ('GATE_IN', 'GATE_OUT', 'MUSHOLA', 'CHECK_ONLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "QrCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "codeCiphertext" TEXT,
  "shortCode" TEXT,
  "label" TEXT,
  "status" "QrCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "revokeReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "rotatedFromId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QrCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QrCredential_codeHash_key" ON "QrCredential"("codeHash");
CREATE INDEX IF NOT EXISTS "QrCredential_userId_status_idx" ON "QrCredential"("userId", "status");
CREATE INDEX IF NOT EXISTS "QrCredential_codeHash_idx" ON "QrCredential"("codeHash");
CREATE INDEX IF NOT EXISTS "QrCredential_status_expiresAt_idx" ON "QrCredential"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "QrCredential_createdById_createdAt_idx" ON "QrCredential"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "QrCredential_revokedById_revokedAt_idx" ON "QrCredential"("revokedById", "revokedAt");
CREATE INDEX IF NOT EXISTS "QrCredential_rotatedFromId_idx" ON "QrCredential"("rotatedFromId");

ALTER TABLE "QrCredential"
  ADD CONSTRAINT "QrCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrCredential"
  ADD CONSTRAINT "QrCredential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QrCredential"
  ADD CONSTRAINT "QrCredential_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QrCredential"
  ADD CONSTRAINT "QrCredential_rotatedFromId_fkey" FOREIGN KEY ("rotatedFromId") REFERENCES "QrCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeviceReader"
  ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "platform" "DevicePlatform",
  ADD COLUMN IF NOT EXISTS "appVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "appVersionCode" INTEGER,
  ADD COLUMN IF NOT EXISTS "allowedModes" "AndroidReaderMode"[] NOT NULL DEFAULT ARRAY[]::"AndroidReaderMode"[],
  ADD COLUMN IF NOT EXISTS "locationName" TEXT,
  ADD COLUMN IF NOT EXISTS "provisioningTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "provisioningExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provisionedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedById" TEXT,
  ADD COLUMN IF NOT EXISTS "revokedReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceReader_deviceId_key" ON "DeviceReader"("deviceId");
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceReader_provisioningTokenHash_key" ON "DeviceReader"("provisioningTokenHash");
CREATE INDEX IF NOT EXISTS "DeviceReader_deviceId_status_idx" ON "DeviceReader"("deviceId", "status");
CREATE INDEX IF NOT EXISTS "DeviceReader_platform_status_idx" ON "DeviceReader"("platform", "status");
CREATE INDEX IF NOT EXISTS "DeviceReader_lastSignedScanAt_idx" ON "DeviceReader"("lastSignedScanAt");

ALTER TABLE "DeviceReader"
  ADD CONSTRAINT "DeviceReader_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceReader"
  ADD CONSTRAINT "DeviceReader_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GateLog"
  ADD COLUMN IF NOT EXISTS "qrCredentialId" TEXT,
  ADD COLUMN IF NOT EXISTS "scanMode" "AndroidReaderMode",
  ADD COLUMN IF NOT EXISTS "appVersion" TEXT;

CREATE INDEX IF NOT EXISTS "GateLog_qrCredentialId_tappedAt_idx" ON "GateLog"("qrCredentialId", "tappedAt");
CREATE INDEX IF NOT EXISTS "GateLog_scanMode_tappedAt_idx" ON "GateLog"("scanMode", "tappedAt");

ALTER TABLE "GateLog"
  ADD CONSTRAINT "GateLog_qrCredentialId_fkey" FOREIGN KEY ("qrCredentialId") REFERENCES "QrCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrayerAttendanceLog"
  ADD COLUMN IF NOT EXISTS "qrCredentialId" TEXT,
  ADD COLUMN IF NOT EXISTS "scanMode" "AndroidReaderMode",
  ADD COLUMN IF NOT EXISTS "appVersion" TEXT;

CREATE INDEX IF NOT EXISTS "PrayerAttendanceLog_qrCredentialId_scannedAt_idx" ON "PrayerAttendanceLog"("qrCredentialId", "scannedAt");
CREATE INDEX IF NOT EXISTS "PrayerAttendanceLog_scanMode_scannedAt_idx" ON "PrayerAttendanceLog"("scanMode", "scannedAt");

ALTER TABLE "PrayerAttendanceLog"
  ADD CONSTRAINT "PrayerAttendanceLog_qrCredentialId_fkey" FOREIGN KEY ("qrCredentialId") REFERENCES "QrCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendancePolicy"
  ADD COLUMN IF NOT EXISTS "preferOfficialQrReader" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "legacyQrScanEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "MobileAndroidReaderVersion" (
  "id" INTEGER NOT NULL,
  "latestVersionName" TEXT NOT NULL DEFAULT '1.0.0',
  "latestVersionCode" INTEGER NOT NULL DEFAULT 1,
  "minSupportedVersionCode" INTEGER NOT NULL DEFAULT 1,
  "downloadUrl" TEXT,
  "releaseNotes" TEXT,
  "forceUpdate" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileAndroidReaderVersion_pkey" PRIMARY KEY ("id")
);

INSERT INTO "MobileAndroidReaderVersion" ("id", "latestVersionName", "latestVersionCode", "minSupportedVersionCode", "downloadUrl", "releaseNotes", "forceUpdate", "updatedById", "updatedAt")
VALUES (1, '1.0.0', 1, 1, NULL, 'Baseline APK Android official QR reader.', false, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
