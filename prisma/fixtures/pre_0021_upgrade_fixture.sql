-- Pre-0021 populated upgrade fixture for production-readiness migration testing.
-- Apply to a database restored/migrated only through 0020_user_must_change_password,
-- then apply 0021+ corrective migrations. This intentionally includes duplicate
-- GateLog groups, active schedule overlaps, and audit branch/orphan fixtures so
-- preflight/negative migration tests can prove safe abort behavior.

BEGIN;

INSERT INTO "User" ("id", "username", "fullName", "passwordHash", "role", "active", "cardStatus", "sessionVersion", "mustChangePassword", "createdAt", "updatedAt") VALUES
  ('user-admin', 'fixture.admin', 'Fixture Admin', 'TEST_ONLY_NOT_A_REAL_PASSWORD_HASH', 'ADMIN_TU', true, 'ACTIVE', 1, false, '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('user-teacher', 'fixture.teacher', 'Fixture Teacher', 'TEST_ONLY_NOT_A_REAL_PASSWORD_HASH', 'GURU_MAPEL', true, 'ACTIVE', 1, false, '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('user-student-1', 'fixture.student1', 'Fixture Student 1', 'TEST_ONLY_NOT_A_REAL_PASSWORD_HASH', 'SISWA', true, 'ACTIVE', 1, false, '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('user-student-2', 'fixture.student2', 'Fixture Student 2', 'TEST_ONLY_NOT_A_REAL_PASSWORD_HASH', 'SISWA', true, 'ACTIVE', 1, false, '2026-06-01 00:00:00', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "SchoolClass" ("id", "code", "name", "yearLabel", "createdAt") VALUES
  ('class-fixture-a', 'XF-A', 'Fixture X A', '2026', '2026-06-01 00:00:00'),
  ('class-fixture-b', 'XF-B', 'Fixture X B', '2026', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Subject" ("id", "code", "name", "createdAt") VALUES
  ('subject-fixture', 'FIX', 'Fixture Subject', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Room" ("id", "code", "name", "active", "createdAt", "updatedAt") VALUES
  ('room-fixture', 'RFIX', 'Fixture Room', true, '2026-06-01 00:00:00', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AcademicYear" ("id", "code", "name", "startsAt", "endsAt", "active", "createdAt", "updatedAt") VALUES
  ('ay-fixture', '2026/2027', 'Fixture AY', '2026-06-01 00:00:00', '2027-05-31 00:00:00', true, '2026-06-01 00:00:00', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Semester" ("id", "academicYearId", "code", "name", "startsAt", "endsAt", "active", "createdAt", "updatedAt") VALUES
  ('semester-fixture', 'ay-fixture', 'Ganjil', 'Ganjil Fixture', '2026-06-01 00:00:00', '2026-12-31 00:00:00', true, '2026-06-01 00:00:00', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ClassEnrollment" ("id", "classId", "studentId", "createdAt") VALUES
  ('enrollment-fixture-1', 'class-fixture-a', 'user-student-1', '2026-06-01 00:00:00'),
  ('enrollment-fixture-2', 'class-fixture-a', 'user-student-2', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "WeeklySchedule" ("id", "classId", "subjectId", "teacherId", "roomId", "academicYearId", "semesterId", "dayOfWeek", "startTime", "endTime", "effectiveFrom", "effectiveTo", "active", "createdAt", "updatedAt") VALUES
  ('weekly-fixture', 'class-fixture-a', 'subject-fixture', 'user-teacher', 'room-fixture', 'ay-fixture', 'semester-fixture', 0, '07:00', '08:00', '2026-06-01 00:00:00', NULL, true, '2026-06-01 00:00:00', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

-- Generated sessions and active overlaps. 0023 should backfill businessDate;
-- 0024 should detect overlaps until fixture cleanup/dedupe is performed.
INSERT INTO "Session" ("id", "classId", "subjectId", "teacherId", "startsAt", "endsAt", "status", "openedAt", "closedAt", "reconciledAt", "weeklyScheduleId", "roomId", "createdAt", "updatedAt") VALUES
  ('session-generated-midnight-before', 'class-fixture-a', 'subject-fixture', 'user-teacher', '2026-06-13 16:59:59', '2026-06-13 17:59:59', 'SCHEDULED', NULL, NULL, NULL, 'weekly-fixture', 'room-fixture', '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('session-generated-midnight-after', 'class-fixture-a', 'subject-fixture', 'user-teacher', '2026-06-13 17:00:00', '2026-06-13 18:00:00', 'SCHEDULED', NULL, NULL, NULL, 'weekly-fixture', 'room-fixture', '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('session-overlap-teacher', 'class-fixture-b', 'subject-fixture', 'user-teacher', '2026-06-14 00:30:00', '2026-06-14 01:30:00', 'SCHEDULED', NULL, NULL, NULL, NULL, 'room-fixture', '2026-06-01 00:00:00', '2026-06-01 00:00:00'),
  ('session-attendance-existing', 'class-fixture-a', 'subject-fixture', 'user-teacher', '2026-06-15 00:00:00', '2026-06-15 01:00:00', 'CLOSED', '2026-06-15 00:00:00', '2026-06-15 01:00:00', NULL, NULL, 'room-fixture', '2026-06-01 00:00:00', '2026-06-01 00:00:00')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "StudentAttendance" ("id", "sessionId", "studentId", "status", "note", "evidenceLabel", "usedOverrideId", "correctionCount", "correctedAt", "correctedById", "createdAt", "updatedAt") VALUES
  ('attendance-fixture-1', 'session-attendance-existing', 'user-student-1', 'HADIR', NULL, 'normal', NULL, 0, NULL, NULL, '2026-06-15 00:10:00', '2026-06-15 00:10:00'),
  ('attendance-fixture-2', 'session-attendance-existing', 'user-student-2', 'ALPA', NULL, 'normal', NULL, 0, NULL, NULL, '2026-06-15 00:10:00', '2026-06-15 00:10:00')
ON CONFLICT ("id") DO NOTHING;

-- GateLog rows around Jakarta midnight plus duplicate semantic groups.
INSERT INTO "GateLog" ("id", "userId", "direction", "tappedAt", "deviceId", "readerId", "cardId", "qrCredentialId", "scanMode", "appVersion", "signatureVerified", "serverReceivedAt", "deviceEventId", "deviceTimestamp", "nonceHash", "bodyHash", "manualReason", "createdById", "usedOverrideId") VALUES
  ('gate-before-jakarta-midnight', 'user-student-1', 'IN', '2026-06-13 16:59:59', 'device-a', 'reader-a', NULL, NULL, 'GATE_IN', 'fixture', true, '2026-06-13 17:00:01', 'evt-before', '2026-06-13 16:59:59', 'nonce-before', 'body-before', NULL, NULL, NULL),
  ('gate-after-jakarta-midnight', 'user-student-1', 'OUT', '2026-06-13 17:00:00', 'device-a', 'reader-a', NULL, NULL, 'GATE_OUT', 'fixture', true, '2026-06-13 17:00:02', 'evt-after', '2026-06-13 17:00:00', 'nonce-after', 'body-after', NULL, NULL, NULL),
  ('gate-duplicate-canonical', 'user-student-2', 'IN', '2026-06-14 00:00:00', 'device-a', 'reader-a', NULL, NULL, 'GATE_IN', 'fixture', true, '2026-06-14 00:00:01', 'evt-dup-1', '2026-06-14 00:00:00', 'nonce-dup-1', 'body-dup-1', NULL, NULL, NULL),
  ('gate-duplicate-secondary', 'user-student-2', 'IN', '2026-06-14 00:01:00', 'device-b', 'reader-b', NULL, NULL, 'GATE_IN', 'fixture', true, '2026-06-14 00:01:01', 'evt-dup-2', '2026-06-14 00:01:00', 'nonce-dup-2', 'body-dup-2', 'late duplicate fixture', 'user-admin', NULL)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AuthSession" ("id", "userId", "sessionVersion", "refreshTokenHash", "tokenFamilyId", "userAgent", "requestIp", "createdIp", "lastIp", "issuedAt", "createdAt", "updatedAt", "lastSeenAt", "lastUsedAt", "expiresAt", "revokedAt", "revokedReason", "replacedById") VALUES
  ('auth-session-fixture', 'user-admin', 1, 'fixture-refresh-hash', 'fixture-token-family', 'fixture-agent', '127.0.0.1', '127.0.0.1', '127.0.0.1', '2026-06-01 00:00:00', '2026-06-01 00:00:00', '2026-06-01 00:00:00', '2026-06-01 00:00:00', '2026-06-01 00:00:00', '2026-07-01 00:00:00', NULL, NULL, NULL)
ON CONFLICT ("id") DO NOTHING;

-- Audit valid chain + branch + orphan fixtures for safe migration tests.
INSERT INTO "AuditEntry" ("id", "actorId", "actorRole", "action", "module", "resource", "resourceId", "reason", "requestIp", "requestDevice", "before", "after", "canonicalPayload", "prevHash", "entryHash", "hashVersion", "createdAt") VALUES
  ('audit-genesis', 'user-admin', 'ADMIN_TU', 'fixture.genesis', 'fixture', 'fixture', 'audit-genesis', NULL, NULL, NULL, NULL, '{"note":"genesis"}'::jsonb, '{"action":"fixture.genesis","actorId":"user-admin","actorRole":"ADMIN_TU","after":{"note":"genesis"},"before":null,"module":"fixture","reason":null,"requestDevice":null,"requestIp":null,"resource":"fixture","resourceId":"audit-genesis"}'::jsonb, NULL, '8b39d9e2fdcc4e6857dcf5959e88d450af9d165e746edc2ffa4f2502caa5ac4c', 1, '2026-06-01 00:00:00'),
  ('audit-second', 'user-admin', 'ADMIN_TU', 'fixture.second', 'fixture', 'fixture', 'audit-second', NULL, NULL, NULL, NULL, '{"note":"second"}'::jsonb, '{"action":"fixture.second","actorId":"user-admin","actorRole":"ADMIN_TU","after":{"note":"second"},"before":null,"module":"fixture","reason":null,"requestDevice":null,"requestIp":null,"resource":"fixture","resourceId":"audit-second"}'::jsonb, '8b39d9e2fdcc4e6857dcf5959e88d450af9d165e746edc2ffa4f2502caa5ac4c', 'e11bc925f945b0efe198fe3f80e71818bcdd8375873be4931b50a6ad07f1ffcc', 1, '2026-06-01 00:00:01'),
  ('audit-branch', 'user-admin', 'ADMIN_TU', 'fixture.branch', 'fixture', 'fixture', 'audit-branch', NULL, NULL, NULL, NULL, '{"note":"branch"}'::jsonb, '{"action":"fixture.branch","actorId":"user-admin","actorRole":"ADMIN_TU","after":{"note":"branch"},"before":null,"module":"fixture","reason":null,"requestDevice":null,"requestIp":null,"resource":"fixture","resourceId":"audit-branch"}'::jsonb, '8b39d9e2fdcc4e6857dcf5959e88d450af9d165e746edc2ffa4f2502caa5ac4c', 'e7108781e7400bc18de0064df17b8ab1280bcfdb454bdebf8bd25d786e9c0cbc', 1, '2026-06-01 00:00:02'),
  ('audit-orphan', 'user-admin', 'ADMIN_TU', 'fixture.orphan', 'fixture', 'fixture', 'audit-orphan', NULL, NULL, NULL, NULL, '{"note":"orphan"}'::jsonb, '{"action":"fixture.orphan","actorId":"user-admin","actorRole":"ADMIN_TU","after":{"note":"orphan"},"before":null,"module":"fixture","reason":null,"requestDevice":null,"requestIp":null,"resource":"fixture","resourceId":"audit-orphan"}'::jsonb, 'missing-prev-hash', 'ac9560a125e154baacea00a119413b3d09f7c90a2862fde7e97254200d2ac382', 1, '2026-06-01 00:00:03')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AuditChainState" ("id", "lastHash", "lastEntryId", "updatedAt") VALUES
  (1, 'stale-fixture-state', 'audit-genesis', '2026-06-01 00:00:04')
ON CONFLICT ("id") DO NOTHING;

COMMIT;
