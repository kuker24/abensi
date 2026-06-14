-- Add publish/claim state for the transactional outbox.
-- Existing events remain pending and replayable; no historical event is deleted.

ALTER TABLE "OutboxEvent"
  ADD COLUMN IF NOT EXISTS "aggregateType" TEXT,
  ADD COLUMN IF NOT EXISTS "aggregateId" TEXT,
  ADD COLUMN IF NOT EXISTS "logicalKey" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "lastError" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedStreamId" TEXT,
  ADD COLUMN IF NOT EXISTS "dlqAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OutboxEvent_status_chk'
  ) THEN
    ALTER TABLE "OutboxEvent"
      ADD CONSTRAINT "OutboxEvent_status_chk"
      CHECK ("status" IN ('PENDING', 'PUBLISHING', 'PUBLISHED', 'RETRY', 'DLQ'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "OutboxEvent_logicalKey_key" ON "OutboxEvent"("logicalKey") WHERE "logicalKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "OutboxEvent_status_lockedAt_createdAt_idx" ON "OutboxEvent"("status", "lockedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_dlqAt_idx" ON "OutboxEvent"("dlqAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_aggregate_createdAt_idx" ON "OutboxEvent"("aggregateType", "aggregateId", "createdAt");
