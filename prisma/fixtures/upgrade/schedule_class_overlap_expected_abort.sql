\i prisma/fixtures/upgrade/_base_legacy.sql

INSERT INTO "User" (id, username, "fullName", "passwordHash", role, active, "cardStatus", "createdAt", "updatedAt") VALUES
  ('u_teacher_2', 'guru.dua.fixture', 'Guru Dua Fixture', 'hash', 'GURU_MAPEL', true, 'ACTIVE', '2026-06-01 00:00:00', '2026-06-01 00:00:00');

INSERT INTO "Session" (id, "classId", "subjectId", "teacherId", "startsAt", "endsAt", status, "weeklyScheduleId", "roomId", "createdAt", "updatedAt") VALUES
  ('sess_class_overlap_a', 'c_a', 'subj_a', 'u_teacher', '2026-06-15 03:00:00', '2026-06-15 04:00:00', 'SCHEDULED', NULL, NULL, '2026-06-15 00:00:00', '2026-06-15 00:00:00'),
  ('sess_class_overlap_b', 'c_a', 'subj_a', 'u_teacher_2', '2026-06-15 03:30:00', '2026-06-15 04:30:00', 'OPEN', NULL, NULL, '2026-06-15 00:00:00', '2026-06-15 00:00:00');
