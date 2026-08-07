-- Extend Mode Pulang Cepat scope so KAMAD can include students.
ALTER TABLE "EarlyCheckoutEmergency"
  ADD COLUMN "includeStudents" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "EarlyCheckoutEmergency"
  DROP CONSTRAINT "EarlyCheckoutEmergency_scope_check";

ALTER TABLE "EarlyCheckoutEmergency"
  ADD CONSTRAINT "EarlyCheckoutEmergency_scope_check"
  CHECK (
    "includeTeachers"
    OR "includeLeadership"
    OR "includeStaff"
    OR "includeStudents"
  );
