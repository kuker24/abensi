\i prisma/fixtures/upgrade/_base_legacy.sql

-- These rows collide under the old 0021 backfill and are deleted before
-- GateLogArchive exists. The scenario must fail post-upgrade evidence checks
-- because GateLogDeduplication contains historical duplicate decisions without
-- matching immutable archive rows.
INSERT INTO "GateLog" (id, "userId", direction, "tappedAt", "deviceId", "serverReceivedAt", "signatureVerified") VALUES
  ('gate_prearchive_canonical', 'u_student', 'OUT', '2026-06-14 08:00:00', 'reader-fixture', '2026-06-14 08:00:01', true),
  ('gate_prearchive_deleted', 'u_student', 'OUT', '2026-06-14 09:00:00', 'reader-fixture', '2026-06-14 09:00:01', true);
