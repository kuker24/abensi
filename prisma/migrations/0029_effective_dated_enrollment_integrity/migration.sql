-- Effective-dated class enrollment integrity.
-- Additive/corrective migration: safe after 0028 and aborts on unsafe overlaps.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Keep a SQL-readable preflight report for operators and CI artifacts.
CREATE TABLE IF NOT EXISTS "EnrollmentIntegrityPreflightReport" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  details JSONB NOT NULL
);

INSERT INTO "EnrollmentIntegrityPreflightReport" (id, category, severity, details)
SELECT
  '0029-overlap-' || md5("studentId" || ':' || array_agg(id ORDER BY "effectiveFrom", id)::text),
  'ENROLLMENT_PERIOD_OVERLAP',
  'BLOCKING',
  jsonb_build_object(
    'studentId', "studentId",
    'enrollmentIds', array_agg(id ORDER BY "effectiveFrom", id),
    'ranges', jsonb_agg(jsonb_build_object('id', id, 'classId', "classId", 'effectiveFrom', "effectiveFrom", 'effectiveTo', "effectiveTo") ORDER BY "effectiveFrom", id)
  )
FROM (
  SELECT a.*
  FROM "ClassEnrollment" a
  WHERE EXISTS (
    SELECT 1
    FROM "ClassEnrollment" b
    WHERE b.id <> a.id
      AND b."studentId" = a."studentId"
      AND daterange(a."effectiveFrom", COALESCE(a."effectiveTo" + 1, 'infinity'::date), '[)') &&
          daterange(b."effectiveFrom", COALESCE(b."effectiveTo" + 1, 'infinity'::date), '[)')
  )
) overlap_rows
GROUP BY "studentId"
ON CONFLICT (id) DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP, details = EXCLUDED.details;

DO $$
DECLARE
  overlap_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO overlap_count
  FROM "EnrollmentIntegrityPreflightReport"
  WHERE category = 'ENROLLMENT_PERIOD_OVERLAP' AND severity = 'BLOCKING';

  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'Migration 0029 aborted: % students have overlapping ClassEnrollment periods. Review EnrollmentIntegrityPreflightReport.', overlap_count;
  END IF;
END $$;

ALTER TABLE "ClassEnrollment" DROP CONSTRAINT IF EXISTS "ClassEnrollment_classId_studentId_key";

ALTER TABLE "ClassEnrollment" ALTER COLUMN "effectiveFrom" DROP DEFAULT;

UPDATE "ClassEnrollment"
SET "effectiveFrom" = ((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
WHERE "effectiveFrom" IS NULL;

ALTER TABLE "ClassEnrollment"
  ADD CONSTRAINT "ClassEnrollment_valid_period_chk"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

ALTER TABLE "ClassEnrollment"
  ADD CONSTRAINT "ClassEnrollment_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassEnrollment"
  ADD CONSTRAINT "ClassEnrollment_semesterId_fkey"
  FOREIGN KEY ("semesterId") REFERENCES "Semester"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassEnrollment"
  ADD CONSTRAINT "ClassEnrollment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClassEnrollment"
  ADD CONSTRAINT "ClassEnrollment_endedById_fkey"
  FOREIGN KEY ("endedById") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClassEnrollment"
  ADD CONSTRAINT "ClassEnrollment_student_no_overlap_excl"
  EXCLUDE USING gist (
    "studentId" WITH =,
    daterange("effectiveFrom", COALESCE("effectiveTo" + 1, 'infinity'::date), '[)') WITH &&
  );

CREATE INDEX IF NOT EXISTS "ClassEnrollment_student_effective_idx"
  ON "ClassEnrollment" ("studentId", "effectiveFrom", "effectiveTo");

CREATE INDEX IF NOT EXISTS "ClassEnrollment_period_idx"
  ON "ClassEnrollment" ("academicYearId", "semesterId", "effectiveFrom", "effectiveTo");
