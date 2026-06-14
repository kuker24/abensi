\i prisma/fixtures/upgrade/_base_legacy.sql

-- Valid one-entry chain but intentionally stale AuditChainState. The read-only
-- preflight must refuse mutation until operators account for the mismatch.
INSERT INTO "AuditEntry" (id, "actorId", "actorRole", module, action, resource, "resourceId", "createdAt", "canonicalPayload", "prevHash", "entryHash", "hashVersion") VALUES
  ('audit_genesis', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.one', 'fixture', 'one', '2026-06-14 00:00:00', '{"action":"one"}', NULL, 'cbb171b559714d8f0f100dec2b6f453b52143e88ba90f3d629627e77f834630a', 1);

UPDATE "AuditChainState"
SET "lastHash" = 'stale-hash', "lastEntryId" = 'missing-entry', "updatedAt" = '2026-06-14 00:10:00'
WHERE id = 1;
