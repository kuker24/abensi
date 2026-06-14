\i prisma/fixtures/upgrade/_base_legacy.sql

INSERT INTO "AuditEntry" (id, "actorId", "actorRole", module, action, resource, "resourceId", "createdAt", "canonicalPayload", "prevHash", "entryHash", "hashVersion") VALUES
  ('audit_genesis', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.one', 'fixture', 'one', '2026-06-14 00:00:00', '{"action":"one"}', NULL, 'cbb171b559714d8f0f100dec2b6f453b52143e88ba90f3d629627e77f834630a', 1),
  ('audit_orphan', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.orphan', 'fixture', 'orphan', '2026-06-14 00:01:00', '{"action":"two"}', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '4e861b1e6b5f0430ab4fdc050dadf64794934c9034794a31e61e2c1e0772a5d0', 1);
