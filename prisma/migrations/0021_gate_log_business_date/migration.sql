-- Add Asia/Jakarta business date for gate scan idempotency.
ALTER TABLE "GateLog" ADD COLUMN "businessDate" DATE;

CREATE TABLE IF NOT EXISTS "GateLogDeduplication" (
  "id" TEXT PRIMARY KEY,
  "duplicateGateLogId" TEXT NOT NULL,
  "canonicalGateLogId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "direction" "GateDirection" NOT NULL,
  "decision" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE "GateLog"
SET "businessDate" = ("tappedAt" AT TIME ZONE 'Asia/Jakarta')::date
WHERE "businessDate" IS NULL;

WITH ranked AS (
  SELECT
    "id",
    FIRST_VALUE("id") OVER (
      PARTITION BY "userId", "businessDate", "direction"
      ORDER BY "tappedAt" ASC, "serverReceivedAt" ASC, "id" ASC
    ) AS canonical_id,
    "userId",
    "businessDate",
    "direction",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "businessDate", "direction"
      ORDER BY "tappedAt" ASC, "serverReceivedAt" ASC, "id" ASC
    ) AS rn
  FROM "GateLog"
)
INSERT INTO "GateLogDeduplication" (
  "id",
  "duplicateGateLogId",
  "canonicalGateLogId",
  "userId",
  "businessDate",
  "direction",
  "decision"
)
SELECT
  'gld_' || "id",
  "id",
  canonical_id,
  "userId",
  "businessDate",
  "direction",
  'deleted_duplicate_before_business_date_unique_constraint'
FROM ranked
WHERE rn > 1;

DELETE FROM "GateLog"
WHERE "id" IN (SELECT "duplicateGateLogId" FROM "GateLogDeduplication");

ALTER TABLE "GateLog" ALTER COLUMN "businessDate" SET NOT NULL;

CREATE UNIQUE INDEX "GateLog_userId_businessDate_direction_key"
ON "GateLog"("userId", "businessDate", "direction");

CREATE INDEX "GateLog_businessDate_idx" ON "GateLog"("businessDate");
