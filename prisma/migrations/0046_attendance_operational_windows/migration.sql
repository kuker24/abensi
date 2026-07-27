ALTER TABLE "AttendancePolicy"
  ALTER COLUMN "asharStartTime" SET DEFAULT '15:30',
  ALTER COLUMN "asharEndTime" SET DEFAULT '16:15';

UPDATE "AttendancePolicy"
SET "asharStartTime" = '15:30',
    "asharEndTime" = '16:15'
WHERE "id" = 1;
