import { validateAuditTrustBoundaryLocalDatabaseUrl } from '../../../../scripts/audit_trust_boundary_local_integration';
import { parseSanitizedDatabaseEndpoint } from '../../../../scripts/preflight_production_readiness';

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
});
