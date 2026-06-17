-- Realistic populated legacy baseline for upgrade tests (schema through 0020).
-- IDs are stable because each scenario runs in an isolated database.

INSERT INTO "User" (id, username, "fullName", "passwordHash", role, active, "cardStatus", "createdAt", "updatedAt") VALUES
  ('u_admin', 'admin.tu.fixture', 'Admin TU Fixture', 'hash', 'ADMIN_TU', true, 'ACTIVE', '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('u_teacher', 'guru.fixture', 'Guru Fixture', 'hash', 'GURU_MAPEL', true, 'ACTIVE', '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('u_student', 'siswa.fixture', 'Siswa Fixture', 'hash', 'SISWA', true, 'ACTIVE', '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('u_student_2', 'siswa.dua.fixture', 'Siswa Dua Fixture', 'hash', 'SISWA', true, 'ACTIVE', '2026-06-01 00:00:00', '2026-06-01 00:00:00');

INSERT INTO "SchoolClass" (id, code, name, "yearLabel", "createdAt") VALUES
  ('c_a', 'X-A-FIX', 'Kelas X A Fixture', '2026/2027', '2026-06-01 00:00:00'),
  ('c_b', 'X-B-FIX', 'Kelas X B Fixture', '2026/2027', '2026-06-01 00:00:00');

INSERT INTO "Subject" (id, code, name, "createdAt") VALUES
  ('subj_a', 'FIX-MTK', 'Matematika Fixture', '2026-06-01 00:00:00');

INSERT INTO "AcademicYear" (id, code, name, "startsAt", "endsAt", active, "createdAt", "updatedAt") VALUES
  ('ay_2026', 'FIX-2026', 'Tahun Fixture 2026', '2026-01-01 00:00:00', '2026-12-31 23:59:59', true, '2026-06-01 00:00:00', '2026-06-01 00:00:00');

INSERT INTO "Semester" (id, "academicYearId", code, name, "startsAt", "endsAt", active, "createdAt", "updatedAt") VALUES
  ('sem_1', 'ay_2026', 'FIX-GANJIL', 'Semester Fixture', '2026-01-01 00:00:00', '2026-06-30 23:59:59', true, '2026-06-01 00:00:00', '2026-06-01 00:00:00');

INSERT INTO "Room" (id, code, name, active, "createdAt", "updatedAt") VALUES
  ('room_a', 'R-FIX-A', 'Ruang Fixture A', true, '2026-06-01 00:00:00', '2026-06-01 00:00:00');

INSERT INTO "WeeklySchedule" (id, "classId", "subjectId", "teacherId", "roomId", "academicYearId", "semesterId", "dayOfWeek", "startTime", "endTime", "effectiveFrom", "effectiveTo", active, "createdAt", "updatedAt") VALUES
  ('ws_base', 'c_a', 'subj_a', 'u_teacher', 'room_a', 'ay_2026', 'sem_1', 0, '08:00', '09:00', '2026-06-01 00:00:00', NULL, true, '2026-06-01 00:00:00', '2026-06-01 00:00:00');

INSERT INTO "ClassEnrollment" (id, "classId", "studentId", "createdAt") VALUES
  ('enr_student_a', 'c_a', 'u_student', '2026-06-14 00:00:00'),
  ('enr_student2_a', 'c_a', 'u_student_2', '2026-06-14 00:00:00');

INSERT INTO "Session" (id, "classId", "subjectId", "teacherId", "startsAt", "endsAt", status, "weeklyScheduleId", "roomId", "createdAt", "updatedAt") VALUES
  ('sess_base', 'c_a', 'subj_a', 'u_teacher', '2026-06-14 01:00:00', '2026-06-14 02:00:00', 'CLOSED', 'ws_base', 'room_a', '2026-06-14 00:30:00', '2026-06-14 02:10:00');

INSERT INTO "GateLog" (id, "userId", direction, "tappedAt", "deviceId", "serverReceivedAt", "signatureVerified") VALUES
  ('gate_base', 'u_student', 'IN', '2026-06-14 00:30:00', 'reader-fixture', '2026-06-14 00:30:02', true);
