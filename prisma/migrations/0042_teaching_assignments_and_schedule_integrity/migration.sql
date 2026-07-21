-- Formal teaching assignments and schedule provenance.
-- No legacy schedule/session backfill: null period and assignment fields remain readable.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- WeeklySchedule legacy API encoded Jakarta midnight as 17:00:00 on previous
-- UTC date. Some fixtures and manually repaired rows use UTC midnight. Accept
-- only those two reviewed encodings; any other time must be repaired explicitly.
DO $$
DECLARE
  ambiguous_schedule_count INTEGER;
  invalid_schedule_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ambiguous_schedule_count
  FROM "WeeklySchedule"
  WHERE "effectiveFrom"::time NOT IN (TIME '00:00:00', TIME '17:00:00')
     OR ("effectiveTo" IS NOT NULL AND "effectiveTo"::time NOT IN (TIME '00:00:00', TIME '17:00:00'));

  IF ambiguous_schedule_count > 0 THEN
    RAISE EXCEPTION 'Migration 0042 aborted: % WeeklySchedule rows have ambiguous legacy timestamp times. Repair them with reviewed Asia/Jakarta calendar dates before applying.', ambiguous_schedule_count;
  END IF;

  SELECT COUNT(*) INTO invalid_schedule_count
  FROM "WeeklySchedule"
  WHERE "effectiveTo" IS NOT NULL
    AND (("effectiveTo" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date
      < (("effectiveFrom" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date;

  IF invalid_schedule_count > 0 THEN
    RAISE EXCEPTION 'Migration 0042 aborted: % WeeklySchedule rows have effectiveTo before effectiveFrom after Asia/Jakarta date conversion.', invalid_schedule_count;
  END IF;
END $$;

ALTER TABLE "WeeklySchedule"
  ALTER COLUMN "effectiveFrom" TYPE DATE USING (("effectiveFrom" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date,
  ALTER COLUMN "effectiveTo" TYPE DATE USING CASE
    WHEN "effectiveTo" IS NULL THEN NULL
    ELSE (("effectiveTo" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date
  END;

CREATE TABLE "TeachingAssignment" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "semesterId" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeachingAssignment_valid_period_chk" CHECK ("effectiveTo" >= "effectiveFrom")
);

ALTER TABLE "WeeklySchedule"
  ADD COLUMN "teachingAssignmentId" TEXT;

ALTER TABLE "Session"
  ADD COLUMN "teachingAssignmentId" TEXT,
  ADD COLUMN "substitutionSourceTeacherId" TEXT,
  ADD COLUMN "substitutionSourceAssignmentId" TEXT;

ALTER TABLE "WeeklySchedule"
  ADD CONSTRAINT "WeeklySchedule_valid_period_chk"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

ALTER TABLE "TeachingAssignment"
  ADD CONSTRAINT "TeachingAssignment_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TeachingAssignment_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TeachingAssignment_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TeachingAssignment_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TeachingAssignment_semesterId_fkey"
  FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklySchedule"
  ADD CONSTRAINT "WeeklySchedule_teachingAssignmentId_fkey"
  FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_teachingAssignmentId_fkey"
  FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Session_substitutionSourceTeacherId_fkey"
  FOREIGN KEY ("substitutionSourceTeacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Session_substitutionSourceAssignmentId_fkey"
  FOREIGN KEY ("substitutionSourceAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "TeachingAssignment_teacher_subject_class_period_idx"
  ON "TeachingAssignment" ("teacherId", "subjectId", "classId", "academicYearId", "semesterId", "effectiveFrom", "effectiveTo");
CREATE INDEX "TeachingAssignment_period_active_idx"
  ON "TeachingAssignment" ("academicYearId", "semesterId", "active", "effectiveFrom", "effectiveTo");
CREATE INDEX "TeachingAssignment_class_active_period_idx"
  ON "TeachingAssignment" ("classId", "active", "effectiveFrom", "effectiveTo");
CREATE INDEX "WeeklySchedule_teachingAssignmentId_dayOfWeek_idx"
  ON "WeeklySchedule" ("teachingAssignmentId", "dayOfWeek");
CREATE INDEX "Session_teachingAssignmentId_startsAt_idx"
  ON "Session" ("teachingAssignmentId", "startsAt");
CREATE INDEX "Session_substitutionSourceTeacherId_businessDate_idx"
  ON "Session" ("substitutionSourceTeacherId", "businessDate");
CREATE INDEX "Session_substitutionSourceAssignmentId_startsAt_idx"
  ON "Session" ("substitutionSourceAssignmentId", "startsAt");

ALTER TABLE "TeachingAssignment"
  ADD CONSTRAINT "TeachingAssignment_active_no_overlap_excl"
  EXCLUDE USING gist (
    "teacherId" WITH =,
    "subjectId" WITH =,
    "classId" WITH =,
    "academicYearId" WITH =,
    "semesterId" WITH =,
    daterange("effectiveFrom", "effectiveTo" + 1, '[)') WITH &&
  ) WHERE ("active" = TRUE);
