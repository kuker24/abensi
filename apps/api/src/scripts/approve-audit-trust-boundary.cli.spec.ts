import { parseAuditTrustBoundaryApprovalArgs } from './approve-audit-trust-boundary.cli';

describe('audit trust-boundary approval CLI parsing', () => {
  const required = [
    '--incident-code=AUDIT_CHAIN_INCIDENT',
    '--expected-latest-sequence=964',
    '--expected-last-trusted-sequence=520',
    '--approval-reference=CHG-AUDIT-001'
  ];

  it('defaults to dry-run without invoking Prisma', () => {
    expect(parseAuditTrustBoundaryApprovalArgs(required)).toEqual({
      incidentCode: 'AUDIT_CHAIN_INCIDENT',
      expectedLatestSequence: 964n,
      expectedLastTrustedSequence: 520n,
      approvalReference: 'CHG-AUDIT-001',
      dryRun: true,
      confirm: false
    });
  });

  it('requires explicit confirmation only for write mode', () => {
    expect(() => parseAuditTrustBoundaryApprovalArgs([...required, '--dry-run=false'])).toThrow('--confirm');
    expect(parseAuditTrustBoundaryApprovalArgs([...required, '--dry-run=false', '--confirm'])).toMatchObject({ dryRun: false, confirm: true });
  });

  it('rejects invalid numeric option before database initialization', () => {
    expect(() => parseAuditTrustBoundaryApprovalArgs([...required.filter((value) => !value.startsWith('--expected-latest-sequence=')), '--expected-latest-sequence=bad'])).toThrow('--expected-latest-sequence');
  });
});
