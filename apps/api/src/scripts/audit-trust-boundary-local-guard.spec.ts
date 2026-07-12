import {
  createSanitizedLocalIntegrationReport,
  isApprovedConnectedTestServer,
  validateAuditTrustBoundaryLocalDatabaseUrl,
  writeSanitizedLocalIntegrationReport
} from '../../../../scripts/audit_trust_boundary_local_integration';
import { readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACTIVE_SESSION_SCHEDULE_OVERLAPS_SQL,
  createActiveSessionScheduleOverlapCheck,
  parseSanitizedDatabaseEndpoint
} from '../../../../scripts/preflight_production_readiness';
import { GATE_LOG_ARCHIVE_PARITY_SQL } from '../../../../scripts/verify_post_migration';

describe('local audit trust-boundary and preflight endpoint guards', () => {
  it('does not execute destructive integration main while imported and accepts disposable PostgreSQL URL shape', () => {
    expect(validateAuditTrustBoundaryLocalDatabaseUrl('postgresql://user:password@localhost:5432/audit_boundary_test')).toMatchObject({
      ok: true,
      hostname: 'localhost',
      databaseName: 'audit_boundary_test'
    });
  });

  it.each([
    ['host'],
    ['hostaddr'],
    ['service'],
    ['servicefile']
  ])('rejects query routing override %s', (key) => {
    expect(validateAuditTrustBoundaryLocalDatabaseUrl(`postgresql://user:password@localhost:5432/audit_boundary_test?${key}=value`)).toEqual({
      ok: false,
      reason: 'SKIPPED_URL_ROUTING_OVERRIDE_FORBIDDEN'
    });
  });

  it('rejects unknown query parameter and non-disposable database name', () => {
    expect(validateAuditTrustBoundaryLocalDatabaseUrl('postgresql://user:password@localhost:5432/audit_boundary_test?sslrootcert=/tmp/ca')).toEqual({
      ok: false,
      reason: 'SKIPPED_URL_QUERY_PARAMETER_FORBIDDEN'
    });
    expect(validateAuditTrustBoundaryLocalDatabaseUrl('postgresql://user:password@localhost:5432/schoolhub')).toEqual({
      ok: false,
      reason: 'SKIPPED_URL_NOT_APPROVED_LOCAL_TEST_DATABASE'
    });
  });

  it('reports only database endpoint host and port', () => {
    const endpoint = parseSanitizedDatabaseEndpoint('postgresql://username:password@db.example.test:5433/schoolhub?sslmode=require');

    expect(endpoint).toEqual({ host: 'db.example.test', port: 5433 });
    const serialized = JSON.stringify(endpoint);
    expect(serialized).not.toContain('username');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('schoolhub');
    expect(serialized).not.toContain('sslmode');
  });

  it.each([undefined, '', 'not-a-url', 'https://db.example.test/schoolhub', 'postgresql:///schoolhub'])('returns unavailable endpoint sentinel for invalid input', (value) => {
    expect(parseSanitizedDatabaseEndpoint(value)).toBeNull();
  });

  it('accepts Docker bridge server identity only in CI for exact disposable database', () => {
    const target = { serverAddress: '172.18.0.2', serverPort: 5432, databaseName: 'schoolhub_audit_boundary_ci', expectedDatabaseName: 'schoolhub_audit_boundary_ci' };
    expect(isApprovedConnectedTestServer({ ...target, allowCiContainerBridge: true })).toBe(true);
    expect(isApprovedConnectedTestServer({ ...target, allowCiContainerBridge: false })).toBe(false);
    expect(isApprovedConnectedTestServer({ ...target, allowCiContainerBridge: true, databaseName: 'postgres' })).toBe(false);
    expect(isApprovedConnectedTestServer({ ...target, allowCiContainerBridge: true, serverAddress: '203.0.113.10' })).toBe(false);
    expect(isApprovedConnectedTestServer({ ...target, allowCiContainerBridge: true, serverPort: 6432 })).toBe(false);
  });

  it('uses half-open timestamp ranges for teacher, class, and non-null room overlap checks', () => {
    expect(ACTIVE_SESSION_SCHEDULE_OVERLAPS_SQL).not.toContain('tstzrange');
    expect(ACTIVE_SESSION_SCHEDULE_OVERLAPS_SQL.match(/tsrange\(a\."startsAt", a\."endsAt", '\[\)'\)/g)).toHaveLength(3);
    expect(ACTIVE_SESSION_SCHEDULE_OVERLAPS_SQL.match(/tsrange\(b\."startsAt", b\."endsAt", '\[\)'\)/g)).toHaveLength(3);
    expect(ACTIVE_SESSION_SCHEDULE_OVERLAPS_SQL).toContain("status IN ('SCHEDULED', 'OPEN')");
    expect(ACTIVE_SESSION_SCHEDULE_OVERLAPS_SQL).toContain('a."roomId" IS NOT NULL');
    expect(ACTIVE_SESSION_SCHEDULE_OVERLAPS_SQL).toContain('schedule_overlaps');
  });

  it('emits aggregate overlap details without row identifiers or personal data', () => {
    const check = createActiveSessionScheduleOverlapCheck();
    const rows = [
      { scope: 'teacher', count: 1 },
      { scope: 'class', count: 2 },
      { scope: 'room', count: 3 }
    ];

    expect(check.count(rows)).toBe(6);
    expect(check.toDetails(rows)).toEqual([
      { category: 'session_schedule_overlap', scope: 'teacher', count: 1 },
      { category: 'session_schedule_overlap', scope: 'class', count: 2 },
      { category: 'session_schedule_overlap', scope: 'room', count: 3 }
    ]);
    expect(JSON.stringify(check.toDetails(rows))).not.toMatch(/(?:id|name|email|username|payload)/i);
  });

  it('checks archive parity through existing report columns without exposing row identifiers', () => {
    expect(GATE_LOG_ARCHIVE_PARITY_SQL).toContain('report."sourceTable" = \'GateLog\'');
    expect(GATE_LOG_ARCHIVE_PARITY_SQL).toContain('report."rowId" = archive."originalGateLogId"');
    expect(GATE_LOG_ARCHIVE_PARITY_SQL).toContain('report."migrationVersion" = archive."migrationVersion"');
    expect(GATE_LOG_ARCHIVE_PARITY_SQL).not.toMatch(/\b(?:category|details)\b/i);
    expect(GATE_LOG_ARCHIVE_PARITY_SQL).not.toContain('SELECT archive."originalGateLogId"');
  });

  it('writes only sanitized local integration counts and test booleans', () => {
    const report = createSanitizedLocalIntegrationReport('PASS', true, [
      { name: 'migration_empty_database_creates_no_audit_rows', ok: true },
      { name: 'migration_populated_database_preserves_historical_audit_rows_byte_equivalent', ok: true },
      { name: 'concurrent_approval_database_locking', ok: true, detail: 'approved=1;rejected=1' },
      { name: 'local_integration_execution', ok: false, detail: 'postgresql://user:password@localhost:5432/audit_boundary_ci' }
    ]);
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({ status: 'PASS', executed: true, resultCount: 4, passCount: 3, failCount: 1 });
    expect(serialized).toContain('approved=1;rejected=1');
    expect(serialized).not.toContain('postgresql://');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('local_integration_execution","ok":false,"detail');
  });

  it('writes sanitized integration evidence with owner-only permissions', () => {
    const output = resolve('artifacts/integration/audit-trust-boundary-local.json');
    rmSync(output, { force: true });
    const report = createSanitizedLocalIntegrationReport('PASS', true, [
      { name: 'temporary_workspace_cleanup', ok: true }
    ]);

    expect(writeSanitizedLocalIntegrationReport(report)).toBe(output);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(report);
    rmSync(output, { force: true });
  });
});
