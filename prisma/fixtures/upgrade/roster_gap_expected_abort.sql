\i prisma/fixtures/upgrade/_base_legacy.sql

-- Force a legacy attendance row whose student FK is corrupted. 0028 cannot
-- create SessionRoster because the user join fails; 0030 must abort with an
-- ATTENDANCE_WITHOUT_SESSION_ROSTER preflight report. This uses legacy forensic
-- corruption, not application-supported writes.
ALTER TABLE "StudentAttendance" DISABLE TRIGGER ALL;
INSERT INTO "StudentAttendance" (id, "sessionId", "studentId", status, note, "createdAt", "updatedAt", "evidenceLabel", "correctionCount") VALUES
  ('att_roster_gap', 'sess_base', 'u_missing_legacy_student', 'HADIR', 'corrupt legacy row with missing student', '2026-06-14 01:05:00', '2026-06-14 01:05:00', 'normal', 0);
ALTER TABLE "StudentAttendance" ENABLE TRIGGER ALL;
