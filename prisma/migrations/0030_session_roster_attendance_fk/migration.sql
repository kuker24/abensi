-- Enforce immutable roster membership for class attendance rows.

CREATE TABLE IF NOT EXISTS "SessionRosterIntegrityPreflightReport" (
  id TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  details JSONB NOT NULL
);

DELETE FROM "SessionRosterIntegrityPreflightReport"
WHERE category IN ('ATTENDANCE_WITHOUT_SESSION_ROSTER', 'ATTENDANCE_CONFIRMED_BY_MISSING_USER', 'ATTENDANCE_CORRECTED_BY_MISSING_USER');

INSERT INTO "SessionRoster" (
  id,
  "sessionId",
  "studentId",
  "enrollmentId",
  "studentNameSnapshot",
  "studentUsernameSnapshot",
  "classIdSnapshot",
  "classCodeSnapshot",
  "classNameSnapshot",
  "academicYearIdSnapshot",
  "academicYearNameSnapshot",
  "semesterIdSnapshot",
  "semesterNameSnapshot",
  "capturedAt",
  "captureSource",
  "activeAtCapture",
  metadata
)
SELECT
  'sr_' || substr(md5(sa."sessionId" || ':' || sa."studentId"), 1, 22),
  sa."sessionId",
  sa."studentId",
  ce.id,
  u."fullName",
  u.username,
  sc.id,
  sc.code,
  sc.name,
  ce."academicYearId",
  ay.name,
  ce."semesterId",
  sem.name,
  CURRENT_TIMESTAMP,
  'BACKFILL',
  COALESCE(ce.active, true),
  jsonb_build_object('source', '0030_session_roster_attendance_fk', 'sessionBusinessDate', s."businessDate")
FROM "StudentAttendance" sa
JOIN "Session" s ON s.id = sa."sessionId"
JOIN "SchoolClass" sc ON sc.id = s."classId"
JOIN "User" u ON u.id = sa."studentId"
LEFT JOIN LATERAL (
  SELECT ce.*
  FROM "ClassEnrollment" ce
  WHERE ce."studentId" = sa."studentId"
    AND ce."classId" = s."classId"
    AND ce."effectiveFrom" <= s."businessDate"
    AND (ce."effectiveTo" IS NULL OR ce."effectiveTo" >= s."businessDate")
  ORDER BY ce."effectiveFrom" DESC, ce."createdAt" DESC
  LIMIT 1
) ce ON TRUE
LEFT JOIN "AcademicYear" ay ON ay.id = ce."academicYearId"
LEFT JOIN "Semester" sem ON sem.id = ce."semesterId"
LEFT JOIN "SessionRoster" sr ON sr."sessionId" = sa."sessionId" AND sr."studentId" = sa."studentId"
WHERE sr.id IS NULL
ON CONFLICT ("sessionId", "studentId") DO NOTHING;

INSERT INTO "SessionRosterIntegrityPreflightReport" (id, category, severity, details)
SELECT
  '0030-roster-gap-' || md5(sa."sessionId" || ':' || sa."studentId"),
  'ATTENDANCE_WITHOUT_SESSION_ROSTER',
  'BLOCKING',
  jsonb_build_object('sessionId', sa."sessionId", 'studentId', sa."studentId", 'attendanceId', sa.id)
FROM "StudentAttendance" sa
LEFT JOIN "SessionRoster" sr ON sr."sessionId" = sa."sessionId" AND sr."studentId" = sa."studentId"
WHERE sr.id IS NULL
ON CONFLICT (id) DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP, details = EXCLUDED.details;

INSERT INTO "SessionRosterIntegrityPreflightReport" (id, category, severity, details)
SELECT
  '0030-invalid-confirmedBy-' || sa.id,
  'ATTENDANCE_CONFIRMED_BY_MISSING_USER',
  'BLOCKING',
  jsonb_build_object('attendanceId', sa.id, 'confirmedById', sa."confirmedById")
FROM "StudentAttendance" sa
LEFT JOIN "User" u ON u.id = sa."confirmedById"
WHERE sa."confirmedById" IS NOT NULL AND u.id IS NULL
ON CONFLICT (id) DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP, details = EXCLUDED.details;

INSERT INTO "SessionRosterIntegrityPreflightReport" (id, category, severity, details)
SELECT
  '0030-invalid-correctedBy-' || sa.id,
  'ATTENDANCE_CORRECTED_BY_MISSING_USER',
  'BLOCKING',
  jsonb_build_object('attendanceId', sa.id, 'correctedById', sa."correctedById")
FROM "StudentAttendance" sa
LEFT JOIN "User" u ON u.id = sa."correctedById"
WHERE sa."correctedById" IS NOT NULL AND u.id IS NULL
ON CONFLICT (id) DO UPDATE SET "createdAt" = CURRENT_TIMESTAMP, details = EXCLUDED.details;

DO $$
DECLARE
  blocking_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO blocking_count
  FROM "SessionRosterIntegrityPreflightReport"
  WHERE severity = 'BLOCKING';

  IF blocking_count > 0 THEN
    RAISE EXCEPTION 'Migration 0030 aborted: % blocking roster/actor integrity issues remain. Review SessionRosterIntegrityPreflightReport.', blocking_count;
  END IF;
END $$;

ALTER TABLE "StudentAttendance"
  ADD CONSTRAINT "StudentAttendance_session_roster_fkey"
  FOREIGN KEY ("sessionId", "studentId") REFERENCES "SessionRoster"("sessionId", "studentId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentAttendance"
  ADD CONSTRAINT "StudentAttendance_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentAttendance"
  ADD CONSTRAINT "StudentAttendance_correctedById_fkey"
  FOREIGN KEY ("correctedById") REFERENCES "User"(id)
  ON DELETE SET NULL ON UPDATE CASCADE;
