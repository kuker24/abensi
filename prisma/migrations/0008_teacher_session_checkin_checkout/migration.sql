-- Explicit teacher classroom check-in/check-out trail per session.
-- Safe additive migration: existing teacher presence rows remain valid.

ALTER TABLE "TeacherSessionPresence"
  ADD COLUMN IF NOT EXISTS "checkInAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkOutAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "checkInLat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkInLng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkOutLat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkOutLng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "checkInById" TEXT,
  ADD COLUMN IF NOT EXISTS "checkOutById" TEXT,
  ADD COLUMN IF NOT EXISTS "earlyCheckoutReason" TEXT;

CREATE INDEX IF NOT EXISTS "TeacherSessionPresence_checkInAt_idx" ON "TeacherSessionPresence"("checkInAt");
CREATE INDEX IF NOT EXISTS "TeacherSessionPresence_checkOutAt_idx" ON "TeacherSessionPresence"("checkOutAt");
CREATE INDEX IF NOT EXISTS "TeacherSessionPresence_teacherId_checkInAt_idx" ON "TeacherSessionPresence"("teacherId", "checkInAt");

-- Backfill explicit timestamps from session open/close history when available.
UPDATE "TeacherSessionPresence" tsp
SET "checkInAt" = s."openedAt"
FROM "Session" s
WHERE tsp."sessionId" = s."id"
  AND tsp."checkInAt" IS NULL
  AND s."openedAt" IS NOT NULL;

UPDATE "TeacherSessionPresence" tsp
SET "checkOutAt" = s."closedAt"
FROM "Session" s
WHERE tsp."sessionId" = s."id"
  AND tsp."checkOutAt" IS NULL
  AND s."closedAt" IS NOT NULL;
