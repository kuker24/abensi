-- Enforce active schedule overlap conflicts in PostgreSQL using half-open ranges [startsAt, endsAt).
-- CLOSED and MISSED sessions are historical and intentionally excluded from the active-conflict constraints.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM "Session" a
  JOIN "Session" b ON a."id" < b."id"
   AND a."teacherId" = b."teacherId"
   AND a."status" IN ('SCHEDULED', 'OPEN')
   AND b."status" IN ('SCHEDULED', 'OPEN')
   AND tsrange(a."startsAt", a."endsAt", '[)') && tsrange(b."startsAt", b."endsAt", '[)');
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Cannot add teacher schedule exclusion constraint: % active teacher overlaps exist.', conflict_count;
  END IF;

  SELECT COUNT(*) INTO conflict_count
  FROM "Session" a
  JOIN "Session" b ON a."id" < b."id"
   AND a."classId" = b."classId"
   AND a."status" IN ('SCHEDULED', 'OPEN')
   AND b."status" IN ('SCHEDULED', 'OPEN')
   AND tsrange(a."startsAt", a."endsAt", '[)') && tsrange(b."startsAt", b."endsAt", '[)');
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Cannot add class schedule exclusion constraint: % active class overlaps exist.', conflict_count;
  END IF;

  SELECT COUNT(*) INTO conflict_count
  FROM "Session" a
  JOIN "Session" b ON a."id" < b."id"
   AND a."roomId" IS NOT NULL
   AND b."roomId" IS NOT NULL
   AND a."roomId" = b."roomId"
   AND a."status" IN ('SCHEDULED', 'OPEN')
   AND b."status" IN ('SCHEDULED', 'OPEN')
   AND tsrange(a."startsAt", a."endsAt", '[)') && tsrange(b."startsAt", b."endsAt", '[)');
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Cannot add room schedule exclusion constraint: % active room overlaps exist.', conflict_count;
  END IF;
END $$;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_valid_time_range_chk" CHECK ("endsAt" > "startsAt");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_teacher_active_no_overlap_excl"
  EXCLUDE USING gist (
    "teacherId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" IN ('SCHEDULED', 'OPEN'));

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_class_active_no_overlap_excl"
  EXCLUDE USING gist (
    "classId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" IN ('SCHEDULED', 'OPEN'));

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_room_active_no_overlap_excl"
  EXCLUDE USING gist (
    "roomId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" IN ('SCHEDULED', 'OPEN') AND "roomId" IS NOT NULL);
