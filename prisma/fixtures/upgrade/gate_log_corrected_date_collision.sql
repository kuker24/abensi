\i prisma/fixtures/upgrade/_base_legacy.sql

-- These two UTC-naive timestamps have different legacy 0021 business dates but
-- the same corrected Asia/Jakarta business date, so 0026 must archive exactly
-- one duplicate and retain the canonical row.
INSERT INTO "GateLog" (id, "userId", direction, "tappedAt", "deviceId", "serverReceivedAt", "signatureVerified") VALUES
  ('gate_corrected_collision_a', 'u_student', 'OUT', '2026-06-14 06:30:00', 'reader-fixture', '2026-06-14 06:30:01', true),
  ('gate_corrected_collision_b', 'u_student', 'OUT', '2026-06-14 16:30:00', 'reader-fixture', '2026-06-14 16:30:01', true);
