-- Idempotent reader-authenticated gate events and rejected scan monitoring.

ALTER TABLE public."GateLog"
  ADD COLUMN IF NOT EXISTS "deviceEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "deviceTimestamp" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "GateLog_deviceEventId_key" ON public."GateLog"("deviceEventId");
CREATE INDEX IF NOT EXISTS "GateLog_deviceEventId_idx" ON public."GateLog"("deviceEventId");

CREATE TABLE IF NOT EXISTS public."RejectedDeviceScan" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "cardUid" TEXT,
  "direction" public."GateDirection",
  "deviceTimestamp" TIMESTAMP(3),
  "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readerId" TEXT,
  "deviceId" TEXT,
  "nonceHash" TEXT,
  "bodyHash" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RejectedDeviceScan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RejectedDeviceScan_eventId_idx" ON public."RejectedDeviceScan"("eventId");
CREATE INDEX IF NOT EXISTS "RejectedDeviceScan_readerId_createdAt_idx" ON public."RejectedDeviceScan"("readerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RejectedDeviceScan_createdAt_idx" ON public."RejectedDeviceScan"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RejectedDeviceScan_readerId_fkey'
  ) THEN
    ALTER TABLE public."RejectedDeviceScan"
      ADD CONSTRAINT "RejectedDeviceScan_readerId_fkey"
      FOREIGN KEY ("readerId") REFERENCES public."DeviceReader"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE IF EXISTS public."RejectedDeviceScan" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'RejectedDeviceScan'
      AND policyname = 'schoolhub_no_direct_client_access'
  ) THEN
    CREATE POLICY schoolhub_no_direct_client_access ON public."RejectedDeviceScan"
      AS RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false);
  END IF;
END $$;
