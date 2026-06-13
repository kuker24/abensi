-- Add privileged developer role and persisted tutorial state.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEVELOPER';

CREATE TABLE IF NOT EXISTS "UserTutorialState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tutorialVersion" TEXT NOT NULL DEFAULT '2026.04',
  "completedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "forceShowAt" TIMESTAMP(3),
  "forceShowById" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserTutorialState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserTutorialState_userId_key" ON "UserTutorialState"("userId");
CREATE INDEX IF NOT EXISTS "UserTutorialState_tutorialVersion_completedAt_idx" ON "UserTutorialState"("tutorialVersion", "completedAt");
CREATE INDEX IF NOT EXISTS "UserTutorialState_forceShowAt_idx" ON "UserTutorialState"("forceShowAt");
CREATE INDEX IF NOT EXISTS "UserTutorialState_forceShowById_idx" ON "UserTutorialState"("forceShowById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserTutorialState_userId_fkey'
  ) THEN
    ALTER TABLE "UserTutorialState"
      ADD CONSTRAINT "UserTutorialState_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserTutorialState_forceShowById_fkey'
  ) THEN
    ALTER TABLE "UserTutorialState"
      ADD CONSTRAINT "UserTutorialState_forceShowById_fkey"
      FOREIGN KEY ("forceShowById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
