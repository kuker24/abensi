-- Add effective-dated enrollment metadata, immutable session rosters, and
-- explicit attendance review state so default ALPA is not treated as reviewed.

CREATE TYPE "AttendanceReviewState" AS ENUM ('DEFAULTED', 'CONFIRMED', 'CORRECTED');
CREATE TYPE "AttendanceConfirmationSource" AS ENUM ('MANUAL_SINGLE', 'MANUAL_BULK', 'FINALIZED_DEFAULT', 'CORRECTION', 'SYSTEM_BACKFILL');
CREATE TYPE "RosterCaptureSource" AS ENUM ('GENERATED', 'OPENED', 'BACKFILL');

ALTER TABLE "ClassEnrollment"
  ADD COLUMN "academicYearId" TEXT,
  ADD COLUMN "semesterId" TEXT,
  ADD COLUMN "effectiveFrom" DATE,
  ADD COLUMN "effectiveTo" DATE,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "endedById" TEXT,
  ADD COLUMN "endedReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "ClassEnrollment"
SET "effectiveFrom" = COALESCE(("createdAt" AT TIME ZONE 'UTC')::date, CURRENT_DATE),
    "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "effectiveFrom" IS NULL OR "updatedAt" IS NULL;

ALTER TABLE "ClassEnrollment"
  ALTER COLUMN "effectiveFrom" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE INDEX "ClassEnrollment_studentId_active_effectiveFrom_effectiveTo_idx" ON "ClassEnrollment"("studentId", "active", "effectiveFrom", "effectiveTo");
CREATE INDEX "ClassEnrollment_classId_active_effectiveFrom_effectiveTo_idx" ON "ClassEnrollment"("classId", "active", "effectiveFrom", "effectiveTo");
CREATE INDEX "ClassEnrollment_academicYearId_idx" ON "ClassEnrollment"("academicYearId");
CREATE INDEX "ClassEnrollment_semesterId_idx" ON "ClassEnrollment"("semesterId");

ALTER TABLE "StudentAttendance"
  ADD COLUMN "reviewState" "AttendanceReviewState" NOT NULL DEFAULT 'DEFAULTED',
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT,
  ADD COLUMN "confirmationSource" "AttendanceConfirmationSource";

UPDATE "StudentAttendance"
SET "reviewState" = CASE WHEN "evidenceLabel" = 'corrected' OR "correctionCount" > 0 THEN 'CORRECTED'::"AttendanceReviewState" ELSE 'CONFIRMED'::"AttendanceReviewState" END,
    "confirmedAt" = COALESCE("correctedAt", "updatedAt", "createdAt"),
    "confirmedById" = "correctedById",
    "confirmationSource" = CASE WHEN "evidenceLabel" = 'corrected' OR "correctionCount" > 0 THEN 'CORRECTION'::"AttendanceConfirmationSource" ELSE 'SYSTEM_BACKFILL'::"AttendanceConfirmationSource" END
WHERE "confirmationSource" IS NULL;

CREATE INDEX "StudentAttendance_reviewState_idx" ON "StudentAttendance"("reviewState");
CREATE INDEX "StudentAttendance_confirmedById_idx" ON "StudentAttendance"("confirmedById");

CREATE TABLE "SessionRoster" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "enrollmentId" TEXT,
  "studentNameSnapshot" TEXT NOT NULL,
  "studentUsernameSnapshot" TEXT NOT NULL,
  "classIdSnapshot" TEXT NOT NULL,
  "classCodeSnapshot" TEXT NOT NULL,
  "classNameSnapshot" TEXT NOT NULL,
  "academicYearIdSnapshot" TEXT,
  "academicYearNameSnapshot" TEXT,
  "semesterIdSnapshot" TEXT,
  "semesterNameSnapshot" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "captureSource" "RosterCaptureSource" NOT NULL,
  "activeAtCapture" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  CONSTRAINT "SessionRoster_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SessionRoster_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SessionRoster_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SessionRoster_sessionId_studentId_key" ON "SessionRoster"("sessionId", "studentId");
CREATE INDEX "SessionRoster_studentId_idx" ON "SessionRoster"("studentId");
CREATE INDEX "SessionRoster_enrollmentId_idx" ON "SessionRoster"("enrollmentId");
CREATE INDEX "SessionRoster_classIdSnapshot_idx" ON "SessionRoster"("classIdSnapshot");
CREATE INDEX "SessionRoster_captureSource_idx" ON "SessionRoster"("captureSource");

-- Prefer existing attendance evidence for historical sessions.
INSERT INTO "SessionRoster" (
  "id", "sessionId", "studentId", "enrollmentId", "studentNameSnapshot", "studentUsernameSnapshot",
  "classIdSnapshot", "classCodeSnapshot", "classNameSnapshot", "academicYearIdSnapshot", "academicYearNameSnapshot",
  "semesterIdSnapshot", "semesterNameSnapshot", "capturedAt", "captureSource", "activeAtCapture", "metadata"
)
SELECT
  'sr_backfill_att_' || sa."id",
  sa."sessionId",
  sa."studentId",
  ce."id",
  u."fullName",
  u."username",
  sc."id",
  sc."code",
  sc."name",
  ay."id",
  ay."name",
  sem."id",
  sem."name",
  COALESCE(sa."createdAt", CURRENT_TIMESTAMP),
  'BACKFILL'::"RosterCaptureSource",
  COALESCE(ce."active", false),
  jsonb_build_object('source', 'existing_student_attendance', 'attendanceId', sa."id")
FROM "StudentAttendance" sa
JOIN "Session" s ON s."id" = sa."sessionId"
JOIN "User" u ON u."id" = sa."studentId"
JOIN "SchoolClass" sc ON sc."id" = s."classId"
LEFT JOIN "ClassEnrollment" ce ON ce."classId" = s."classId" AND ce."studentId" = sa."studentId"
LEFT JOIN "AcademicYear" ay ON ay."id" = ce."academicYearId"
LEFT JOIN "Semester" sem ON sem."id" = ce."semesterId"
ON CONFLICT ("sessionId", "studentId") DO NOTHING;

-- Then capture known current enrollments for existing sessions when no attendance row existed.
INSERT INTO "SessionRoster" (
  "id", "sessionId", "studentId", "enrollmentId", "studentNameSnapshot", "studentUsernameSnapshot",
  "classIdSnapshot", "classCodeSnapshot", "classNameSnapshot", "academicYearIdSnapshot", "academicYearNameSnapshot",
  "semesterIdSnapshot", "semesterNameSnapshot", "capturedAt", "captureSource", "activeAtCapture", "metadata"
)
SELECT
  'sr_backfill_enr_' || s."id" || '_' || ce."id",
  s."id",
  ce."studentId",
  ce."id",
  u."fullName",
  u."username",
  sc."id",
  sc."code",
  sc."name",
  ay."id",
  ay."name",
  sem."id",
  sem."name",
  COALESCE(s."openedAt", s."createdAt", CURRENT_TIMESTAMP),
  'BACKFILL'::"RosterCaptureSource",
  ce."active",
  jsonb_build_object('source', 'current_or_effective_enrollment')
FROM "Session" s
JOIN "SchoolClass" sc ON sc."id" = s."classId"
JOIN "ClassEnrollment" ce ON ce."classId" = s."classId"
JOIN "User" u ON u."id" = ce."studentId" AND u."role" = 'SISWA'
LEFT JOIN "AcademicYear" ay ON ay."id" = ce."academicYearId"
LEFT JOIN "Semester" sem ON sem."id" = ce."semesterId"
WHERE ce."effectiveFrom" <= s."businessDate"
  AND (ce."effectiveTo" IS NULL OR ce."effectiveTo" >= s."businessDate")
ON CONFLICT ("sessionId", "studentId") DO NOTHING;

DO $$
DECLARE
  roster_count INTEGER;
  defaulted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO roster_count FROM "SessionRoster";
  SELECT COUNT(*) INTO defaulted_count FROM "StudentAttendance" WHERE "reviewState" = 'DEFAULTED';
  RAISE NOTICE 'SessionRoster backfill complete: rosterRows=%, defaultedAttendanceRows=%', roster_count, defaulted_count;
END $$;
