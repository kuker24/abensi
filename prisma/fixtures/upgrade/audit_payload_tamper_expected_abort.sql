\i prisma/fixtures/upgrade/_base_legacy.sql

-- Topology is valid, but canonicalPayload no longer matches entryHash. 0027
-- topology validation can pass; cryptographic post-verification must fail.
INSERT INTO "AuditEntry" (id, "actorId", "actorRole", module, action, resource, "resourceId", "createdAt", "canonicalPayload", "prevHash", "entryHash", "hashVersion") VALUES
  ('audit_payload_tamper', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.one', 'fixture', 'one', '2026-06-14 00:00:00', '{"action":"tampered"}', NULL, 'cbb171b559714d8f0f100dec2b6f453b52143e88ba90f3d629627e77f834630a', 1);
