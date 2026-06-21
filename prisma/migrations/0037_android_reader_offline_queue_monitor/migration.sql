-- Additive monitoring fields for Android QR scanner offline queue visibility.
ALTER TABLE "DeviceReader"
  ADD COLUMN "pendingQueueCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastQueueFlushAt" TIMESTAMP(3),
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "currentMode" "AndroidReaderMode",
  ADD COLUMN "batteryLevel" INTEGER,
  ADD COLUMN "networkStatus" TEXT,
  ADD COLUMN "lastStatusMessage" TEXT,
  ADD COLUMN "statusWarnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "DeviceReader_type_lastHeartbeatAt_idx" ON "DeviceReader"("type", "lastHeartbeatAt");
