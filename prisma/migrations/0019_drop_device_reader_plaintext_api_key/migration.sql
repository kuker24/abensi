-- Contract migration after 0015_device_reader_hashed_keys.
-- Compatibility note: Android/reader clients must identify with deviceId/id/API-key value
-- that is verified via apiKeyHash. The plaintext apiKey column is no longer read by API code.

ALTER TABLE "DeviceReader" DROP COLUMN IF EXISTS "apiKey";
