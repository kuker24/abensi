\i prisma/fixtures/upgrade/_base_legacy.sql

-- Topology is valid and payload exists, but entryHash is not the digest of the
-- canonical payload. Post-upgrade audit verification must fail.
INSERT INTO "AuditEntry" (id, "actorId", "actorRole", module, action, resource, "resourceId", "createdAt", "canonicalPayload", "prevHash", "entryHash", "hashVersion") VALUES
  ('audit_hash_tamper', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.one', 'fixture', 'one', '2026-06-14 00:00:00', '{"action":"one"}', NULL, 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 1);
