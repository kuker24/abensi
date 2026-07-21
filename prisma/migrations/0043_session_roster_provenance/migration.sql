-- Persist whether a session roster is authoritative before historical reconciliation.
-- Existing attendance and SessionRoster rows remain unchanged.
CREATE TYPE "SessionRosterState" AS ENUM (
  'PENDING',
  'VERIFIED',
  'BACKFILLED_UNVERIFIED',
  'LEGACY_ROSTER_MISSING'
);

ALTER TABLE "Session"
  ADD COLUMN "rosterState" "SessionRosterState" NOT NULL DEFAULT 'PENDING';

UPDATE "Session" AS s
SET "rosterState" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "SessionRoster" AS roster
    WHERE roster."sessionId" = s."id"
      AND roster."captureSource" = 'BACKFILL'::"RosterCaptureSource"
  ) THEN 'BACKFILLED_UNVERIFIED'::"SessionRosterState"
  WHEN EXISTS (
    SELECT 1
    FROM "SessionRoster" AS roster
    WHERE roster."sessionId" = s."id"
  ) THEN 'VERIFIED'::"SessionRosterState"
  WHEN s."status" = 'SCHEDULED'::"SessionStatus"
    THEN 'PENDING'::"SessionRosterState"
  ELSE 'LEGACY_ROSTER_MISSING'::"SessionRosterState"
END;

CREATE INDEX "Session_rosterState_status_reconciledAt_idx"
  ON "Session"("rosterState", "status", "reconciledAt");
