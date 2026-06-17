\i prisma/fixtures/upgrade/_base_legacy.sql

INSERT INTO "Session" (id, "classId", "subjectId", "teacherId", "startsAt", "endsAt", status, "weeklyScheduleId", "roomId", "createdAt", "updatedAt") VALUES
  ('sess_teacher_overlap_a', 'c_a', 'subj_a', 'u_teacher', '2026-06-15 01:00:00', '2026-06-15 02:00:00', 'SCHEDULED', NULL, NULL, '2026-06-15 00:00:00', '2026-06-15 00:00:00'),
  ('sess_teacher_overlap_b', 'c_b', 'subj_a', 'u_teacher', '2026-06-15 01:30:00', '2026-06-15 02:30:00', 'OPEN', NULL, NULL, '2026-06-15 00:00:00', '2026-06-15 00:00:00');
