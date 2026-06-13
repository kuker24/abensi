-- Complete AuthSession operational metadata while preserving existing data.

ALTER TABLE public."AuthSession"
  ADD COLUMN IF NOT EXISTS "createdIp" TEXT,
  ADD COLUMN IF NOT EXISTS "lastIp" TEXT,
  ADD COLUMN IF NOT EXISTS "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);

UPDATE public."AuthSession"
SET
  "createdIp" = COALESCE("createdIp", "requestIp"),
  "lastIp" = COALESCE("lastIp", "requestIp"),
  "issuedAt" = COALESCE("issuedAt", "createdAt"),
  "lastUsedAt" = COALESCE("lastUsedAt", "lastSeenAt");

CREATE INDEX IF NOT EXISTS "AuthSession_lastUsedAt_idx" ON public."AuthSession"("lastUsedAt");
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON public."AuthSession"("expiresAt");
