\i prisma/fixtures/upgrade/_base_legacy.sql

INSERT INTO "WeeklySchedule" (id, "classId", "subjectId", "teacherId", "roomId", "academicYearId", "semesterId", "dayOfWeek", "startTime", "endTime", "effectiveFrom", active, "createdAt", "updatedAt") VALUES
  ('ws_session_collision', 'c_b', 'subj_a', 'u_teacher', NULL, 'ay_2026', 'sem_1', 0, '10:00', '11:00', '2026-06-01 00:00:00', true, '2026-06-01 00:00:00', '2026-06-01 00:00:00');

-- Different legacy business dates, same corrected Jakarta business date for the
-- same weeklyScheduleId. 0026 must abort before unique idempotency is restored.
INSERT INTO "Session" (id, "classId", "subjectId", "teacherId", "startsAt", "endsAt", status, "weeklyScheduleId", "roomId", "createdAt", "updatedAt") VALUES
  ('sess_collision_a', 'c_b', 'subj_a', 'u_teacher', '2026-06-14 06:30:00', '2026-06-14 07:00:00', 'CLOSED', 'ws_session_collision', NULL, '2026-06-14 06:00:00', '2026-06-14 07:10:00'),
  ('sess_collision_b', 'c_b', 'subj_a', 'u_teacher', '2026-06-14 16:30:00', '2026-06-14 17:00:00', 'CLOSED', 'ws_session_collision', NULL, '2026-06-14 16:00:00', '2026-06-14 17:10:00');
