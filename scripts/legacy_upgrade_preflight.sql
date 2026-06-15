-- Read-only legacy upgrade preflight for databases migrated through the legacy cutoff.
-- Emits tab-separated rows: check_name<TAB>count.

SELECT 'gate_log_corrected_date_collisions' AS check_name, COUNT(*)::int AS count
FROM (
  SELECT "userId", direction, ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date) AS corrected_business_date, COUNT(*)
  FROM "GateLog"
  GROUP BY "userId", direction, ((("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
  HAVING COUNT(*) > 1
) q;

SELECT 'session_corrected_business_date_collisions' AS check_name, COUNT(*)::int AS count
FROM (
  SELECT "weeklyScheduleId", ((("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date) AS corrected_business_date, COUNT(*)
  FROM "Session"
  WHERE "weeklyScheduleId" IS NOT NULL
  GROUP BY "weeklyScheduleId", ((("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)
  HAVING COUNT(*) > 1
) q;

SELECT 'active_session_teacher_overlaps' AS check_name, COUNT(*)::int AS count
FROM "Session" a
JOIN "Session" b ON a.id < b.id
 AND a."teacherId" = b."teacherId"
 AND a.status IN ('SCHEDULED', 'OPEN')
 AND b.status IN ('SCHEDULED', 'OPEN')
 AND tsrange(a."startsAt", a."endsAt", '[)') && tsrange(b."startsAt", b."endsAt", '[)');

SELECT 'active_session_class_overlaps' AS check_name, COUNT(*)::int AS count
FROM "Session" a
JOIN "Session" b ON a.id < b.id
 AND a."classId" = b."classId"
 AND a.status IN ('SCHEDULED', 'OPEN')
 AND b.status IN ('SCHEDULED', 'OPEN')
 AND tsrange(a."startsAt", a."endsAt", '[)') && tsrange(b."startsAt", b."endsAt", '[)');

SELECT 'active_session_room_overlaps' AS check_name, COUNT(*)::int AS count
FROM "Session" a
JOIN "Session" b ON a.id < b.id
 AND a."roomId" IS NOT NULL
 AND b."roomId" IS NOT NULL
 AND a."roomId" = b."roomId"
 AND a.status IN ('SCHEDULED', 'OPEN')
 AND b.status IN ('SCHEDULED', 'OPEN')
 AND tsrange(a."startsAt", a."endsAt", '[)') && tsrange(b."startsAt", b."endsAt", '[)');

SELECT 'legacy_enrollment_effective_period_overlaps' AS check_name, COUNT(*)::int AS count
FROM "ClassEnrollment" a
JOIN "ClassEnrollment" b ON a.id < b.id
 AND a."studentId" = b."studentId"
 AND daterange(((a."createdAt" AT TIME ZONE 'UTC')::date), 'infinity'::date, '[)') &&
     daterange(((b."createdAt" AT TIME ZONE 'UTC')::date), 'infinity'::date, '[)');

SELECT 'legacy_attendance_without_valid_student' AS check_name, COUNT(*)::int AS count
FROM "StudentAttendance" sa
LEFT JOIN "User" u ON u.id = sa."studentId"
WHERE u.id IS NULL;

SELECT 'legacy_attendance_without_valid_session' AS check_name, COUNT(*)::int AS count
FROM "StudentAttendance" sa
LEFT JOIN "Session" s ON s.id = sa."sessionId"
WHERE s.id IS NULL;

SELECT 'legacy_attendance_invalid_corrected_by' AS check_name, COUNT(*)::int AS count
FROM "StudentAttendance" sa
LEFT JOIN "User" u ON u.id = sa."correctedById"
WHERE sa."correctedById" IS NOT NULL AND u.id IS NULL;

SELECT 'audit_missing_payload_or_hash' AS check_name, COUNT(*)::int AS count
FROM "AuditEntry"
WHERE "canonicalPayload" IS NULL OR "entryHash" IS NULL;

SELECT 'audit_genesis_count_invalid' AS check_name,
  CASE WHEN COUNT(*) = 0 THEN 0 WHEN COUNT(*) FILTER (WHERE "prevHash" IS NULL) = 1 THEN 0 ELSE 1 END::int AS count
FROM "AuditEntry";

SELECT 'audit_duplicate_hashes' AS check_name, COUNT(*)::int AS count
FROM (
  SELECT "entryHash"
  FROM "AuditEntry"
  WHERE "entryHash" IS NOT NULL
  GROUP BY "entryHash"
  HAVING COUNT(*) > 1
) q;

SELECT 'audit_branch_points' AS check_name, COUNT(*)::int AS count
FROM (
  SELECT COALESCE("prevHash", 'GENESIS') AS prev_key
  FROM "AuditEntry"
  GROUP BY COALESCE("prevHash", 'GENESIS')
  HAVING COUNT(*) > 1
) q;

SELECT 'audit_orphans' AS check_name, COUNT(*)::int AS count
FROM "AuditEntry" child
WHERE child."prevHash" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "AuditEntry" parent WHERE parent."entryHash" = child."prevHash");

SELECT 'audit_stale_chain_state' AS check_name, COUNT(*)::int AS count
FROM "AuditChainState" state
WHERE state.id = 1
  AND EXISTS (SELECT 1 FROM "AuditEntry")
  AND (state."lastEntryId" IS NOT NULL OR state."lastHash" IS NOT NULL)
  AND (
    state."lastEntryId" IS DISTINCT FROM (SELECT id FROM "AuditEntry" ORDER BY "createdAt" DESC, id DESC LIMIT 1)
    OR state."lastHash" IS DISTINCT FROM (SELECT "entryHash" FROM "AuditEntry" ORDER BY "createdAt" DESC, id DESC LIMIT 1)
  );
