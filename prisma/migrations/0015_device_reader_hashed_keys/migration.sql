-- Store reader API identifiers as hashes only. Existing plaintext apiKey values are
-- converted to SHA-256 hashes and then removed. Reader HMAC secrets remain in
-- readerSecretCiphertext and are returned only once by provisioning/rotation APIs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public."DeviceReader"
  ADD COLUMN IF NOT EXISTS "apiKeyHash" TEXT,
  ADD COLUMN IF NOT EXISTS "keyPrefix" TEXT,
  ADD COLUMN IF NOT EXISTS "keyLast4" TEXT,
  ADD COLUMN IF NOT EXISTS "keyRotatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

UPDATE public."DeviceReader"
SET
  "apiKeyHash" = encode(digest("apiKey", 'sha256'), 'hex'),
  "keyPrefix" = left("apiKey", 7),
  "keyLast4" = right("apiKey", 4),
  "keyRotatedAt" = COALESCE("readerSecretRotatedAt", "updatedAt", "createdAt")
WHERE "apiKey" IS NOT NULL
  AND "apiKeyHash" IS NULL;

ALTER TABLE public."DeviceReader"
  ALTER COLUMN "apiKey" DROP NOT NULL;

UPDATE public."DeviceReader"
SET "apiKey" = NULL
WHERE "apiKey" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceReader_apiKeyHash_key" ON public."DeviceReader"("apiKeyHash");
CREATE INDEX IF NOT EXISTS "DeviceReader_keyPrefix_idx" ON public."DeviceReader"("keyPrefix");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DeviceReader_updatedById_fkey'
  ) THEN
    ALTER TABLE public."DeviceReader"
      ADD CONSTRAINT "DeviceReader_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
