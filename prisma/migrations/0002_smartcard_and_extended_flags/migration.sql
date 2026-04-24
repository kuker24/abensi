-- Extend reconciliation flag enum for full PRD coverage
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'ANOMALI_BUKA_TANPA_GERBANG';
ALTER TYPE "ReconciliationFlagType" ADD VALUE IF NOT EXISTS 'ALPA';

-- Smart card management table
CREATE TABLE IF NOT EXISTS "SmartCard" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT,
    "note" TEXT,
    "lastTappedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SmartCard_uid_key" ON "SmartCard"("uid");
CREATE UNIQUE INDEX IF NOT EXISTS "SmartCard_userId_key" ON "SmartCard"("userId");
CREATE INDEX IF NOT EXISTS "SmartCard_status_idx" ON "SmartCard"("status");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SmartCard_userId_fkey'
    ) THEN
        ALTER TABLE "SmartCard"
        ADD CONSTRAINT "SmartCard_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
