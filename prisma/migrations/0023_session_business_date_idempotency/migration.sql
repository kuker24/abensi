-- Add Jakarta business date to Session and enforce generated-session idempotency.
-- Backfill is derived from startsAt in Asia/Jakarta. The partial unique index
-- applies only to generated sessions that have a weeklyScheduleId.

ALTER TABLE "Session" ADD COLUMN "businessDate" DATE;

UPDATE "Session"
SET "businessDate" = ("startsAt" AT TIME ZONE 'Asia/Jakarta')::date
WHERE "businessDate" IS NULL;

ALTER TABLE "Session" ALTER COLUMN "businessDate" SET NOT NULL;

CREATE INDEX "Session_businessDate_idx" ON "Session"("businessDate");

DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT "weeklyScheduleId", "businessDate", COUNT(*)
    FROM "Session"
    WHERE "weeklyScheduleId" IS NOT NULL
    GROUP BY "weeklyScheduleId", "businessDate"
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Cannot create Session weeklyScheduleId/businessDate uniqueness: % duplicate generated-session groups exist. Resolve and record dedupe decisions before deploying.', duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX "Session_weeklyScheduleId_businessDate_generated_key"
ON "Session" ("weeklyScheduleId", "businessDate")
WHERE "weeklyScheduleId" IS NOT NULL;
