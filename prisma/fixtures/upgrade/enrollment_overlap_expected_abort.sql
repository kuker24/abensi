\i prisma/fixtures/upgrade/_base_legacy.sql

-- Legacy allowed a student in two classes with overlapping open-ended periods.
-- 0028 backfills effectiveFrom from createdAt; 0029 must abort on overlap.
INSERT INTO "ClassEnrollment" (id, "classId", "studentId", "createdAt") VALUES
  ('enr_student_b_overlap', 'c_b', 'u_student', '2026-06-14 00:00:00');
