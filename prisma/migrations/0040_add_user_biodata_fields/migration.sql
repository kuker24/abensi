-- PR101E official nullable biodata fields for Android CHECK_ONLY identity display.
-- Committed for review only. Do not apply to production until explicit production migration approval.

ALTER TABLE "User"
  ADD COLUMN "nis" TEXT,
  ADD COLUMN "nip" TEXT,
  ADD COLUMN "birthDate" DATE;
