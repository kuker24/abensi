-- PR100D account delete with PIN guard.
-- This migration is committed for review only and must not be applied to production
-- until an explicit production migration approval is given.

ALTER TABLE "User"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT,
  ADD COLUMN "archiveReason" TEXT,
  ADD COLUMN "deleteMode" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_active_archivedAt_createdAt_idx" ON "User"("active", "archivedAt", "createdAt");
CREATE INDEX "User_archivedAt_idx" ON "User"("archivedAt");
CREATE INDEX "User_archivedById_archivedAt_idx" ON "User"("archivedById", "archivedAt");

CREATE TABLE "AccountDeleteSecuritySetting" (
  "id" INTEGER NOT NULL,
  "deletePinHash" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountDeleteSecuritySetting_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AccountDeleteSecuritySetting"
  ADD CONSTRAINT "AccountDeleteSecuritySetting_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AccountDeleteSecuritySetting_updatedById_updatedAt_idx"
  ON "AccountDeleteSecuritySetting"("updatedById", "updatedAt");
