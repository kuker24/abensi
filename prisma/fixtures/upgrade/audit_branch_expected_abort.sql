\i prisma/fixtures/upgrade/_base_legacy.sql

INSERT INTO "AuditEntry" (id, "actorId", "actorRole", module, action, resource, "resourceId", "before", "after", "createdAt", "canonicalPayload", "prevHash", "entryHash", "hashVersion") VALUES
  ('audit_genesis', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.one', 'fixture', 'one', NULL, '{"ok":true}', '2026-06-14 00:00:00', '{"action":"one"}', NULL, 'cbb171b559714d8f0f100dec2b6f453b52143e88ba90f3d629627e77f834630a', 1),
  ('audit_branch_left', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.two', 'fixture', 'two', NULL, '{"ok":true}', '2026-06-14 00:01:00', '{"action":"two"}', 'cbb171b559714d8f0f100dec2b6f453b52143e88ba90f3d629627e77f834630a', '4e861b1e6b5f0430ab4fdc050dadf64794934c9034794a31e61e2c1e0772a5d0', 1),
  ('audit_branch_right', 'u_admin', 'ADMIN_TU', 'fixture', 'fixture.tampered', 'fixture', 'three', NULL, '{"ok":true}', '2026-06-14 00:02:00', '{"action":"tampered"}', 'cbb171b559714d8f0f100dec2b6f453b52143e88ba90f3d629627e77f834630a', 'ef147c7abdf9c8e9c8b51f20dcef37a50270dade64b1b8912fbed434927b43c8', 1);
