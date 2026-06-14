\i prisma/fixtures/upgrade/_base_legacy.sql

-- correctedById had no FK before 0030. 0028 copies it into confirmedById;
-- 0030 must abort rather than hiding an invalid actor reference.
INSERT INTO "StudentAttendance" (id, "sessionId", "studentId", status, note, "createdAt", "updatedAt", "evidenceLabel", "correctionCount", "correctedAt", "correctedById") VALUES
  ('att_invalid_actor', 'sess_base', 'u_student', 'HADIR', 'corrupt corrected actor', '2026-06-14 01:05:00', '2026-06-14 01:05:00', 'corrected', 1, '2026-06-14 01:06:00', 'u_missing_actor');
