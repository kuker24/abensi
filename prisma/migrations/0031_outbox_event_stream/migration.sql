CREATE TABLE IF NOT EXISTS "OutboxEvent" (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  payload JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "OutboxEvent_topic_createdAt_idx" ON "OutboxEvent" (topic, "createdAt");
CREATE INDEX IF NOT EXISTS "OutboxEvent_publishedAt_idx" ON "OutboxEvent" ("publishedAt");
