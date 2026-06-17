\i prisma/fixtures/upgrade/_base_legacy.sql

-- No genesis row and the two entries reference each other, so 0027 must abort
-- before any resequencing can rewrite forensic order.
INSERT INTO "AuditEntry" (id, "actorId", "actorRole", module, action, resource, "resourceId", "createdAt", "canonicalPayload", "prevHash", "entryHash", "hashVersion") VALUES
  ('audit_cycle_a', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.one', 'fixture', 'one', '2026-06-14 00:00:00', '{"action":"one"}', '4e861b1e6b5f0430ab4fdc050dadf64794934c9034794a31e61e2c1e0772a5d0', 'cbb171b559714d8f0f100dec2b6f453b52143e88ba90f3d629627e77f834630a', 1),
  ('audit_cycle_b', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.two', 'fixture', 'two', '2026-06-14 00:01:00', '{"action":"two"}', 'cbb171b559714d8f0f100dec2b6f453b52143e88ba90f3d629627e77f834630a', '4e861b1e6b5f0430ab4fdc050dadf64794934c9034794a31e61e2c1e0772a5d0', 1);
