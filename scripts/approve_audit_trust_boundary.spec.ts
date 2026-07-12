import { parseAuditTrustBoundaryApprovalArgs } from '../apps/api/src/scripts/approve-audit-trust-boundary.cli';

describe('audit trust-boundary approval CLI wrapper', () => {
  it('uses shared parser with dry-run default', () => {
    expect(parseAuditTrustBoundaryApprovalArgs([
      '--incident-code=AUDIT_CHAIN_INCIDENT',
      '--expected-latest-sequence=964',
      '--expected-last-trusted-sequence=520',
      '--approval-reference=CHG-AUDIT-001'
    ])).toMatchObject({ dryRun: true, confirm: false });
  });
});
