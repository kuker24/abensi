-- Migration: 0047_personnel_leave_range
-- Desc: Generalize TeacherLeave into personnel leave with inclusive date range, applicant role snapshot, and cancellation/revocation metadata.

ALTER TABLE "TeacherLeave"
  ADD COLUMN IF NOT EXISTS "applicantRole" "Role",
  ADD COLUMN IF NOT EXISTS "endDate" DATE,
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedById" TEXT,
  ADD COLUMN IF NOT EXISTS "revocationReason" TEXT;

-- Preflight check / backfill applicantRole from User if missing
UPDATE "TeacherLeave" tl
SET "applicantRole" = u."role"
FROM "User" u
WHERE tl."teacherId" = u."id" AND tl."applicantRole" IS NULL;

UPDATE "TeacherLeave"
SET "applicantRole" = 'GURU_MAPEL'
WHERE "applicantRole" IS NULL;

ALTER TABLE "TeacherLeave" ALTER COLUMN "applicantRole" SET NOT NULL;

-- Convert timestamp date to DATE and backfill endDate to date if null
ALTER TABLE "TeacherLeave" ALTER COLUMN "date" TYPE DATE USING "date"::DATE;

UPDATE "TeacherLeave"
SET "endDate" = "date"
WHERE "endDate" IS NULL;

ALTER TABLE "TeacherLeave" ALTER COLUMN "endDate" SET NOT NULL;

-- Add check constraint for valid date range (max 30 days)
ALTER TABLE "TeacherLeave"
  ADD CONSTRAINT "TeacherLeave_valid_date_range"
  CHECK ("endDate" >= "date" AND ("endDate" - "date") <= 29);

-- Add check constraint for nonblank reason
ALTER TABLE "TeacherLeave"
  ADD CONSTRAINT "TeacherLeave_nonblank_reason"
  CHECK (char_length(trim("reason")) >= 10);

-- Foreign key updates for applicant (RESTRICT instead of CASCADE), cancelledBy, revokedBy
ALTER TABLE "TeacherLeave" DROP CONSTRAINT IF EXISTS "TeacherLeave_teacherId_fkey";
ALTER TABLE "TeacherLeave"
  ADD CONSTRAINT "TeacherLeave_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeacherLeave"
  ADD CONSTRAINT "TeacherLeave_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeacherLeave"
  ADD CONSTRAINT "TeacherLeave_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Index updates
CREATE INDEX IF NOT EXISTS "TeacherLeave_teacherId_status_range_idx" ON "TeacherLeave"("teacherId", "status", "date", "endDate");
CREATE INDEX IF NOT EXISTS "TeacherLeave_cancelledById_cancelledAt_idx" ON "TeacherLeave"("cancelledById", "cancelledAt");
CREATE INDEX IF NOT EXISTS "TeacherLeave_revokedById_revokedAt_idx" ON "TeacherLeave"("revokedById", "revokedAt");

-- Add leaveId column to TeacherSessionPresence if not exists
ALTER TABLE "TeacherSessionPresence"
  ADD COLUMN IF NOT EXISTS "leaveId" TEXT;

ALTER TABLE "TeacherSessionPresence"
  ADD CONSTRAINT "TeacherSessionPresence_leaveId_fkey"
  FOREIGN KEY ("leaveId") REFERENCES "TeacherLeave"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "TeacherSessionPresence_leaveId_idx" ON "TeacherSessionPresence"("leaveId");

-- Exclusion constraint to prevent active (PENDING/APPROVED) leave date range overlaps per user
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "TeacherLeave"
  ADD CONSTRAINT "TeacherLeave_no_active_overlap"
  EXCLUDE USING gist (
    "teacherId" WITH =,
    daterange("date", "endDate", '[]') WITH &&
  )
  WHERE ("status" IN ('PENDING', 'APPROVED'));
