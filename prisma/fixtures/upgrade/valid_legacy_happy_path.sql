\i prisma/fixtures/upgrade/_base_legacy.sql

-- Historical attendance is valid and should be backfilled into SessionRoster.
INSERT INTO "StudentAttendance" (id, "sessionId", "studentId", status, note, "createdAt", "updatedAt", "evidenceLabel", "correctionCount") VALUES
  ('att_valid', 'sess_base', 'u_student', 'HADIR', 'valid legacy attendance', '2026-06-14 01:05:00', '2026-06-14 01:05:00', 'normal', 0);
