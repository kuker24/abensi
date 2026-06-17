\i prisma/fixtures/upgrade/_base_legacy.sql

-- Three scans collapse to one corrected business-date/direction row. One row is
-- historically deduped by legacy 0021 before archives existed; the remaining
-- corrective duplicate must be preserved in GateLogArchive before deletion.
INSERT INTO "GateLog" (id, "userId", direction, "tappedAt", "deviceId", "serverReceivedAt", "signatureVerified", "manualReason") VALUES
  ('gate_archive_canonical', 'u_student_2', 'OUT', '2026-06-14 06:30:00', 'reader-fixture', '2026-06-14 06:30:01', true, NULL),
  ('gate_archive_dup_1', 'u_student_2', 'OUT', '2026-06-14 16:30:00', 'reader-fixture', '2026-06-14 16:30:01', true, NULL),
  ('gate_archive_dup_2', 'u_student_2', 'OUT', '2026-06-14 16:45:00', 'reader-fixture', '2026-06-14 16:45:01', true, 'legacy duplicate evidence');
