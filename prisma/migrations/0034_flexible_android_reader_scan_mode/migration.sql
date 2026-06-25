-- Add runtime GERBANG scan mode for flexible QR_ANDROID phones.
ALTER TYPE "AndroidReaderMode" ADD VALUE IF NOT EXISTS 'GERBANG';

-- Preserve scanMode for rejected signed scans without storing raw QR payloads/secrets.
ALTER TABLE "RejectedDeviceScan" ADD COLUMN IF NOT EXISTS "scanMode" "AndroidReaderMode";
CREATE INDEX IF NOT EXISTS "RejectedDeviceScan_scanMode_createdAt_idx" ON "RejectedDeviceScan"("scanMode", "createdAt");
