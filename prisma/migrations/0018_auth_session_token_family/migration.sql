-- Expand migration: add refresh-token family tracking.
-- Existing sessions are backfilled with their own id as token family.

ALTER TABLE "AuthSession" ADD COLUMN IF NOT EXISTS "tokenFamilyId" TEXT;

UPDATE "AuthSession"
SET "tokenFamilyId" = "id"
WHERE "tokenFamilyId" IS NULL;

CREATE INDEX IF NOT EXISTS "AuthSession_tokenFamilyId_revokedAt_idx"
ON "AuthSession"("tokenFamilyId", "revokedAt");
