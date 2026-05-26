-- Security anti-cheat hardening foundation.
-- Adds tamper-evident audit fields, revocable sessions, signed-reader metadata,
-- timeboxed override controls, correction events, and richer reconciliation evidence.

ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'OUT_TANPA_IN';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'IN_BERULANG';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'OUT_BERULANG';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'SCAN_DUPLIKAT';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'OUT_TERLALU_CEPAT';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'GATE_IN_TANPA_PRESENSI';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'PRESENSI_DI_LUAR_ROSTER';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'HADIR_VIA_OVERRIDE';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'KOREKSI_BERULANG';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'OVERRIDE_BERLEBIHAN';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'READER_ANOMALY';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'POLICY_CHANGED_DURING_ATTENDANCE';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'EXPORT_TIDAK_WAJAR';

DO $$
BEGIN
  CREATE TYPE "AttendanceOverrideScope" AS ENUM ('CLASS_ELIGIBILITY', 'ASHAR_CHECKOUT', 'GATE_IN', 'GATE_OUT', 'ALL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "OverrideApprovalStatus" AS ENUM ('APPROVED', 'PENDING_REVIEW', 'REJECTED', 'REVOKED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

ALTER TABLE "DeviceReader"
  ADD COLUMN IF NOT EXISTS "readerSecretCiphertext" TEXT,
  ADD COLUMN IF NOT EXISTS "readerSecretKeyVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "readerSecretRotatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSignedScanAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "DeviceReader_status_lastSeenAt_idx" ON "DeviceReader"("status", "lastSeenAt");

ALTER TABLE "GateLog"
  ADD COLUMN IF NOT EXISTS "readerId" TEXT,
  ADD COLUMN IF NOT EXISTS "cardId" TEXT,
  ADD COLUMN IF NOT EXISTS "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "nonceHash" TEXT,
  ADD COLUMN IF NOT EXISTS "bodyHash" TEXT,
  ADD COLUMN IF NOT EXISTS "manualReason" TEXT,
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "usedOverrideId" TEXT;

CREATE INDEX IF NOT EXISTS "GateLog_userId_direction_tappedAt_idx" ON "GateLog"("userId", "direction", "tappedAt");
CREATE INDEX IF NOT EXISTS "GateLog_readerId_tappedAt_idx" ON "GateLog"("readerId", "tappedAt");
CREATE INDEX IF NOT EXISTS "GateLog_signatureVerified_tappedAt_idx" ON "GateLog"("signatureVerified", "tappedAt");

ALTER TABLE "PrayerAttendanceLog"
  ADD COLUMN IF NOT EXISTS "readerId" TEXT,
  ADD COLUMN IF NOT EXISTS "cardId" TEXT,
  ADD COLUMN IF NOT EXISTS "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "nonceHash" TEXT,
  ADD COLUMN IF NOT EXISTS "bodyHash" TEXT,
  ADD COLUMN IF NOT EXISTS "usedOverrideId" TEXT;

CREATE INDEX IF NOT EXISTS "PrayerAttendanceLog_readerId_scannedAt_idx" ON "PrayerAttendanceLog"("readerId", "scannedAt");
CREATE INDEX IF NOT EXISTS "PrayerAttendanceLog_signatureVerified_scannedAt_idx" ON "PrayerAttendanceLog"("signatureVerified", "scannedAt");

ALTER TABLE "AuditEntry"
  ADD COLUMN IF NOT EXISTS "canonicalPayload" JSONB,
  ADD COLUMN IF NOT EXISTS "prevHash" TEXT,
  ADD COLUMN IF NOT EXISTS "entryHash" TEXT,
  ADD COLUMN IF NOT EXISTS "hashVersion" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "AuditEntry_actorId_action_createdAt_idx" ON "AuditEntry"("actorId", "action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEntry_entryHash_idx" ON "AuditEntry"("entryHash");

CREATE TABLE IF NOT EXISTS "AuditChainState" (
  "id" INTEGER NOT NULL,
  "lastHash" TEXT,
  "lastEntryId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuditChainState_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AuditChainState" ("id", "lastHash", "lastEntryId", "updatedAt")
VALUES (1, NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  "refreshTokenHash" TEXT,
  "userAgent" TEXT,
  "requestIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedReason" TEXT,
  "replacedById" TEXT,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "AuthSession_refreshTokenHash_idx" ON "AuthSession"("refreshTokenHash");
CREATE INDEX IF NOT EXISTS "AuthSession_createdAt_idx" ON "AuthSession"("createdAt");

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentAttendance"
  ADD COLUMN IF NOT EXISTS "evidenceLabel" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "usedOverrideId" TEXT,
  ADD COLUMN IF NOT EXISTS "correctionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "correctedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "correctedById" TEXT;

CREATE INDEX IF NOT EXISTS "StudentAttendance_usedOverrideId_idx" ON "StudentAttendance"("usedOverrideId");
CREATE INDEX IF NOT EXISTS "StudentAttendance_evidenceLabel_idx" ON "StudentAttendance"("evidenceLabel");

ALTER TABLE "AttendanceOverride" ALTER COLUMN "scope" DROP DEFAULT;
ALTER TABLE "AttendanceOverride" ALTER COLUMN "scope" TYPE "AttendanceOverrideScope"
USING (
  CASE
    WHEN "scope" IN ('CLASS_ELIGIBILITY', 'ASHAR_CHECKOUT', 'GATE_IN', 'GATE_OUT', 'ALL') THEN "scope"
    ELSE 'CLASS_ELIGIBILITY'
  END
)::"AttendanceOverrideScope";
ALTER TABLE "AttendanceOverride" ALTER COLUMN "scope" SET DEFAULT 'CLASS_ELIGIBILITY';

ALTER TABLE "AttendanceOverride"
  ADD COLUMN IF NOT EXISTS "status" "OverrideApprovalStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "approvedById" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedById" TEXT,
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

UPDATE "AttendanceOverride"
SET "expiresAt" = COALESCE("expiresAt", "date" + INTERVAL '1 day');

ALTER TABLE "AttendanceOverride" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "AttendanceOverride_studentId_date_scope_status_expiresAt_idx" ON "AttendanceOverride"("studentId", "date", "scope", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "AttendanceOverride_status_expiresAt_idx" ON "AttendanceOverride"("status", "expiresAt");

ALTER TABLE "AttendanceOverride"
  ADD CONSTRAINT "AttendanceOverride_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceOverride"
  ADD CONSTRAINT "AttendanceOverride_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentAttendance"
  ADD CONSTRAINT "StudentAttendance_usedOverrideId_fkey" FOREIGN KEY ("usedOverrideId") REFERENCES "AttendanceOverride"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "AttendanceCorrectionEvent" (
  "id" TEXT NOT NULL,
  "attendanceId" TEXT,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "beforeStatus" "StudentAttendanceStatus",
  "afterStatus" "StudentAttendanceStatus" NOT NULL,
  "beforeNote" TEXT,
  "afterNote" TEXT,
  "reason" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceCorrectionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AttendanceCorrectionEvent_sessionId_studentId_createdAt_idx" ON "AttendanceCorrectionEvent"("sessionId", "studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AttendanceCorrectionEvent_actorId_createdAt_idx" ON "AttendanceCorrectionEvent"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AttendanceCorrectionEvent_attendanceId_createdAt_idx" ON "AttendanceCorrectionEvent"("attendanceId", "createdAt");

ALTER TABLE "AttendanceCorrectionEvent"
  ADD CONSTRAINT "AttendanceCorrectionEvent_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "StudentAttendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionEvent"
  ADD CONSTRAINT "AttendanceCorrectionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionEvent"
  ADD CONSTRAINT "AttendanceCorrectionEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrectionEvent"
  ADD CONSTRAINT "AttendanceCorrectionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReconciliationFlag"
  ADD COLUMN IF NOT EXISTS "classId" TEXT,
  ADD COLUMN IF NOT EXISTS "evidence" JSONB,
  ADD COLUMN IF NOT EXISTS "recommendation" TEXT,
  ADD COLUMN IF NOT EXISTS "fingerprint" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationFlag_fingerprint_key" ON "ReconciliationFlag"("fingerprint");
CREATE INDEX IF NOT EXISTS "ReconciliationFlag_classId_status_idx" ON "ReconciliationFlag"("classId", "status");
CREATE INDEX IF NOT EXISTS "ReconciliationFlag_status_priority_type_createdAt_idx" ON "ReconciliationFlag"("status", "priority", "type", "createdAt");

ALTER TABLE "ReconciliationFlag"
  ADD CONSTRAINT "ReconciliationFlag_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
