-- Correct legacy Asia/Jakarta businessDate backfills for UTC-naive timestamps.
-- Old migrations interpreted TIMESTAMP WITHOUT TIME ZONE values as Jakarta local
-- time. The application stores these timestamps as UTC-naive, so conversion must
-- be: ((timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date.

CREATE TABLE "BusinessDateBackfillReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "migrationVersion" TEXT NOT NULL,
  "sourceTable" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "observedTimestamp" TIMESTAMP(3) NOT NULL,
  "currentBusinessDate" DATE,
  "correctedBusinessDate" DATE NOT NULL,
  "dateChanged" BOOLEAN NOT NULL,
  "duplicateGroupBefore" JSONB NOT NULL,
  "duplicateGroupAfter" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "BusinessDateBackfillReport_migrationVersion_sourceTable_rowId_key"
ON "BusinessDateBackfillReport"("migrationVersion", "sourceTable", "rowId");
CREATE INDEX "BusinessDateBackfillReport_sourceTable_dateChanged_idx" ON "BusinessDateBackfillReport"("sourceTable", "dateChanged");
CREATE INDEX "BusinessDateBackfillReport_migrationVersion_idx" ON "BusinessDateBackfillReport"("migrationVersion");

DO $$
DECLARE
  migration_version CONSTANT TEXT := '0026_correct_jakarta_business_dates';
  gate_examined INTEGER := 0;
  gate_corrected INTEGER := 0;
  gate_unchanged INTEGER := 0;
  gate_collision_groups INTEGER := 0;
  gate_archived INTEGER := 0;
  gate_retained INTEGER := 0;
  historical_minimal_dedupe INTEGER := 0;
  session_examined INTEGER := 0;
  session_corrected INTEGER := 0;
  session_unchanged INTEGER := 0;
  session_collision_groups INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO historical_minimal_dedupe FROM "GateLogDeduplication";

  WITH gate_report AS (
    SELECT
      g."id",
      g."tappedAt",
      g."businessDate" AS current_business_date,
      ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date AS corrected_business_date,
      COUNT(*) OVER (PARTITION BY g."userId", g."businessDate", g."direction") AS before_count,
      COUNT(*) OVER (PARTITION BY g."userId", ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date, g."direction") AS after_count,
      g."userId",
      g."direction"
    FROM "GateLog" g
  )
  INSERT INTO "BusinessDateBackfillReport" (
    "id", "migrationVersion", "sourceTable", "rowId", "observedTimestamp",
    "currentBusinessDate", "correctedBusinessDate", "dateChanged",
    "duplicateGroupBefore", "duplicateGroupAfter"
  )
  SELECT
    'bdbr_' || migration_version || '_GateLog_' || "id",
    migration_version,
    'GateLog',
    "id",
    "tappedAt",
    current_business_date,
    corrected_business_date,
    current_business_date IS DISTINCT FROM corrected_business_date,
    jsonb_build_object('userId', "userId", 'businessDate', current_business_date, 'direction', "direction", 'count', before_count),
    jsonb_build_object('userId', "userId", 'businessDate', corrected_business_date, 'direction', "direction", 'count', after_count)
  FROM gate_report
  ON CONFLICT ("migrationVersion", "sourceTable", "rowId") DO UPDATE SET
    "observedTimestamp" = EXCLUDED."observedTimestamp",
    "currentBusinessDate" = EXCLUDED."currentBusinessDate",
    "correctedBusinessDate" = EXCLUDED."correctedBusinessDate",
    "dateChanged" = EXCLUDED."dateChanged",
    "duplicateGroupBefore" = EXCLUDED."duplicateGroupBefore",
    "duplicateGroupAfter" = EXCLUDED."duplicateGroupAfter";

  WITH session_report AS (
    SELECT
      s."id",
      s."startsAt",
      s."businessDate" AS current_business_date,
      ((s."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date AS corrected_business_date,
      COUNT(*) OVER (PARTITION BY s."weeklyScheduleId", s."businessDate") AS before_count,
      COUNT(*) OVER (PARTITION BY s."weeklyScheduleId", ((s."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date) AS after_count,
      s."weeklyScheduleId"
    FROM "Session" s
    WHERE s."weeklyScheduleId" IS NOT NULL
  )
  INSERT INTO "BusinessDateBackfillReport" (
    "id", "migrationVersion", "sourceTable", "rowId", "observedTimestamp",
    "currentBusinessDate", "correctedBusinessDate", "dateChanged",
    "duplicateGroupBefore", "duplicateGroupAfter"
  )
  SELECT
    'bdbr_' || migration_version || '_Session_' || "id",
    migration_version,
    'Session',
    "id",
    "startsAt",
    current_business_date,
    corrected_business_date,
    current_business_date IS DISTINCT FROM corrected_business_date,
    jsonb_build_object('weeklyScheduleId', "weeklyScheduleId", 'businessDate', current_business_date, 'count', before_count),
    jsonb_build_object('weeklyScheduleId', "weeklyScheduleId", 'businessDate', corrected_business_date, 'count', after_count)
  FROM session_report
  ON CONFLICT ("migrationVersion", "sourceTable", "rowId") DO UPDATE SET
    "observedTimestamp" = EXCLUDED."observedTimestamp",
    "currentBusinessDate" = EXCLUDED."currentBusinessDate",
    "correctedBusinessDate" = EXCLUDED."correctedBusinessDate",
    "dateChanged" = EXCLUDED."dateChanged",
    "duplicateGroupBefore" = EXCLUDED."duplicateGroupBefore",
    "duplicateGroupAfter" = EXCLUDED."duplicateGroupAfter";

  SELECT COUNT(*), COUNT(*) FILTER (WHERE "dateChanged"), COUNT(*) FILTER (WHERE NOT "dateChanged")
  INTO gate_examined, gate_corrected, gate_unchanged
  FROM "BusinessDateBackfillReport"
  WHERE "migrationVersion" = migration_version AND "sourceTable" = 'GateLog';

  SELECT COUNT(*), COUNT(*) FILTER (WHERE "dateChanged"), COUNT(*) FILTER (WHERE NOT "dateChanged")
  INTO session_examined, session_corrected, session_unchanged
  FROM "BusinessDateBackfillReport"
  WHERE "migrationVersion" = migration_version AND "sourceTable" = 'Session';

  SELECT COUNT(*) INTO session_collision_groups
  FROM (
    SELECT "weeklyScheduleId", (("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date AS corrected_business_date, COUNT(*)
    FROM "Session"
    WHERE "weeklyScheduleId" IS NOT NULL
    GROUP BY "weeklyScheduleId", corrected_business_date
    HAVING COUNT(*) > 1
  ) collisions;

  IF session_collision_groups > 0 THEN
    RAISE EXCEPTION 'Session businessDate correction would create % generated-session duplicate group(s). Review BusinessDateBackfillReport and dedupe with a separate approved plan before retrying.', session_collision_groups;
  END IF;

  SELECT COUNT(*) INTO gate_collision_groups
  FROM (
    SELECT "userId", (("tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date AS corrected_business_date, "direction", COUNT(*)
    FROM "GateLog"
    GROUP BY "userId", corrected_business_date, "direction"
    HAVING COUNT(*) > 1
  ) collisions;

  DROP INDEX IF EXISTS "GateLog_userId_businessDate_direction_key";
  DROP INDEX IF EXISTS "Session_weeklyScheduleId_businessDate_generated_key";

  WITH corrected AS (
    SELECT
      g.*,
      to_jsonb(g) AS original_row,
      ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date AS corrected_business_date,
      FIRST_VALUE(g."id") OVER (
        PARTITION BY g."userId", ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date, g."direction"
        ORDER BY g."tappedAt" ASC, g."serverReceivedAt" ASC, g."id" ASC
      ) AS canonical_id,
      ROW_NUMBER() OVER (
        PARTITION BY g."userId", ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date, g."direction"
        ORDER BY g."tappedAt" ASC, g."serverReceivedAt" ASC, g."id" ASC
      ) AS rn
    FROM "GateLog" g
  )
  INSERT INTO "GateLogArchive" (
    "id", "originalGateLogId", "canonicalGateLogId", "userId", "direction",
    "originalBusinessDate", "correctedBusinessDate", "tappedAt", "serverReceivedAt",
    "deviceId", "readerId", "cardId", "qrCredentialId", "scanMode", "appVersion",
    "signatureVerified", "deviceEventId", "deviceTimestamp", "nonceHash", "bodyHash",
    "manualReason", "createdById", "usedOverrideId", "completeOriginalRow",
    "dedupeReason", "migrationVersion"
  )
  SELECT
    'gla_' || migration_version || '_' || "id",
    "id",
    canonical_id,
    "userId",
    "direction",
    "businessDate",
    corrected_business_date,
    "tappedAt",
    "serverReceivedAt",
    "deviceId",
    "readerId",
    "cardId",
    "qrCredentialId",
    "scanMode",
    "appVersion",
    "signatureVerified",
    "deviceEventId",
    "deviceTimestamp",
    "nonceHash",
    "bodyHash",
    "manualReason",
    "createdById",
    "usedOverrideId",
    original_row,
    'corrected_business_date_duplicate',
    migration_version
  FROM corrected
  WHERE rn > 1
  ON CONFLICT ("originalGateLogId") DO NOTHING;
  GET DIAGNOSTICS gate_archived = ROW_COUNT;

  WITH corrected AS (
    SELECT
      g."id",
      ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date AS corrected_business_date,
      FIRST_VALUE(g."id") OVER (
        PARTITION BY g."userId", ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date, g."direction"
        ORDER BY g."tappedAt" ASC, g."serverReceivedAt" ASC, g."id" ASC
      ) AS canonical_id,
      ROW_NUMBER() OVER (
        PARTITION BY g."userId", ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date, g."direction"
        ORDER BY g."tappedAt" ASC, g."serverReceivedAt" ASC, g."id" ASC
      ) AS rn,
      g."userId",
      g."direction"
    FROM "GateLog" g
  )
  INSERT INTO "GateLogDeduplication" ("id", "duplicateGateLogId", "canonicalGateLogId", "userId", "businessDate", "direction", "decision")
  SELECT
    'gld_' || migration_version || '_' || "id",
    "id",
    canonical_id,
    "userId",
    corrected_business_date,
    "direction",
    'archived_duplicate_after_corrected_business_date'
  FROM corrected
  WHERE rn > 1
  ON CONFLICT ("id") DO NOTHING;

  WITH corrected AS (
    SELECT
      g."id",
      ROW_NUMBER() OVER (
        PARTITION BY g."userId", ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date, g."direction"
        ORDER BY g."tappedAt" ASC, g."serverReceivedAt" ASC, g."id" ASC
      ) AS rn
    FROM "GateLog" g
  )
  DELETE FROM "GateLog" g
  USING corrected c
  WHERE g."id" = c."id"
    AND c.rn > 1
    AND EXISTS (SELECT 1 FROM "GateLogArchive" a WHERE a."originalGateLogId" = g."id");

  UPDATE "GateLog" g
  SET "businessDate" = ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date
  WHERE g."businessDate" IS DISTINCT FROM ((g."tappedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date;

  UPDATE "Session" s
  SET "businessDate" = ((s."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date
  WHERE s."businessDate" IS DISTINCT FROM ((s."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date;

  CREATE UNIQUE INDEX "GateLog_userId_businessDate_direction_key"
  ON "GateLog"("userId", "businessDate", "direction");

  CREATE UNIQUE INDEX "Session_weeklyScheduleId_businessDate_generated_key"
  ON "Session" ("weeklyScheduleId", "businessDate")
  WHERE "weeklyScheduleId" IS NOT NULL;

  SELECT COUNT(*) INTO gate_retained FROM "GateLog";

  RAISE NOTICE 'BusinessDate correction %: GateLog examined=%, corrected=%, unchanged=%, collisionGroups=%, archivedDuplicates=%, retainedCanonicalOrUnique=%, priorMinimalDedupeRows=%',
    migration_version, gate_examined, gate_corrected, gate_unchanged, gate_collision_groups, gate_archived, gate_retained, historical_minimal_dedupe;
  RAISE NOTICE 'BusinessDate correction %: Session examined=%, corrected=%, unchanged=%, collisionGroups=%',
    migration_version, session_examined, session_corrected, session_unchanged, session_collision_groups;
END $$;
