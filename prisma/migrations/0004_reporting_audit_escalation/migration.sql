DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EscalationStatus') THEN
    CREATE TYPE "EscalationStatus" AS ENUM ('QUEUED', 'CLOSED');
  END IF;
END $$;

ALTER TABLE "AuditEntry"
ADD COLUMN IF NOT EXISTS "actorRole" "Role",
ADD COLUMN IF NOT EXISTS "module" TEXT,
ADD COLUMN IF NOT EXISTS "reason" TEXT,
ADD COLUMN IF NOT EXISTS "requestIp" TEXT,
ADD COLUMN IF NOT EXISTS "requestDevice" TEXT;

UPDATE "AuditEntry"
SET "module" = split_part("action", '.', 1)
WHERE "module" IS NULL
  AND position('.' IN "action") > 0;

CREATE TABLE IF NOT EXISTS "ReconciliationEscalation" (
  "id" TEXT NOT NULL,
  "flagId" TEXT NOT NULL,
  "status" "EscalationStatus" NOT NULL DEFAULT 'QUEUED',
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "closedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),

  CONSTRAINT "ReconciliationEscalation_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationEscalation_flagId_fkey'
  ) THEN
    ALTER TABLE "ReconciliationEscalation"
    ADD CONSTRAINT "ReconciliationEscalation_flagId_fkey"
    FOREIGN KEY ("flagId") REFERENCES "ReconciliationFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationEscalation_createdById_fkey'
  ) THEN
    ALTER TABLE "ReconciliationEscalation"
    ADD CONSTRAINT "ReconciliationEscalation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReconciliationEscalation_closedById_fkey'
  ) THEN
    ALTER TABLE "ReconciliationEscalation"
    ADD CONSTRAINT "ReconciliationEscalation_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ReconciliationEscalation_flagId_status_idx"
  ON "ReconciliationEscalation"("flagId", "status");
CREATE INDEX IF NOT EXISTS "ReconciliationEscalation_createdAt_idx"
  ON "ReconciliationEscalation"("createdAt");

CREATE INDEX IF NOT EXISTS "AuditEntry_actorId_createdAt_idx"
  ON "AuditEntry"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEntry_module_createdAt_idx"
  ON "AuditEntry"("module", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEntry_action_createdAt_idx"
  ON "AuditEntry"("action", "createdAt");
