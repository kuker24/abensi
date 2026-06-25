-- QR_ANDROID identity is the physical phone; scan mode is selected at runtime in the APK.
-- Existing HP Gerbang/HP Mushola rows become flexible two-mode scanners on migration deploy.
UPDATE "DeviceReader"
SET "allowedModes" = ARRAY['GERBANG', 'MUSHOLA', 'CHECK_ONLY']::"AndroidReaderMode"[]
WHERE "type" = 'QR_ANDROID';
