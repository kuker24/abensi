-- Separate administrative cancellation/revocation from effective-date validity.
-- Corrective migration after 0029: effectiveTo no longer implies inactive.

ALTER TABLE "ClassEnrollment"
  ADD COLUMN IF NOT EXISTS "administrativeStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "administrativeStatusChangedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "administrativeStatusChangedById" TEXT,
  ADD COLUMN IF NOT EXISTS "administrativeStatusReason" TEXT;

-- Legacy rows with active=false and an effectiveTo were closed by period semantics,
-- not by administrative cancellation. Preserve their dated validity by making the
-- legacy boolean mean administrative validity only.
UPDATE "ClassEnrollment"
SET "active" = TRUE,
    "administrativeStatus" = 'ACTIVE',
    "administrativeStatusChangedAt" = NULL,
    "administrativeStatusChangedById" = NULL,
    "administrativeStatusReason" = NULL
WHERE "active" = FALSE
  AND "effectiveTo" IS NOT NULL;

-- Legacy open-ended inactive rows cannot be safely inferred as dated closure.
-- Preserve that administrative revocation state explicitly with honest evidence.
UPDATE "ClassEnrollment"
SET "administrativeStatus" = 'REVOKED',
    "administrativeStatusChangedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP),
    "administrativeStatusReason" = COALESCE("endedReason", 'Legacy active=false open-ended enrollment preserved as administrative revocation')
WHERE "active" = FALSE
  AND "effectiveTo" IS NULL;

UPDATE "ClassEnrollment"
SET "active" = ("administrativeStatus" = 'ACTIVE');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClassEnrollment_administrative_status_chk'
  ) THEN
    ALTER TABLE "ClassEnrollment"
      ADD CONSTRAINT "ClassEnrollment_administrative_status_chk"
      CHECK ("administrativeStatus" IN ('ACTIVE', 'CANCELLED', 'REVOKED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClassEnrollment_administrative_status_reason_chk'
  ) THEN
    ALTER TABLE "ClassEnrollment"
      ADD CONSTRAINT "ClassEnrollment_administrative_status_reason_chk"
      CHECK (
        "administrativeStatus" = 'ACTIVE'
        OR (
          "administrativeStatusChangedAt" IS NOT NULL
          AND "administrativeStatusReason" IS NOT NULL
          AND length(trim("administrativeStatusReason")) >= 10
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClassEnrollment_administrativeStatusChangedById_fkey'
  ) THEN
    ALTER TABLE "ClassEnrollment"
      ADD CONSTRAINT "ClassEnrollment_administrativeStatusChangedById_fkey"
      FOREIGN KEY ("administrativeStatusChangedById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ClassEnrollment" DROP CONSTRAINT IF EXISTS "ClassEnrollment_student_no_overlap_excl";

ALTER TABLE "ClassEnrollment"
  ADD CONSTRAINT "ClassEnrollment_student_no_overlap_excl"
  EXCLUDE USING gist (
    "studentId" WITH =,
    daterange("effectiveFrom", COALESCE("effectiveTo" + 1, 'infinity'::date), '[)') WITH &&
  )
  WHERE ("administrativeStatus" = 'ACTIVE' AND "active" = TRUE);

CREATE INDEX IF NOT EXISTS "ClassEnrollment_student_admin_effective_idx"
  ON "ClassEnrollment" ("studentId", "administrativeStatus", "effectiveFrom", "effectiveTo");

CREATE INDEX IF NOT EXISTS "ClassEnrollment_class_admin_effective_idx"
  ON "ClassEnrollment" ("classId", "administrativeStatus", "effectiveFrom", "effectiveTo");
